// Selection and editor focus look different (#814): a selected cell keeps
// its rail and has no ring while its editor is not focused; an editor with
// focus has a 2px ring on the editor box, rail still there.
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

/** The cell's rail (`::before`) as the browser computes it: the accent. */
const railColor = (page: Page, cell: ReturnType<Page['locator']>) =>
  cell.evaluate(el => getComputedStyle(el, '::before').backgroundColor);

/** The editor box's shadow, where the ring is. */
const shadow = (page: Page, editor: ReturnType<Page['locator']>) =>
  editor.evaluate(el => getComputedStyle(el).boxShadow);

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
  const editor = cell.locator('.jp-InputArea-editor');

  // Click into the editor: the cell is selected and its editor focused.
  await cell.locator('.cm-content').click();
  await expect(cell).toHaveClass(/jp-mod-active/);
  expect(await editorFocused(page)).toBe(true);
  const accent = await railColor(page, cell);
  // The rail is the accent, and the ring is a 2px one of the same colour,
  // on the editor box. The shadow eases in, so wait out the transition.
  expect(accent).toMatch(/rgb\(\d+, \d+, \d+\)/);
  await expect
    .poll(() => shadow(page, editor), { timeout: 5_000 })
    .toBe(`${accent} 0px 0px 0px 2px`);

  // Escape leaves the cell selected, its editor without focus: the rail
  // stays, the ring goes.
  await page.keyboard.press('Escape');
  await expect(cell).toHaveClass(/jp-mod-active/);
  expect(await editorFocused(page)).toBe(false);
  await expect.poll(async () => !(await shadow(page, editor)).includes(accent)).toBe(true);
  expect(await railColor(page, cell)).toBe(accent);
});
