// The app against a real `ganymede serve`, running cdp-kernel's Node
// kernelspec (TypeScript), with the fixture notebook in the server's folder.
import { copyFileSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { FIXTURE, GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import { notebookName, openNotebook, openWithToken, outputs, sidebarItem } from './helpers';

// Put the fixture back after each test, so the edit test leaves later ones
// (and the screenshots) the notebook as committed.
test.afterEach(() => {
  const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  copyFileSync(join(fixtures, FIXTURE), join(ROOT_DIR, FIXTURE));
});

test('lists the notebook, runs all cells, and shows stream, result and HTML output', async ({
  page,
}) => {
  await openWithToken(page);
  await expect(sidebarItem(page, notebookName(FIXTURE))).toBeVisible();
  await openNotebook(page, FIXTURE);

  await page.getByRole('button', { name: 'Run All' }).click();

  // stdout from console.log
  await expect(
    outputs(page).filter({ hasText: 'Ganymede is the largest moon in the solar system' }),
  ).toBeVisible();
  await expect(
    page.locator('[data-mime-type="application/vnd.jupyter.stdout"]', {
      hasText: 'largest moon',
    }),
  ).toBeVisible();
  // execute_result from the cell's last expression
  await expect(
    page.locator('.jp-OutputArea-executeResult', {
      hasText: 'IO · EUROPA · GANYMEDE · CALLISTO',
    }),
  ).toBeVisible();
  // text/html from jupyter.display(jupyter.html`...`), in a sandboxed frame
  // sized to fit the table.
  const frame = page.locator('[data-mime-type="text/html"] iframe');
  await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
  const table = frame.contentFrame().locator('table.moon-table');
  await expect(table).toBeVisible();
  await expect.poll(async () => (await frame.boundingBox())?.height ?? 0).toBeGreaterThan(50);
  // Opaque origin: no storage, cookies or app DOM.
  expect(
    await frame
      .contentFrame()
      .locator('body')
      .evaluate(() => {
        try {
          return `${window.origin} ${String(window.parent.document)}`;
        } catch {
          return `${window.origin} blocked`;
        }
      }),
  ).toBe('null blocked');
  await expect(table.getByRole('cell', { name: 'Callisto' })).toBeVisible();
  await expect(table.getByRole('row')).toHaveCount(5);
});

test('saves an edit with the keyboard, and it survives a reload and is on disk', async ({
  page,
}) => {
  const stamp = `edited by e2e ${Date.now()}`;
  await openWithToken(page);
  await openNotebook(page, FIXTURE);

  // Append a comment to the first code cell; it changes no output.
  const editor = page.locator('.jp-CodeCell .cm-content').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(`\n// ${stamp}`);
  await expect(editor).toContainText(stamp);
  await expect(page.getByText('— Edited')).toBeVisible();

  // The app binds ⌘S on macOS and Ctrl+S elsewhere.
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.getByText('— Edited')).toBeHidden({ timeout: 10_000 });

  const onDisk = JSON.parse(readFileSync(join(ROOT_DIR, FIXTURE), 'utf8'));
  const source = [onDisk.cells[1].source].flat().join('');
  expect(source).toContain(`// ${stamp}`);

  // The token left the URL; the saved connection reconnects on reload.
  await page.reload();
  await openNotebook(page, FIXTURE);
  await expect(page.locator('.jp-CodeCell .cm-content').first()).toContainText(stamp);
});

/**
 * Another writer saves the fixture (an agent through the server, say):
 * `edit` changes it, and its mtime goes a few seconds past our copy's.
 */
function writeElsewhere(
  edit: (nb: {
    metadata: Record<string, unknown>;
    cells: { cell_type: string; source: string | string[] }[];
  }) => void,
) {
  const file = join(ROOT_DIR, FIXTURE);
  const theirs = JSON.parse(readFileSync(file, 'utf8'));
  edit(theirs);
  writeFileSync(file, JSON.stringify(theirs, null, 1) + '\n');
  const later = new Date(Date.now() + 5_000);
  utimesSync(file, later, later);
  return file;
}

test('takes in a change on disk live, keeping edits here (#183)', async ({ page }) => {
  const stamp = `edited by e2e ${Date.now()}`;
  const theirs = `written elsewhere ${Date.now()}`;
  const joined = page.waitForEvent('websocket', ws =>
    ws.url().includes('/api/collaboration/room/json:notebook:'),
  );
  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  await joined;
  const editors = page.locator('.jp-CodeCell .cm-content');
  // Our edit to the first code cell, not yet saved by us.
  await editors.first().click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type(`\n// ${stamp}`);

  // Another writer (an agent, git) changes the second code cell on disk.
  const file = writeElsewhere(nb => {
    const code = nb.cells.filter(c => c.cell_type === 'code');
    code[1]!.source = `// ${theirs}`;
  });

  // The room merges it in: their cell shows here, ours stays, no notice.
  await expect(editors.nth(1)).toContainText(theirs, { timeout: 15_000 });
  await expect(editors.first()).toContainText(stamp);
  await expect(page.getByRole('alert')).toBeHidden();
  await expect(page.getByText('— Locked')).toBeHidden();

  // And the server saves both to the file.
  await expect.poll(() => readFileSync(file, 'utf8'), { timeout: 15_000 }).toContain(stamp);
  expect(readFileSync(file, 'utf8')).toContain(theirs);
});

test('shows an edit made through the server as it happens (#183)', async ({ page, request }) => {
  const stamp = `added by an agent ${Date.now()}`;
  const joined = page.waitForEvent('websocket', ws =>
    ws.url().includes('/api/collaboration/room/json:notebook:'),
  );
  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  await joined;
  await expect(page.locator('.jp-CodeCell .cm-content').first()).toBeVisible();

  // A second client of the same room, as `ganymede mcp` is: here, the
  // contents API's save, which the room takes in like any writer.
  const url = `${GANYMEDE_URL}/api/contents/${encodeURIComponent(FIXTURE)}?token=${TOKEN}`;
  const nb = (await (await request.get(url)).json()).content;
  nb.cells.push({ cell_type: 'markdown', id: 'agent-cell', metadata: {}, source: stamp });
  const saved = await request.put(url, {
    data: { type: 'notebook', format: 'json', content: nb },
  });
  expect(saved.ok()).toBe(true);

  await expect(page.locator('.jp-MarkdownCell', { hasText: stamp })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('alert')).toBeHidden();
});

test('asks before the tab closes with unsaved edits', async ({ page }) => {
  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  const editor = page.locator('.jp-CodeCell .cm-content').first();
  await editor.click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n// not saved');
  await expect(page.getByText('— Edited')).toBeVisible();

  const asked = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const dialog = await asked;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);
});
