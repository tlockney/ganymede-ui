// Local recovery copy (#808): edits that could not be persisted (failed save,
// offline editing, or process termination / reload before save) are captured
// in per-origin IndexedDB, offered in a non-blocking banner on next open, and
// restored or discarded cleanly.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Route } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openNotebook, openWithToken, removeFromServer, statusLine } from './helpers';

const NOTEBOOK = 'Local Recovery E2E.ipynb';
const FILE = join(ROOT_DIR, NOTEBOOK);

function seedNotebook(source = 'const baseline = 1;') {
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: 'cdp-node', display_name: 'JavaScript (Node)', language: 'javascript' },
    },
    cells: [
      {
        cell_type: 'code',
        id: 'local-rec-1',
        metadata: {},
        execution_count: null,
        outputs: [],
        source,
      },
    ],
  };
  writeFileSync(FILE, JSON.stringify(nb, null, 1) + '\n');
}

test.afterEach(async ({ page }) => {
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('about:blank').catch(() => {});
  await removeFromServer(NOTEBOOK);
});

test('captures unsaved edits locally when persistence fails, offers banner after reload, and restores them (#808)', async ({
  page,
}) => {
  seedNotebook();
  // Use contents-API mode (no live room) so edits remain unsaved until explicit save/autosave.
  await page.route('**/api/collaboration/session/**', route => route.fulfill({ status: 404 }));
  const failPut = (route: Route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({ status: 500, body: '{"message":"Disk full"}' })
      : route.fallback();
  await page.route('**/api/contents/**', failPut);

  await openWithToken(page);
  await openNotebook(page, NOTEBOOK);

  const marker = `const localRecovered = ${Date.now()};`;
  const editor = page.locator('.jp-CodeCell .cm-content').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(`\n${marker}`);
  await expect(statusLine(page)).toHaveAccessibleName(/^Edited · /);

  // Trigger a save that fails: should immediately persist the local recovery copy in IndexedDB.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText(/Disk full/)).toBeVisible();
  expect(readFileSync(FILE, 'utf8')).not.toContain(marker);

  // Unblock saves and reload the page (simulating WebKit content-process termination / reload).
  await page.unroute('**/api/contents/**', failPut);
  page.once('dialog', dialog => void dialog.accept());
  await page.reload();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();

  // The reloaded notebook has disk content, and offers the non-blocking local recovery banner.
  await expect(editor).not.toContainText(marker);
  const banner = page.locator('.recovery-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('Local unsaved copy');

  await banner.getByRole('button', { name: 'Review Copy…' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(marker);

  await dialog.getByRole('button', { name: 'Restore Copy' }).click();
  await expect(dialog).toBeHidden();
  await expect(banner).toBeHidden();
  await expect(editor).toContainText(marker);
  expect(readFileSync(FILE, 'utf8')).toContain(marker);

  // Reloading again confirms the local copy was cleared and no banner reappears.
  await page.reload();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(editor).toContainText(marker);
  await expect(banner).toHaveCount(0);
});

test('discards a local recovery copy from the banner and does not show a banner after normal save (#808)', async ({
  page,
}) => {
  seedNotebook();
  await page.route('**/api/collaboration/session/**', route => route.fulfill({ status: 404 }));

  await openWithToken(page);
  await openNotebook(page, NOTEBOOK);

  // Make an edit and wait for the debounced local recovery snapshot (~1.5s), then reload without saving.
  const editor = page.locator('.jp-CodeCell .cm-content').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nconst unsavedBeforeCrash = 777;');
  await expect(statusLine(page)).toHaveAccessibleName(/^Edited · /);
  // Wait for debounced IndexedDB capture (1500ms + margin).
  await page.waitForTimeout(2_000);

  page.once('dialog', dialog => void dialog.accept());
  await page.reload();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();

  const banner = page.locator('.recovery-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('Local unsaved copy');

  await banner.getByRole('button', { name: 'Discard' }).click();
  await expect(banner).toBeHidden();

  // Reloading again shows no banner.
  await page.reload();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(banner).toHaveCount(0);

  // Now edit, save cleanly with Cmd/Ctrl+S, and reload -> no local recovery banner.
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nconst cleanlySaved = 888;');
  await expect(statusLine(page)).toHaveAccessibleName(/^Edited · /);
  await page.waitForTimeout(2_000);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(statusLine(page)).toHaveAccessibleName(/^Saved /);

  await page.reload();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(editor).toContainText('cleanlySaved = 888');
  await expect(banner).toHaveCount(0);
});
