// Selection and editor focus look different (#814, a card since #852): a
// selected cell has an accent edge and no ring while its editor is not
// focused; an editor with focus has a 2px ring of the same colour around the
// card, its edge still there.
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

test('a selected cell without editor focus has no ring; a focused editor does', async ({
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
  // The edge takes the accent (it eases in) and the ring is a 2px one of the
  // same colour, around the card.
  await expect
    .poll(async () => `${await border(cell)} ${await shadow(cell)}`, { timeout: 5_000 })
    .toMatch(/^(rgb\(\d+, \d+, \d+\)) \1 0px 0px 0px 2px$/);
  const accent = await border(cell);

  // Escape leaves the cell selected, its editor without focus: the edge
  // stays, the ring goes.
  await page.keyboard.press('Escape');
  await expect(cell).toHaveClass(/jp-mod-active/);
  expect(await editorFocused(page)).toBe(false);
  await expect.poll(async () => !(await shadow(cell)).includes(accent)).toBe(true);
  expect(await border(cell)).toBe(accent);
});
