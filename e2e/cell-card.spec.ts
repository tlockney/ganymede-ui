// The cell as a card (#852): a code cell runs from the round button in its
// margin and counts the run there, and the toolbar's ⋯ opens the cell's
// menu, which holds Delete and Cell Type so a slip can't reach them.
import { expect, type Page, test } from '@playwright/test';
import { selectCell, useThisBrowser } from './helpers';

async function newBrowserNotebook(page: Page) {
  await page.goto('/');
  await useThisBrowser(page);
  await expect(page.getByRole('button', { name: /This browser/ })).toBeAttached({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'New Notebook' }).last().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
}

test('a code cell runs from the button in its margin, which counts the run', async ({ page }) => {
  await newBrowserNotebook(page);
  const cell = page.locator('.jp-Cell').first();
  await cell.locator('.cm-content').click();
  await page.keyboard.type('await new Promise(r => setTimeout(r, 1200)); 7');
  await page.keyboard.press('Escape');

  await cell.hover();
  const run = cell.locator('.gn-run-button');
  await run.click();
  // While it runs the button says how long, in a slot that is there before
  // the run and after it, so nothing moves (#812).
  await expect(run).toHaveAttribute('aria-label', /^Running, \d+ s$/);
  await expect(cell.locator('.gn-exec-count')).toHaveText('1', { timeout: 60_000 });
  await expect(cell.locator('.jp-OutputArea-output')).toHaveText('7');
  // Done: the count stays, the seconds leave the margin for the line under
  // the outputs, and the button is a Run button again.
  await expect(run).toHaveAttribute('aria-label', 'Run cell');
  await expect(cell.locator('.gn-run-elapsed')).toHaveText('');
  await expect(cell.locator('.gn-output-meta')).toHaveText(/^Text · \d+(\.\d+)? (ms|s)$/);
});

test('the toolbar’s ⋯ opens the cell menu, where Delete and Cell Type live', async ({ page }) => {
  await newBrowserNotebook(page);
  const cells = page.locator('.jp-Cell');
  await cells.first().locator('.cm-content').click();
  await page.keyboard.type("'Io'");
  await page.keyboard.press('Escape');
  await page.keyboard.press('b');
  await expect(cells).toHaveCount(2);
  await selectCell(page, 0);

  const toolbar = cells.first().locator('.jp-cell-toolbar');
  await expect(toolbar.getByRole('button')).toHaveCount(4);
  await expect(toolbar.getByTitle('Delete Cell')).toHaveCount(0);
  await toolbar.getByTitle('Cell actions').click();
  const menu = page.getByRole('menu', { name: 'Cell Actions' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Delete' })).toBeVisible();
  await expect(menu.getByText('Cell Type')).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Code' })).toBeVisible();

  await menu.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(cells).toHaveCount(1);
});
