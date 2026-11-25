// The compact touch cell layout (#813) at 390px: the active cell's count,
// type and options sit in a line above it, there is one Add cell control, a
// long line doesn't push the page sideways, Wrap Code wraps it, and outputs
// say what they are.
import { expect, type Page, test } from '@playwright/test';
import { outputs } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function newBrowserNotebook(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeAttached({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'New Notebook' }).last().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
}

/** Type into the first cell's editor and run it from the cell menu. */
async function runCell(page: Page, source: string) {
  await page.locator('.jp-Cell.jp-mod-active .cm-content').first().tap();
  await page.keyboard.insertText(source);
  await page.locator('.jp-Cell.jp-mod-active').getByRole('button', { name: 'Cell Actions' }).tap();
  await page.getByRole('menuitem', { name: 'Run', exact: true }).tap();
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });

test('the meta line is above the active cell and the page never scrolls sideways', async ({
  page,
}) => {
  await newBrowserNotebook(page);
  const cell = page.locator('.jp-Cell.jp-mod-active');
  const meta = cell.locator('.gn-cell-meta');
  await expect(meta).toBeVisible();
  await expect(meta).toContainText('Code');
  const metaBox = (await meta.boundingBox())!;
  const editorBox = (await cell.locator('.jp-InputArea-editor').boundingBox())!;
  expect(metaBox.y + metaBox.height).toBeLessThanOrEqual(editorBox.y + 1);
  // No prompt column: the editor has the cell's width, less the page gutters.
  expect(editorBox.width).toBeGreaterThan(330);
  await expect(cell.locator('.jp-InputPrompt')).toBeHidden();
  // The line is short, and its button is a touch target.
  expect(metaBox.height).toBeLessThanOrEqual(48);
  const more = (await meta.getByRole('button', { name: 'Cell Actions' }).boundingBox())!;
  expect(more.width).toBeGreaterThanOrEqual(44);
  expect(more.height).toBeGreaterThanOrEqual(44);

  // One long line, no spaces: it scrolls inside the editor, not the page.
  await runCell(page, `const long = "${'abcdefghij'.repeat(120)}"; long.length`);
  await expect(outputs(page).filter({ hasText: '1200' })).toBeVisible({ timeout: 60_000 });
  const { scroll, client } = await pageOverflow(page);
  expect(scroll).toBeLessThanOrEqual(client);
  await expect(meta).toContainText('In [1]');

  // Chevron, text and "…" share one centered row.
  const mid = async (loc: ReturnType<Page['locator']>) => {
    const b = (await loc.boundingBox())!;
    return b.y + b.height / 2;
  };
  const textMid = await mid(meta.locator('.gn-meta-count'));
  expect(Math.abs((await mid(cell.locator('.gn-code-toggle'))) - textMid)).toBeLessThanOrEqual(3);
  const dots = await meta.getByRole('button', { name: 'Cell Actions' }).evaluate(b => {
    const range = document.createRange();
    range.selectNodeContents(b);
    const r = range.getBoundingClientRect();
    return r.y + r.height / 2;
  });
  // The ellipsis glyph's dots sit in the lower part of its box.
  expect(Math.abs(dots - textMid)).toBeLessThanOrEqual(8);
});

test('Wrap Code wraps a long line in the editor', async ({ page }) => {
  await newBrowserNotebook(page);
  const editor = page.locator('.jp-Cell.jp-mod-active .cm-content').first();
  await editor.tap();
  await page.keyboard.insertText(`const long = "${'abcdefghij '.repeat(40)}";`);
  const lineHeight = () =>
    editor
      .locator('.cm-line')
      .first()
      .evaluate(l => l.clientHeight);
  const unwrapped = await lineHeight();
  await page.getByRole('button', { name: 'Cell Actions' }).tap();
  await page.getByRole('menuitemcheckbox', { name: 'Wrap Code' }).tap();
  await expect(editor).toHaveClass(/cm-lineWrapping/);
  expect(await lineHeight()).toBeGreaterThan(unwrapped * 2);
  const { scroll, client } = await pageOverflow(page);
  expect(scroll).toBeLessThanOrEqual(client);
  // Turn it off again, so the next test starts as the first did.
  await page.getByRole('button', { name: 'Cell Actions' }).tap();
  await page.getByRole('menuitemcheckbox', { name: 'Wrap Code' }).tap();
  await expect(editor).not.toHaveClass(/cm-lineWrapping/);
});

test('one Add cell control, under the active cell and at the end', async ({ page }) => {
  await newBrowserNotebook(page);
  const add = page.getByRole('button', { name: 'Add Cell', exact: true });
  await expect(add).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Add Code Cell' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add Text Cell' })).toBeHidden();
  await add.tap();
  await expect(page.locator('.jp-Cell')).toHaveCount(2);
  // The new cell is active and the last: exactly one control shows.
  await expect(page.locator('.jp-Cell.jp-mod-active')).toHaveClass(/gn-last-cell/);
  await expect(add.locator('visible=true')).toHaveCount(1);
  // The cell menu has the moves.
  await page.locator('.jp-Cell.jp-mod-active').getByRole('button', { name: 'Cell Actions' }).tap();
  await expect(page.getByRole('menuitem', { name: 'Move Up' })).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: 'Move Down' })).toBeDisabled();
});

