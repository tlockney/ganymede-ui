// Expanded full-window view (#822) for long code cell source and table
// outputs: inline triggers, live Yjs sync, Wrap Code, table paging/sorting
// sync, Escape/Close focus restoration, desktop hover-toolbar clearance, and
// touch responsiveness at iPhone (390px) and iPad Split View (497px) widths.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openWithToken, removeFromServer, sidebarItem, waitForReady } from './helpers';

const FILE = 'Expanded view.ipynb';

const longSource = Array.from({ length: 25 }, (_, i) => `const row_${i} = ${i};`).join('\n');
const wideTable = (rows: number, cols: number) => ({
  output_type: 'display_data',
  data: {
    'application/vnd.dataresource+json': {
      schema: {
        fields: Array.from({ length: cols }, (_, c) => ({
          name: `col_${c}`,
          type: c === 0 ? 'number' : 'string',
        })),
      },
      data: Array.from({ length: rows }, (_, r) =>
        Object.fromEntries(
          Array.from({ length: cols }, (_, c) => [
            `col_${c}`,
            c === 0 ? r : `cell_${r}_${c}_${'x'.repeat(12)}`,
          ]),
        ),
      ),
      ganymede: { rows, shown: rows, title: 'Moons' },
    },
  },
  metadata: {},
});
const htmlTable = (rows: number) => ({
  output_type: 'display_data',
  data: {
    'text/html': `<table><thead><tr><th>Moon</th><th>Notes</th></tr></thead><tbody>${Array.from(
      { length: rows },
      (_, r) => `<tr><td>Moon ${r}</td><td>${'orbit '.repeat(8)}</td></tr>`,
    ).join('')}</tbody></table>`,
  },
  metadata: {},
});

function writeFixture() {
  writeFileSync(
    join(ROOT_DIR, FILE),
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { name: 'cdp-node', display_name: 'Node' } },
      cells: [
        {
          cell_type: 'code',
          id: 'short-cell',
          source: `const oneLongLine = "${'abcdefghij '.repeat(25)}";`,
          metadata: {},
          outputs: [],
          execution_count: null,
        },
        {
          cell_type: 'code',
          id: 'long-cell',
          source: longSource,
          metadata: {},
          outputs: [wideTable(80, 10)],
          execution_count: 1,
        },
        {
          cell_type: 'code',
          id: 'html-cell',
          source: 'htmlTable()',
          metadata: {},
          outputs: [htmlTable(20)],
          execution_count: 2,
        },
      ],
    }),
  );
}

const pageOverflow = (page: Page) =>
  page.evaluate(() => {
    const el = document.scrollingElement!;
    return { scroll: el.scrollWidth, client: el.clientWidth };
  });

async function openSaved(page: Page) {
  writeFixture();
  await openWithToken(page);
  const showSidebar = page.getByRole('button', { name: 'Show Sidebar' });
  if (await showSidebar.isVisible()) await showSidebar.click();
  await sidebarItem(page, FILE.replace(/\.ipynb$/, '')).click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await waitForReady(page);
}

test.afterEach(() => removeFromServer(FILE));

