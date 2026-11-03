// Touch cell controls (#200): with no keyboard, a phone adds, retypes,
// moves, runs and deletes cells from each cell's "…" menu and the add-cell
// bar. A desktop window keeps the toolbar and shows neither.
import { expect, type Page, test } from '@playwright/test';
import { outputs } from './helpers';

async function newBrowserNotebook(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeAttached({
    timeout: 60_000,
  });
  // The empty state's button: on a phone the sidebar starts closed.
  await page.getByRole('button', { name: 'New Notebook' }).last().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
}

const cellTypes = (page: Page) =>
  page
    .locator('.jp-Notebook > .jp-Cell, .jp-WindowedPanel-viewport > .jp-Cell')
    .evaluateAll(cells =>
      cells.map(c =>
        c.classList.contains('jp-MarkdownCell')
          ? 'markdown'
          : c.classList.contains('jp-RawCell')
            ? 'raw'
            : 'code',
      ),
    );

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

  test('cells are added, retyped, moved, run and deleted by touch', async ({ page }) => {
    await newBrowserNotebook(page);
    const more = page.getByRole('button', { name: 'Cell Actions' });
    await expect(more).toHaveCount(1);
    const box = (await more.first().boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);

    // A text cell after the first, then a code cell after that.
    await page.getByRole('button', { name: 'Add Text Cell' }).first().tap();
    await page.keyboard.type('# Moons');
    await page.getByRole('button', { name: 'Add Code Cell' }).nth(1).tap();
    await page.keyboard.type('6 * 7');
    expect(await cellTypes(page)).toEqual(['code', 'markdown', 'code']);

    // Run from the menu.
    await more.nth(2).tap();
    await page.getByRole('menuitem', { name: 'Run' }).tap();
    await expect(outputs(page).filter({ hasText: '42' })).toBeVisible({ timeout: 60_000 });

    // Retype the first cell, move the last one up, delete the new first.
    await more.nth(0).tap();
    await expect(page.getByRole('menuitem', { name: 'Move Up' })).toBeDisabled();
    await page.getByRole('menuitemradio', { name: 'Raw' }).tap();
    expect(await cellTypes(page)).toEqual(['raw', 'markdown', 'code']);
    await more.nth(2).tap();
    await page.getByRole('menuitem', { name: 'Move Up' }).tap();
    expect(await cellTypes(page)).toEqual(['raw', 'code', 'markdown']);
    await more.nth(0).tap();
    await page.getByRole('menuitem', { name: 'Delete' }).tap();
    expect(await cellTypes(page)).toEqual(['code', 'markdown']);
    await more.nth(0).tap();
    await page.getByRole('menuitem', { name: 'Duplicate' }).tap();
    expect(await cellTypes(page)).toEqual(['code', 'code', 'markdown']);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test('a desktop window keeps its toolbar and shows no cell controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await newBrowserNotebook(page);
  await expect(page.getByRole('button', { name: 'Cell Actions' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add Code Cell' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Insert Code Cell' })).toBeVisible();
});
