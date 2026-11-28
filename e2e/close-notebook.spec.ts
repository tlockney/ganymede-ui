// Closing or replacing a notebook right after an edit saves first (#808):
// opening another notebook in the sidebar saves the open notebook first, and
// a failed save stops closing with Keep Editing, Download a Copy, and Switch
// Without Saving before leaving the edits behind.
import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page, type Route } from '@playwright/test';
import { FIXTURE, ROOT_DIR } from './env';
import { openNotebook, openWithToken, removeFromServer, sidebarItem, statusLine } from './helpers';

const FIRST = 'Close with edits.ipynb';
const SECOND = 'Close target.ipynb';
const onDisk = (file: string) => readFileSync(join(ROOT_DIR, file), 'utf8');

test.afterEach(() => {
  removeFromServer(FIRST);
  removeFromServer(SECOND);
});

/** Opens FIRST without a room and types `marker` at the end of its first code cell. */
async function setupAndEdit(page: Page, marker: string) {
  await page.route('**/api/collaboration/session/**', route => route.fulfill({ status: 404 }));
  copyFileSync(join(ROOT_DIR, FIXTURE), join(ROOT_DIR, FIRST));
  copyFileSync(join(ROOT_DIR, FIXTURE), join(ROOT_DIR, SECOND));
  await openWithToken(page);
  await openNotebook(page, FIRST);
  await page.locator('.jp-CodeCell .cm-content').first().click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(`\n${marker}`);
  await expect(statusLine(page)).toHaveAccessibleName(/^Edited · /);
}

test('an edit made just before opening another notebook is saved on disk', async ({ page }) => {
  const marker = `// closed-saved-${Date.now()}`;
  await setupAndEdit(page, marker);
  expect(onDisk(FIRST)).not.toContain(marker);

  await sidebarItem(page, SECOND.replace(/\.ipynb$/, '')).click();
  await expect(page).toHaveURL(/open=Close(\+|%20)target\.ipynb/);
  expect(onDisk(FIRST)).toContain(marker);
});

test('a save that fails stops closing with Keep Editing, Download a Copy, and Switch Without Saving', async ({
  page,
}) => {
  const marker = `// closed-failed-${Date.now()}`;
  await setupAndEdit(page, marker);
  const failSaves = (route: Route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, body: '{"message":"Disk full"}' })
      : route.fallback();
  await page.route('**/api/contents/**', failSaves);

  await sidebarItem(page, SECOND.replace(/\.ipynb$/, '')).click();
  const dialog = page.getByRole('dialog', { name: 'Unsaved edits' });
  const alert = dialog.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText(`Couldn’t save “${FIRST}”`);
  // First notebook stays open behind the sheet until chosen.
  await expect(page.locator('.jp-CodeCell .cm-content').first()).toContainText(marker);

  await alert.getByRole('button', { name: 'Keep Editing' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.jp-CodeCell .cm-content').first()).toContainText(marker);
  await expect(page.getByText(/Disk full/)).toBeVisible();
  expect(onDisk(FIRST)).not.toContain(marker);

  // Trigger again, download a copy (stays on sheet), then Switch Without Saving.
  await sidebarItem(page, SECOND.replace(/\.ipynb$/, '')).click();
  await expect(alert).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await alert.getByRole('button', { name: 'Download a Copy' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(FIRST);
  await expect(alert).toBeVisible();

  await alert.getByRole('button', { name: 'Switch Without Saving' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.jp-CodeCell .cm-content').first()).not.toContainText(marker);
  expect(onDisk(FIRST)).not.toContain(marker);
});
