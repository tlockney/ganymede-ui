// Selection and editor focus look different (#814, a card since #852): a
// selected cell has a quiet accent edge, 1px of the accent at 45%, and no
// ring; an editor with focus has a 2px ring of the accent around the card,
// the quiet edge still there; and a cell focused in command mode (arrow keys,
// not a click) rings the same way, keeping the card's corners.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import {
  notebookName,
  openWithToken,
  removeFromServer,
  sidebarItem,
  waitForReady,
} from './helpers';

const FILE = 'Selection focus.ipynb';

test.afterEach(() => removeFromServer(FILE));

/** The cell's edge, which the accent takes while it is selected. */
const border = (cell: ReturnType<Page['locator']>) =>
  cell.evaluate(el => getComputedStyle(el).borderTopColor);

/** The card's shadow, where the ring is. */
const shadow = (cell: ReturnType<Page['locator']>) =>
  cell.evaluate(el => getComputedStyle(el).boxShadow);

const editorFocused = (page: Page) =>
  page.evaluate(
    () => !!document.activeElement && document.activeElement.closest('.cm-editor') !== null,
  );

test('a selected cell has a quiet accent edge; a focused editor rings the card', async ({
  page,
}) => {
  const cellOf = (id: string, source: string) => ({
    cell_type: 'code',
    id,
    metadata: {},
    source,
    outputs: [],
    execution_count: null,
  });
  writeFileSync(
    join(ROOT_DIR, FILE),
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [cellOf('a', "'Io'"), cellOf('b', "'Europa'")],
    }),
  );
  await openWithToken(page);
  await sidebarItem(page, notebookName(FILE)).click();
  const cells = page.locator('.jp-Cell');
  await expect(cells.first()).toBeVisible();
  await waitForReady(page);
  const cell = cells.nth(1);

  // A cell is a card.
  await expect(cell).toHaveCSS('border-radius', '12px');

  // Click into the editor: the cell is selected and its editor focused.
  await cell.locator('.cm-content').click();
  await expect(cell).toHaveClass(/jp-mod-active/);
  expect(await editorFocused(page)).toBe(true);
  // The ring is a 2px one of the accent around the card (it eases in).
  await expect
    .poll(async () => shadow(cell), { timeout: 5_000 })
    .toMatch(/^rgb\(\d+, \d+, \d+\) 0px 0px 0px 2px$/);
  const ring = (await shadow(cell)).replace(/ 0px 0px 0px 2px$/, '');
  // The edge under it is the quieter colour, not the ring's.
  const edge = await border(cell);
  expect(edge).not.toBe(ring);
  expect(await cell.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('1px');

  // Escape leaves the cell selected with its editor unfocused: the keyboard
  // focus is the cell's, in command mode, and that rings the card too, in
  // the same 2px of the accent, keeping its corners — JupyterLab would square
  // them off and draw its own 1px line (#852). The edge stays quiet.
  await page.keyboard.press('Escape');
  await expect(cell).toHaveClass(/jp-mod-active/);
  expect(await editorFocused(page)).toBe(false);
  await expect
    .poll(async () => (await shadow(cell)).startsWith(`${ring} 0px 0px 0px 2px`), {
      timeout: 5_000,
    })
    .toBe(true);
  await expect(cell).toHaveCSS('border-radius', '12px');
  expect(await border(cell)).toBe(edge);

  // The focus elsewhere, the ring goes; the cell is still selected, its
  // edge still the quiet one.
  await page.keyboard.press('Tab');
  await expect.poll(async () => !(await shadow(cell)).includes(ring)).toBe(true);
  await expect(cell).toHaveClass(/jp-mod-active/);
  expect(await border(cell)).toBe(edge);
});
