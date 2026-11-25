// Wide charts and tables (#814): an image or table wider than the column the
// cell's outputs sit in spans the pane past the column on both sides, capped
// inside the pane, so neither the page nor the notebook's scroll area ever
// scrolls sideways. What fits stays in the column, and a stream never widens:
// its text has no image or table to measure. At 390px the compact layout has
// no column to spare, so nothing extends. src/lib/output-labels.ts sets the
// class and --gn-pane; this checks the geometry. Saved outputs, no kernel.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type ElementHandle, type Locator, type Page, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import {
  notebookName,
  openWithToken,
  removeFromServer,
  sidebarItem,
  waitForReady,
} from './helpers';

const FILE = 'Wide outputs.ipynb';

/** The gutter a wide output leaves around the pane it spans, as the column's
 * own side padding (jupyter.css, src/lib/output-labels.ts's --gn-pane). */
const GUTTER = 32;

// Wide enough that the pane is wider than the column: the geometry is checked
// with the sidebar open and closed and the window resized. The phone-width
// tests below set their own viewport.
test.use({ viewport: { width: 1600, height: 900 } });

test.afterEach(() => removeFromServer(FILE));

/** A 1200×300 solid PNG, wider than the prose column on any window. */
const WIDE_PNG =
  'iVBORw0KGgoAAAANSUhEUgAABLAAAAEsCAIAAABc390HAAAGt0lEQVR4nO3XMQ0AMAzAsCIZsCEerMHoEUsGkDdz7gMAACBo1gsAAABYYQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAECUIQQAAIgyhAAAAFGGEAAAIMoQAgAARBlCAACAKEMIAAAQZQgBAACiDCEAAEDUB1fDNwPEVdtwAAAAAElFTkSuQmCC';
/** A 150×100 solid PNG, narrower than the prose column. */
const NARROW_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAJYAAABkCAIAAADrOV6nAAABAklEQVR4nO3RUQkAIBTAwJfEYCY2liH8kMHBBRhszl6kzfcCHlmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2GehXkW5lmYZ2HeBQuvQkg/EE0dAAAAAElFTkSuQmCC';

const code = (id: string, outputs: object[]) => ({
  cell_type: 'code',
  id,
  source: '',
  metadata: {},
  outputs,
  execution_count: 1,
});
const image = (png: string) => ({
  output_type: 'display_data',
  data: { 'image/png': png },
  metadata: {},
});
const table = (fields: { name: string }[], data: string[][]) => ({
  output_type: 'display_data',
  data: {
    'application/vnd.dataresource+json': { schema: { fields }, data },
  },
  metadata: {},
});
/** A table of `columns` columns with text past the column, on a wide window. */
const wideTable = (columns: number) =>
  table(
    Array.from({ length: columns }, (_, i) => ({ name: `column_${'x'.repeat(20)}_${i}` })),
    Array.from({ length: 3 }, () =>
      Array.from({ length: columns }, () => `${'y'.repeat(25)} ${'z'.repeat(25)}`),
    ),
  );

const NOTEBOOK = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    code('wide-img', [image(WIDE_PNG)]),
    code('narrow-img', [image(NARROW_PNG)]),
    code('wide-table', [wideTable(12)]),
    code('narrow-table', [table([{ name: 'a' }, { name: 'b' }], [['one', 'two']])]),
    code('log', [{ output_type: 'stream', name: 'stdout', text: `${'x'.repeat(500)}\n` }]),
  ],
};

/** The saved notebook, opened and ready to look at. At phone width the
 * sidebar starts closed and floats over the notebook: it is shown before
 * the item in it is clicked, as e2e/journal.spec.ts does. */
async function openSaved(page: Page) {
  writeFileSync(join(ROOT_DIR, FILE), JSON.stringify(NOTEBOOK));
  await openWithToken(page);
  const sidebar = page.getByRole('button', { name: 'Show Sidebar' });
  if ((page.viewportSize()?.width ?? 1280) < 600) await sidebar.click();
  await sidebarItem(page, notebookName(FILE)).click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await waitForReady(page);
}

const cellOutput = (cell: Locator) => cell.locator('.jp-OutputArea-output');

