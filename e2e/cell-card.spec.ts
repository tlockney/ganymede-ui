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

test('the toolbar’s capsule sits on the card’s top edge and stays put', async ({ page }) => {
  await newBrowserNotebook(page);
  const cell = page.locator('.jp-Cell').first();
  await cell.locator('.cm-content').click();
  await page.keyboard.type("'Io'");
  await page.keyboard.press('Escape');
  await selectCell(page, 0);

  // Its boxes, measured whether or not the capsule is showing.
  const boxes = () =>
    Promise.all(
      [cell, cell.locator('.jp-cell-toolbar')].map(locator =>
        locator.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      ),
    );
  const placed = async () => {
    const [card, capsule] = (await boxes()) as [
      { x: number; y: number; width: number; height: number },
      { x: number; y: number; width: number; height: number },
    ];
    return {
      // Half of it above the card's top edge…
      middle: Math.round(capsule.y + capsule.height / 2 - card.y),
      // …and 10px in from its right.
      right: Math.round(card.x + card.width - (capsule.x + capsule.width)),
    };
  };
  const first = await placed();
  expect(Math.abs(first.middle)).toBeLessThanOrEqual(1);
  expect(Math.abs(first.right - 10)).toBeLessThanOrEqual(1);

  // Hovering the cell, and a run in it, leave the capsule where it was (to
  // the pixel: a half-pixel of rounding comes and goes as outputs appear).
  const still = (a: { middle: number; right: number }) =>
    Math.abs(a.middle - first.middle) <= 1 && Math.abs(a.right - first.right) <= 1;
  await cell.hover();
  expect(still(await placed())).toBe(true);
  await cell.locator('.cm-content').click();
  await page.keyboard.type('; 1');
  await page.keyboard.press('Escape');
  await cell.hover();
  await cell.locator('.gn-run-button').click();
  await expect(cell.locator('.gn-run-button')).toHaveAttribute('aria-label', /^Running/);
  expect(still(await placed())).toBe(true);
});

test('an output is what a press at its left edge finds, not JupyterLab’s overlay', async ({
  page,
}) => {
  await newBrowserNotebook(page);
  const cell = page.locator('.jp-Cell').first();
  await cell.locator('.cm-content').click();
  await page.keyboard.type("console.log('Io')");
  await page.keyboard.press('Escape');
  await cell.hover();
  await cell.locator('.gn-run-button').click();
  const output = cell.locator('.jp-OutputArea-output').first();
  await expect(output).toHaveText('Io');

  // JupyterLab puts a button over the output's left edge (copy, and the
  // prompt); inside the card it would take presses meant for the output.
  const hit = await output.evaluate(el => {
    const r = el.getBoundingClientRect();
    const found = document.elementFromPoint(r.left + 3, r.top + r.height / 2);
    return {
      overlay: found?.closest('.jp-OutputArea-promptOverlay') !== null,
      own: found?.closest('.jp-OutputArea-output') !== null,
      x: Math.round(r.left),
    };
  });
  expect(hit.overlay).toBe(false);
  expect(hit.own).toBe(true);
  expect(hit.x).toBeGreaterThan((await cell.evaluate(el => el.getBoundingClientRect().x)) + 30);
});

