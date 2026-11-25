// A long Markdown cell's rail is a short marker at its top (#814): past
// about twelve lines of its own prose, the active cell keeps the marker
// instead of a full-height rail; a shorter cell keeps the rail.
// src/lib/markdown-rail.ts sets the class; this checks what it looks like.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import {
  notebookName,
  openWithToken,
  removeFromServer,
  sidebarItem,
  waitForReady,
} from './helpers';

const FILE = 'Markdown rail.ipynb';

test.afterEach(() => removeFromServer(FILE));

const markdown = (id: string, source: string) => ({
  cell_type: 'markdown',
  id,
  metadata: {},
  source,
});

/** The rail (`::before`) as the browser draws it on the active cell. */
const rail = (page: Page, cell: Locator) =>
  cell.evaluate(el => ({
    height: getComputedStyle(el, '::before').height,
    top: getComputedStyle(el, '::before').top,
  }));

test('a long Markdown cell gets a short marker; a short one keeps the rail', async ({ page }) => {
  writeFileSync(
    join(ROOT_DIR, FILE),
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        // Twelve paragraphs, well past the twelve-line budget.
        markdown(
          'long',
          Array.from({ length: 12 }, (_, i) => `Paragraph ${i} of a long cell.`).join('\n\n'),
        ),
        markdown('short', 'One line.'),
      ],
    }),
  );
  await openWithToken(page);
  await sidebarItem(page, notebookName(FILE)).click();
  const cells = page.locator('.jp-Cell');
  await expect(cells.first()).toBeVisible();
  await waitForReady(page);

  // The long cell, selected: the marker, not the rail.
  const long = cells.nth(0);
  await long.locator('.jp-MarkdownOutput').click();
  await expect(long).toHaveClass(/jp-mod-active/);
  await expect.poll(async () => (await rail(page, long)).height).toBe('28px');
  expect((await rail(page, long)).top).toBe('6px');

  // The short cell, selected: the rail runs its whole height.
  const short = cells.nth(1);
  await short.locator('.jp-MarkdownOutput').click();
  await expect(short).toHaveClass(/jp-mod-active/);
  await expect
    .poll(async () =>
      short.evaluate(el => {
        const rail = parseFloat(getComputedStyle(el, '::before').height);
        return Math.abs(rail - (el.getBoundingClientRect().height - 12));
      }),
    )
    .toBeLessThan(1);
});