test('a wide chart or table spans the pane; what fits and streams stay put', async ({ page }) => {
  await openSaved(page);
  const cells = page.locator('.jp-Cell');
  const outer = page.locator('.jp-WindowedPanel-outer');

  // The images load before they can be measured; the wide one is past the
  // column, the narrow one well inside it, and the wide table is drawn.
  const imgs = cells.locator('.jp-OutputArea-output img');
  await expect
    .poll(async () => imgs.nth(0).evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(900);
  await expect
    .poll(async () => imgs.nth(1).evaluate(el => (el as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(50);
  await expect
    .poll(async () =>
      cells
        .nth(2)
        .locator('.gm-table-scroll table')
        .evaluate(el => el.scrollWidth),
    )
    .toBeGreaterThan(900);

  // Which outputs go wide: the images and tables past the column, not what
  // fits, and never a stream, however long its lines.
  await expect(cellOutput(cells.nth(0))).toHaveClass(/gn-mod-wide/);
  await expect(cellOutput(cells.nth(2))).toHaveClass(/gn-mod-wide/);
  await expect(cellOutput(cells.nth(1))).not.toHaveClass(/gn-mod-wide/);
  await expect(cellOutput(cells.nth(3))).not.toHaveClass(/gn-mod-wide/);
  await expect(cellOutput(cells.nth(4))).not.toHaveClass(/gn-mod-wide/);

  /** A wide output spans the pane — the notebook's scroll area, less the
   * gutter on each side — inside it, with neither the page nor the pane
   * itself scrolling sideways. The sidebar and the window both move the
   * pane, and the output follows, so this is polled, not assumed — and every
   * condition is read in one evaluate, so they all hold on the same frame:
   * reading the pane and the output in separate calls let the sidebar's
   * animation move the pane between them and make two reads of one width
   * disagree. */
  const spansPane = async (out: Locator) => {
    await expect
      .poll(async () => {
        const handles: [ElementHandle<Element> | null, ElementHandle<Element> | null, number] = [
          await out.elementHandle(),
          await outer.elementHandle(),
          GUTTER,
        ];
        return page.evaluate(([o, p, gutter]) => {
          if (!o || !p) return null;
          const box = o.getBoundingClientRect();
          const pane = p.getBoundingClientRect();
          const page = document.scrollingElement!;
          return {
            spans: Math.round(box.width - (p.clientWidth - 2 * gutter)) === 0,
            inside: box.left >= pane.left - 1 && box.right <= pane.left + p.clientWidth + 1,
            pageScrolls: page.scrollWidth - page.clientWidth <= 0,
            paneScrolls: p.scrollWidth - p.clientWidth <= 0,
          };
        }, handles);
      })
      .toEqual({ spans: true, inside: true, pageScrolls: true, paneScrolls: true });
  };

  const wide = cellOutput(cells.nth(0));
  const table = cellOutput(cells.nth(2));
  await spansPane(wide);
  await spansPane(table);

  // Wider than the whole 920px column, and past it on both sides.
  const wideBox = (await wide.boundingBox())!;
  expect(wideBox.width).toBeGreaterThan(920);
  const cell0 = (await cells.nth(0).boundingBox())!;
  expect(wideBox.x).toBeLessThan(cell0.x);
  expect(wideBox.x + wideBox.width).toBeGreaterThan(cell0.x + cell0.width);

  // The narrow output keeps the column: past the 6px collapser column and
  // the 56px prompt (the old left-edge test had the wide one start at the
  // cell's left edge, which missed the collapser), ending at the cell's
  // right edge. The cell, its editor and the prose keep the column too.
  const narrow = (await cellOutput(cells.nth(1)).boundingBox())!;
  const cell1 = (await cells.nth(1).boundingBox())!;
  expect(narrow.x - cell1.x).toBeGreaterThan(60);
  expect(Math.abs(narrow.x + narrow.width - (cell1.x + cell1.width))).toBeLessThanOrEqual(1);
  const editor = (await cells.nth(0).locator('.jp-InputArea-editor').boundingBox())!;
  expect(editor.x - cell0.x).toBeGreaterThan(60);
  expect(editor.x + editor.width).toBeLessThanOrEqual(cell0.x + cell0.width + 1);

  // The sidebar closes over the pane, and opens again: the span follows.
  await page.getByRole('button', { name: 'Hide Sidebar' }).click();
  await spansPane(wide);
  await page.getByRole('button', { name: 'Show Sidebar' }).click();
  await spansPane(wide);

  // The window resizes: the column and the span move with it.
  await page.setViewportSize({ width: 1200, height: 800 });
  await spansPane(wide);
  await spansPane(table);
});

test.describe('at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('nothing extends past the pane, and the page never scrolls sideways', async ({ page }) => {
    await openSaved(page);
    const cells = page.locator('.jp-Cell');

    // The images load before they can be measured; the table is drawn.
    const imgs = cells.locator('.jp-OutputArea-output img');
    await expect
      .poll(async () => imgs.nth(0).evaluate(el => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(900);
    await expect
      .poll(async () =>
        cells
          .nth(2)
          .locator('.gm-table-scroll table')
          .evaluate(el => el.scrollWidth),
      )
      .toBeGreaterThan(300);

    // The compact layout has no prompt column to spare, so the class changes
    // nothing: every output stays inside its cell, and the page never
    // scrolls sideways.
    const { scroll, client } = await page.evaluate(() => {
      const el = document.scrollingElement!;
      return { scroll: el.scrollWidth, client: el.clientWidth };
    });
    expect(scroll).toBeLessThanOrEqual(client);
    const pane = (await page.locator('.notebook-holder').boundingBox())!;
    for (let i = 0; i < 5; i++) {
      const box = (await cellOutput(cells.nth(i)).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(pane.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(pane.x + pane.width + 1);
    }
    // The long stream line scrolls in its own box, not the page's.
    await expect(cellOutput(cells.nth(4))).not.toHaveClass(/gn-mod-wide/);
  });
});