test('code outputs sit in a recessed well, and errors add a red left rail (#960)', async ({
  page,
}) => {
  await newBrowserNotebook(page);
  const cell = page.locator('.jp-Cell').first();
  const wrapper = cell.locator('> .jp-Cell-outputWrapper');

  // Before any output exists, the wrapper stays invisible with no seam or well fill.
  const emptyStyle = await wrapper.evaluate(el => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, borderTop: s.borderTopWidth };
  });
  expect(emptyStyle.borderTop).toBe('0px');
  expect(emptyStyle.bg).toMatch(/^rgba?\(0, 0, 0, 0\)$/);

  // Run a normal cell: the output wrapper gets a recessed fill distinct from
  // the card's surface and a 1px seam border, with no left rail on the output.
  await cell.locator('.cm-content').click();
  await page.keyboard.type("'Ganymede'");
  await page.keyboard.press('Escape');
  await cell.hover();
  await cell.locator('.gn-run-button').click();
  const textOutput = cell.locator('.jp-OutputArea-output').first();
  await expect(textOutput).toContainText('Ganymede', { timeout: 60_000 });

  const textState = await cell.evaluate(el => {
    const cardStyle = getComputedStyle(el);
    const outWrap = el.querySelector<HTMLElement>(':scope > .jp-Cell-outputWrapper')!;
    const wrapStyle = getComputedStyle(outWrap);
    const out = el.querySelector<HTMLElement>('.jp-OutputArea-output')!;
    const outStyle = getComputedStyle(out);
    const countRect = el.querySelector<HTMLElement>('.gn-exec-count')!.getBoundingClientRect();
    const wrapRect = outWrap.getBoundingClientRect();
    return {
      cardBg: cardStyle.backgroundColor,
      wellBg: wrapStyle.backgroundColor,
      borderTop: wrapStyle.borderTopWidth,
      outRail: outStyle.borderLeftWidth,
      countClearsSeam: countRect.bottom <= wrapRect.top,
    };
  });
  expect(textState.borderTop).toBe('1px');
  expect(textState.wellBg).not.toBe(textState.cardBg);
  expect(textState.outRail).toBe('0px');
  expect(textState.countClearsSeam).toBe(true);

  // Run an error cell: the error output adds a 2px red left rail inside the well.
  await selectCell(page, 0);
  await page.keyboard.press('b');
  const errCell = page.locator('.jp-Cell').nth(1);
  await errCell.locator('.cm-content').click();
  await page.keyboard.type("throw new Error('orbit drift')");
  await page.keyboard.press('Escape');
  await errCell.hover();
  await errCell.locator('.gn-run-button').click();
  await expect(errCell.locator('.gn-output-bar[data-kind="error"]')).toBeVisible({
    timeout: 60_000,
  });

  const errState = await errCell.evaluate(el => {
    const out = el.querySelector<HTMLElement>('.jp-OutputArea-output')!;
    const bar = el.querySelector<HTMLElement>('.gn-output-bar[data-kind="error"]')!;
    return {
      outRail: getComputedStyle(out).borderLeftWidth,
      barLeft: getComputedStyle(bar).borderLeftWidth,
    };
  });
  expect(errState.outRail).toBe('2px');
  expect(errState.barLeft).toBe('0px');
});

test.describe('at 740px, a window with a mouse', () => {
  test.use({ viewport: { width: 740, height: 820 } });

  test('the Run button is what a press on it finds, and the code toggle clears it', async ({
    page,
  }) => {
    await newBrowserNotebook(page);
    // Not the touch layout: a mouse, whatever the width.
    await expect(page.locator('.touch-ui')).toHaveCount(0);
    const cell = page.locator('.jp-Cell').first();
    await cell.locator('.cm-content').click();
    await page.keyboard.type("'Io'");
    await page.keyboard.press('Escape');
    await selectCell(page, 0);
    await cell.hover();

    const run = cell.locator('.gn-run-button');
    await expect(run).toBeVisible();
    // At this width JupyterLab stacks the prompt over the editor, where the
    // code toggle used to be drawn on top of nothing; it must not cover Run.
    const hit = await run.evaluate(el => {
      const r = el.getBoundingClientRect();
      const found = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        run: found?.closest('.gn-run-button') !== null,
        toggle: found?.closest('.gn-code-toggle') !== null,
        prompt: found?.closest('.jp-InputPrompt') !== null,
      };
    });
    expect(hit).toEqual({ run: true, toggle: false, prompt: false });
  });
});

test.describe('at 720px, a touch screen', () => {
  test.use({ viewport: { width: 720, height: 820 }, hasTouch: true });

  test('the margin keeps the execution count alone, Run being in the cell menu', async ({
    page,
  }) => {
    await newBrowserNotebook(page);
    await expect(page.locator('.touch-ui')).toHaveCount(1);
    const cell = page.locator('.jp-Cell').first();
    await cell.locator('.cm-content').click();
    await page.keyboard.type("'Io'");
    await page.keyboard.press('Escape');

    // Run the cell from its … menu, and the count lands in the margin.
    const more = cell.locator('.gn-cell-more');
    await expect(more).toBeVisible();
    await more.click();
    await page
      .getByRole('menu', { name: 'Cell Actions' })
      .getByRole('menuitem', { name: 'Run' })
      .click();
    const count = cell.locator('.gn-exec-count');
    await expect(count).toHaveText('1', { timeout: 60_000 });
    await expect(count).toBeVisible();
    // No second Run in the margin, and no seconds counted there.
    await expect(cell.locator('.gn-run-button')).toBeHidden();
    await expect(cell.locator('.gn-run-elapsed')).toBeHidden();
    await expect(count.locator('xpath=..')).toBeVisible();
  });
});
