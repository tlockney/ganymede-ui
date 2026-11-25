// Switching backends right after an edit keeps it (#792): the sheet saves
// the open notebook before it connects, a save that fails stops the
// switch with a choice, and the old backend's services stay until the
// closed notebook's last save is done. Through the contents API, without
// the server's rooms, which hold every edit live and save it themselves.
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { FIXTURE, ROOT_DIR } from './env';
import { openNotebook, openWithToken, removeFromServer } from './helpers';

const FILE = 'Switch with edits.ipynb';
const onDisk = () => readFileSync(join(ROOT_DIR, FILE), 'utf8');

test.afterEach(() => removeFromServer(FILE));

/** Opens FILE without a room and types `marker` at the end of its first code cell. */
async function edit(page: Page, marker: string) {
  await page.route('**/api/collaboration/session/**', route => route.fulfill({ status: 404 }));
  copyFileSync(join(ROOT_DIR, FIXTURE), join(ROOT_DIR, FILE));
  await openWithToken(page);
  await openNotebook(page, FILE);
  await page.locator('.jp-CodeCell .cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(`\n${marker}`);
  await expect(page.getByText('— Edited')).toBeVisible();
}

/** The sidebar's backend button, then the browser's kernels. */
async function switchToBrowser(page: Page) {
  await page
    .locator('.sidebar')
    .getByRole('button', { name: /^Ganymede/ })
    .click();
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
}

test('an edit made just before switching backends is on disk', async ({ page }) => {
  const marker = `// switched-${Date.now()}`;
  await edit(page, marker);
  expect(onDisk()).not.toContain(marker);

  await switchToBrowser(page);
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
  expect(onDisk()).toContain(marker);
});

test('a save that fails stops the switch until the person chooses', async ({ page }) => {
  const marker = `// kept-${Date.now()}`;
  await edit(page, marker);
  const failSaves = (route: import('@playwright/test').Route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, body: '{"message":"Disk full"}' })
      : route.fallback();
  await page.route('**/api/contents/**', failSaves);

  await switchToBrowser(page);
  const alert = page.getByRole('alert').filter({ hasText: 'Switching closes it' });
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Keep Editing' }).click();

  // Still on the server, with the edit and why the save failed.
  await expect(page.getByRole('heading', { name: 'Where should kernels run?' })).toHaveCount(0);
  await expect(page.locator('.jp-CodeCell .cm-content').first()).toContainText(marker);
  await expect(page.getByText(/Disk full/)).toBeVisible();
  expect(onDisk()).not.toContain(marker);

  // Once saves go through again, the switch saves first.
  await page.unroute('**/api/contents/**', failSaves);
  await switchToBrowser(page);
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
  expect(onDisk()).toContain(marker);
});
