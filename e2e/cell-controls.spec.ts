// Touch cell controls (#200): with no keyboard, a phone adds, retypes,
// moves, runs and deletes cells from each cell's "…" menu and the add-cell
// bar. A desktop window keeps the toolbar and shows neither.
import { expect, type Page, test } from '@playwright/test';
import { outputs, useThisBrowser } from './helpers';

async function newBrowserNotebook(page: Page) {
  await page.goto('/');
  await useThisBrowser(page);
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
    // Compact (#813): the active cell's menu is in the line above it, and one
    // Add cell control is under the active cell.
    const active = page.locator('.jp-Cell.jp-mod-active');
    const more = active.getByRole('button', { name: 'Cell Actions' });
    await expect(more).toHaveCount(1);
    const first = page.locator('.jp-Cell').first();
    const editor = (await first.locator('.jp-InputArea-editor').boundingBox())!;
    const bar = (await first.locator('.gn-add-cell').boundingBox())!;
    expect(bar.y).toBeGreaterThanOrEqual(editor.y + editor.height);
    const box = (await more.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);

    // A cell after the first, made Markdown from its menu, then a code cell after that.
    await page.getByRole('button', { name: 'Add Cell Below', exact: true }).tap();
    await more.tap();
    await page.getByRole('menuitemradio', { name: 'Markdown' }).tap();
    await page.keyboard.type('# Moons');
    await page.getByRole('button', { name: 'Add Cell Below', exact: true }).tap();
    await page.keyboard.type('6 * 7');
    expect(await cellTypes(page)).toEqual(['code', 'markdown', 'code']);

    // Run from the menu.
    await more.tap();
    await page.getByRole('menuitem', { name: 'Run', exact: true }).tap();
    await expect(outputs(page).filter({ hasText: '42' })).toBeVisible({ timeout: 60_000 });

    // Move the last one up, then retype and delete the first by making it active.
    await more.tap();
    await page.getByRole('menuitem', { name: 'Move Up' }).tap();
    expect(await cellTypes(page)).toEqual(['code', 'code', 'markdown']);
    await page.locator('.jp-Cell').first().locator('.jp-InputArea-editor').tap();
    await more.tap();
    await expect(page.getByRole('menuitem', { name: 'Move Up' })).toBeDisabled();
    await page.getByRole('menuitemradio', { name: 'Raw' }).tap();
    expect(await cellTypes(page)).toEqual(['raw', 'code', 'markdown']);
    await more.tap();
    await page.getByRole('menuitem', { name: 'Duplicate' }).tap();
    expect(await cellTypes(page)).toEqual(['raw', 'raw', 'code', 'markdown']);
    await more.tap();
    await page.getByRole('menuitem', { name: 'Delete' }).tap();
    expect(await cellTypes(page)).toEqual(['raw', 'code', 'markdown']);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});

test('a desktop window keeps its toolbar and shows no cell controls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await newBrowserNotebook(page);
  await expect(page.locator('.gn-cell-more')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add Code Cell' })).toBeHidden();
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Insert Code Cell' })).toBeVisible();
});
