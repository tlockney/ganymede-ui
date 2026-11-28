import { chmodSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import {
  clearRecoveryCopies,
  openNotebook,
  openWithToken,
  removeFromServer,
  sidebarItem,
  statusLine,
} from './helpers';

const NOTEBOOK = 'Recovery E2E.ipynb';
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
        id: 'rec-cell-1',
        metadata: {},
        execution_count: null,
        outputs: [],
        source,
      },
    ],
  };
  writeFileSync(FILE, JSON.stringify(nb, null, 1) + '\n');
}

async function listCopies(
  path: string,
): Promise<Array<{ id: string; reason: string; cells: string[] }>> {
  const res = await fetch(
    `${GANYMEDE_URL}/api/collaboration/recovery?path=${encodeURIComponent(path)}&token=${TOKEN}`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as {
    copies?: Array<{ id: string; reason: string; cells: string[] }>;
  };
  return body.copies ?? [];
}

test.beforeEach(async () => {
  await clearRecoveryCopies(NOTEBOOK);
});

test.afterEach(async ({ page }) => {
  page.on('dialog', dialog => void dialog.accept());
  await page.goto('about:blank').catch(() => {});
  try {
    chmodSync(FILE, 0o644);
  } catch {
    // Ignore if deleted.
  }
  await removeFromServer(NOTEBOOK);
});

test('shows Save needs attention on save failure, keeps a copy across reopen, and restores it (#831)', async ({
  page,
  request,
}) => {
  seedNotebook();
  const joined = page.waitForEvent('websocket', ws =>
    ws.url().includes('/api/collaboration/room/json:notebook:'),
  );
  await openWithToken(page);
  await expect(sidebarItem(page, 'Recovery E2E')).toBeVisible();
  await openNotebook(page, NOTEBOOK);
  await joined;

  // Read-only file triggers save failure in the live room.
  chmodSync(FILE, 0o444);
  const editor = page.locator('.jp-CodeCell .cm-content').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nconst recoveredEdit = 12345;');

  const banner = page.locator('.recovery-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('Save needs attention');
  await expect(statusLine(page)).toContainText('Save needs attention');

  // Removing the file while unsaved edits remain forces the server to keep a recovery copy.
  chmodSync(FILE, 0o644);
  const del = await request.delete(
    `${GANYMEDE_URL}/api/contents/${encodeURIComponent(NOTEBOOK)}?token=${TOKEN}`,
  );
  expect(del.ok()).toBe(true);
  await expect.poll(async () => (await listCopies(NOTEBOOK)).length, { timeout: 15_000 }).toBe(1);

  // Put a clean file back at the same path and reopen: the persisted copy is offered.
  seedNotebook('const onDisk = 0;');
  await page.reload();
  await openNotebook(page, NOTEBOOK);
  await expect(banner).toBeVisible({ timeout: 15_000 });
  const review = banner.getByRole('button', { name: 'Review Copy…' });
  await expect(review).toBeVisible({ timeout: 15_000 });

  await review.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('recoveredEdit = 12345');

  await dialog.getByRole('button', { name: 'Restore Copy' }).click();
  await expect(dialog).toBeHidden();
  await expect(banner).toBeHidden({ timeout: 15_000 });

  expect(readFileSync(FILE, 'utf8')).toContain('recoveredEdit = 12345');
  expect(await listCopies(NOTEBOOK)).toEqual([]);
});

test('shows merge conflict recovery copies with conflicting cells named and discards via DELETE (#831)', async ({
  page,
}) => {
  seedNotebook('const beforeConflict = 1;');
  const joined = page.waitForEvent('websocket', ws =>
    ws.url().includes('/api/collaboration/room/json:notebook:'),
  );
  await openWithToken(page);
  await openNotebook(page, NOTEBOOK);
  await joined;

  // Prevent autosave from flushing our local edit, edit the cell, then overwrite disk ahead in time.
  chmodSync(FILE, 0o444);
  const editor = page.locator('.jp-CodeCell .cm-content').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\nconst localEdit = 100;');

  const banner = page.locator('.recovery-banner');
  await expect(banner).toBeVisible({ timeout: 15_000 });

  chmodSync(FILE, 0o644);
  seedNotebook('const diskEdit = 200;');
  const later = new Date(Date.now() + 5_000);
  utimesSync(FILE, later, later);

  await expect
    .poll(async () => (await listCopies(NOTEBOOK))[0]?.reason, { timeout: 15_000 })
    .toBe('merge_conflict');

  const review = banner.getByRole('button', { name: 'Review Copy…' });
  await expect(review).toBeVisible({ timeout: 15_000 });
  await expect(banner).toContainText('rec-cell-1');

  await review.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Conflicting cells:')).toBeVisible();
  await expect(dialog.locator('.recovery-conflict-cells')).toContainText('rec-cell-1');
  await expect(dialog).toContainText('localEdit = 100');

  await dialog.getByRole('button', { name: 'Discard Copy' }).click();
  await expect(dialog).toBeHidden();
  await expect(banner).toBeHidden({ timeout: 15_000 });
  expect(await listCopies(NOTEBOOK)).toEqual([]);
});
