// The app against a real `ganymede serve`, running cdp-kernel's Node
// kernelspec (TypeScript), with the fixture notebook in the server's folder.
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { FIXTURE, ROOT_DIR } from './env';
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
  // text/html from jupyter.display(jupyter.html`...`)
  const table = page.locator('[data-mime-type="text/html"] table.moon-table');
  await expect(table).toBeVisible();
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