test('a failing cell says Execution failed with the exception summary first', async ({ page }) => {
  await newBrowserNotebook(page);
  await runCell(page, `throw new Error("moons are late");`);
  const bar = page.locator('.gn-output-bar[data-kind="error"]');
  await expect(bar).toBeVisible({ timeout: 60_000 });
  await expect(bar.locator('.gn-output-label')).toHaveText('Execution failed');
  await expect(bar.locator('.gn-output-summary')).toHaveText('Error: moons are late');
  // Above the traceback, inside the same output.
  const barBox = (await bar.boundingBox())!;
  const pre = (await outputs(page).locator('pre').first().boundingBox())!;
  expect(barBox.y).toBeLessThanOrEqual(pre.y);
  await expect(page.locator('.jp-Cell.jp-mod-active .gn-cell-meta')).toBeVisible();
});

test('an interrupt on this browser says Execution stopped and Stopped', async ({ page }) => {
  await newBrowserNotebook(page);
  await runCell(page, 'while (true) {}');
  // The toolbar's Interrupt, not the running cell's own button.
  const interrupt = page
    .locator('.toolbar')
    .getByRole('button', { name: 'Interrupt', exact: true });
  await expect(interrupt).toBeEnabled({ timeout: 60_000 });
  await interrupt.tap();
  // cdp-kernel ends the cell with `Interrupted: Execution interrupted`,
  // which is a stop, not a failure.
  const bar = page.locator('.gn-output-bar[data-kind="stopped"]');
  await expect(bar).toBeVisible({ timeout: 60_000 });
  await expect(bar.locator('.gn-output-label')).toHaveText('Execution stopped');
  await expect(bar.locator('.gn-output-summary')).toHaveText('Interrupted: Execution interrupted');
  await expect(page.locator('.jp-Cell.jp-mod-active .gn-cell-meta .gn-meta-state')).toHaveText(
    'Stopped',
  );
});

test('a long log shows its tail, and View full log opens it', async ({ page }) => {
  await newBrowserNotebook(page);
  await runCell(page, 'for (let i = 0; i < 60; i++) console.log(`step ${i}`);');
  const button = page.getByRole('button', { name: 'View full log' });
  await expect(button).toBeVisible({ timeout: 60_000 });
  const out = page.locator('.jp-OutputArea-output.gn-log-tail');
  // The bar names what it holds.
  await expect(page.locator('.gn-output-bar .gn-output-label')).toHaveText('Log, 60 lines');
  // The bar is its own row above the text, and the tail starts at a whole line.
  const barBox = (await page.locator('.gn-output-bar').boundingBox())!;
  const pre = out.locator('pre');
  const preBox = (await pre.boundingBox())!;
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(preBox.y + 1);
  // What is visible, not what the text says: the tail is at its end, on a
  // whole line, and the last line is in view.
  const tail = await pre.evaluate(p => {
    const line = parseFloat(getComputedStyle(p).lineHeight);
    return {
      fromEnd: Math.abs(p.scrollTop + p.clientHeight - p.scrollHeight),
      rest: p.scrollTop % line,
      line,
    };
  });
  expect(tail.fromEnd).toBeLessThanOrEqual(1);
  expect(tail.rest < 1 || tail.line - tail.rest < 1).toBe(true);
  const lastLine = await pre.evaluate(p => {
    const preBox = p.getBoundingClientRect();
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = (node as Text).data.indexOf('step 59');
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + 'step 59'.length);
      const line = range.getBoundingClientRect();
      return {
        top: line.top,
        bottom: line.bottom,
        preTop: preBox.top,
        preBottom: preBox.bottom,
      };
    }
    return null;
  });
  // The "step 59" line's rect is inside the `pre`'s: it is on screen.
  expect(lastLine).not.toBeNull();
  expect(lastLine!.top).toBeGreaterThanOrEqual(lastLine!.preTop - 1);
  expect(lastLine!.bottom).toBeLessThanOrEqual(lastLine!.preBottom + 1);
  const h = (await out.boundingBox())!.height;
  await button.tap();
  const full = page.locator('.jp-OutputArea-output.gn-log-full');
  await expect(full).toBeVisible();
  expect((await full.boundingBox())!.height).toBeGreaterThan(h * 2);
  await expect(page.getByRole('button', { name: 'Show last lines' })).toBeVisible();
  const { scroll, client } = await pageOverflow(page);
  expect(scroll).toBeLessThanOrEqual(client);
});