test('desktop: expands long source with live edits and expands tables past 32em', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await openSaved(page);

  const cells = page.locator('.jp-CodeCell');
  // Only the 25-line cell gets the inline Expand source bar.
  await expect(cells.nth(0).locator('.gn-source-bar')).toHaveCount(0);
  const longBar = cells.nth(1).locator('.gn-source-bar');
  await expect(longBar).toBeVisible();
  await expect(longBar).toContainText('25 lines');

  // Activate the long cell so JupyterLab's hover toolbar appears; check non-overlap with the bar.
  await cells.nth(1).locator('.cm-content').click();
  await page.keyboard.press('Escape');
  await cells.nth(1).hover();
  const toolbar = cells.nth(1).locator('.jp-cell-toolbar');
  await expect(toolbar).toBeVisible();
  const toolbarBox = (await toolbar.boundingBox())!;
  const barBox = (await longBar.boundingBox())!;
  const expandBtnBox = (await longBar
    .getByRole('button', { name: 'Expand source' })
    .boundingBox())!;
  const overlapsHoriz =
    barBox.x < toolbarBox.x + toolbarBox.width && barBox.x + barBox.width > toolbarBox.x;
  const overlapsVert =
    barBox.y < toolbarBox.y + toolbarBox.height && barBox.y + barBox.height > toolbarBox.y;
  expect(overlapsHoriz && overlapsVert).toBe(false);
  expect(expandBtnBox.x + expandBtnBox.width).toBeLessThanOrEqual(toolbarBox.x);

  await longBar.getByRole('button', { name: 'Expand source' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('In [1] · 25 lines');
  const dialogBox = (await dialog.boundingBox())!;
  expect(Math.round(dialogBox.width)).toBe(1280);
  expect(Math.round(dialogBox.height)).toBe(820);

  // Edits inside ExpandedView sync back to the inline notebook cell live.
  const cm = dialog.locator('.cm-content');
  await expect(cm).toBeFocused();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('const added = 99;');
  await expect(dialog.getByRole('heading')).toHaveText('In [1] · 26 lines');

  // Wrap Code toggles inside ExpandedView.
  const wrapBtn = dialog.getByRole('button', { name: 'Wrap Code' });
  await expect(wrapBtn).toHaveAttribute('aria-pressed', 'false');
  await wrapBtn.click();
  await expect(wrapBtn).toHaveAttribute('aria-pressed', 'true');
  await expect(cm).toHaveClass(/cm-lineWrapping/);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(cells.nth(1).locator('.cm-content')).toContainText('const added = 99;');
  await expect(longBar).toContainText('26 lines');

  // Table expansion grows past the inline 32em box and syncs paging/sorting back.
  const inlineScrollBox = (await cells.nth(1).locator('.gm-table-scroll').boundingBox())!;
  const expandTableBtn = cells.nth(1).getByRole('button', { name: 'Expand table' });
  await expandTableBtn.click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toHaveText('Moons · 80 rows');
  const expandedScroll = dialog.locator('.gm-table-scroll');
  const expandedBox = (await expandedScroll.boundingBox())!;
  expect(expandedBox.height).toBeGreaterThan(inlineScrollBox.height + 100);

  // Sticky table header stays pinned to the scroll viewport's top edge after scrolling past <caption>.
  const scrollerBox = (await expandedScroll.boundingBox())!;
  await expandedScroll.evaluate(el => {
    el.scrollTop = 400;
  });
  const thAfter = (await dialog.locator('.gm-table th').first().boundingBox())!;
  expect(Math.abs(thAfter.y - scrollerBox.y)).toBeLessThanOrEqual(2);

  await dialog.getByRole('button', { name: 'Next rows' }).click();
  await expect(dialog.locator('.gm-table-footer')).toContainText('Rows 51–80 of 80');
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(cells.nth(1).locator('.gm-table-footer')).toContainText('Rows 51–80 of 80');

  // Untrusted HTML table opens sanitized inside ExpandedView cleanly.
  await cells.nth(2).getByRole('button', { name: 'Expand table' }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.expanded-html-host table')).toBeVisible();
  await expect(dialog.locator('.expanded-html-host')).toContainText('Moon 19');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test.describe('touch and narrow responsive layouts (#822)', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('390px iPhone: opens from inactive cell tap, cell menu, and table without overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openSaved(page);

    const overflow = await pageOverflow(page);
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    // Cell 0 is active; tap Expand source directly on inactive cell 1.
    const cells = page.locator('.jp-CodeCell');
    const sourceBtn = cells.nth(1).getByRole('button', { name: 'Expand source' });
    const btnBox = (await sourceBtn.boundingBox())!;
    expect(btnBox.height).toBeGreaterThanOrEqual(36);
    await sourceBtn.tap();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const header = dialog.locator('.expanded-header');
    const headerOverflow = await header.evaluate(el => el.scrollWidth <= el.clientWidth);
    expect(headerOverflow).toBe(true);

    // Both header buttons meet 44px touch targets and stay unobstructed inside 390px.
    const closeBox = (await dialog.getByRole('button', { name: 'Close' }).boundingBox())!;
    const wrapBox = (await dialog.getByRole('button', { name: 'Wrap Code' }).boundingBox())!;
    expect(closeBox.height).toBeGreaterThanOrEqual(44);
    expect(wrapBox.height).toBeGreaterThanOrEqual(44);
    expect(closeBox.x + closeBox.width).toBeLessThanOrEqual(390);
    expect(wrapBox.x + wrapBox.width).toBeLessThanOrEqual(closeBox.x);

    await dialog.getByRole('button', { name: 'Close' }).tap();
    await expect(dialog).toHaveCount(0);

    // Short cell opens Expanded Source via Cell Actions menu.
    await cells.nth(0).locator('.cm-content').tap();
    await cells.nth(0).getByRole('button', { name: 'Cell Actions' }).tap();
    await page.getByRole('menuitem', { name: 'Expand Source' }).tap();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading')).toHaveText('Source · 1 line');
    await dialog.getByRole('button', { name: 'Close' }).tap();
    await expect(dialog).toHaveCount(0);

    // Table expansion stays within 390px and scrolls inside the table box.
    await cells.nth(1).getByRole('button', { name: 'Expand table' }).tap();
    await expect(dialog).toBeVisible();
    const afterOpen = await pageOverflow(page);
    expect(afterOpen.scroll).toBeLessThanOrEqual(afterOpen.client);
    const thBg = await dialog
      .locator('.gm-table th')
      .first()
      .evaluate(el => getComputedStyle(el).backgroundColor);
    expect(thBg).not.toBe('rgba(0, 0, 0, 0)');
    await dialog.getByRole('button', { name: 'Close' }).tap();
  });

  test('497px iPad Split View in dark mode: clean geometry and opaque table headers', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 497, height: 720 });
    await openSaved(page);

    const overflow = await pageOverflow(page);
    expect(overflow.scroll).toBeLessThanOrEqual(overflow.client);

    await page.locator('.jp-CodeCell').nth(1).getByRole('button', { name: 'Expand source' }).tap();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const box = (await dialog.boundingBox())!;
    expect(Math.round(box.width)).toBe(497);
    expect(Math.round(box.height)).toBe(720);
    await dialog.getByRole('button', { name: 'Close' }).tap();

    await page.locator('.jp-CodeCell').nth(1).getByRole('button', { name: 'Expand table' }).tap();
    await expect(dialog).toBeVisible();
    const thBg = await dialog
      .locator('.gm-table th')
      .first()
      .evaluate(el => getComputedStyle(el).backgroundColor);
    expect(thBg).not.toBe('rgba(0, 0, 0, 0)');
    const splitOverflow = await pageOverflow(page);
    expect(splitOverflow.scroll).toBeLessThanOrEqual(splitOverflow.client);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
});
