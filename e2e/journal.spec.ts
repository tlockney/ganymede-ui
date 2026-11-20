// The journal view (#184): a notebook an agent kept opens as a journal, with
// provenance in the gutter and code folded; the composer adds a note and an
// @agent request through the room, and they land in the notebook and on disk.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openWithToken, removeFromServer, sidebarItem } from './helpers';

const FILE = 'Journal e2e.ipynb';

const agent = (mode: string, extra: Record<string, unknown> = {}) => ({
  ganymede: { agent: { by: 'claude-code', mode, at: '2026-11-19T10:00:00Z', ...extra } },
});

test.beforeEach(() => {
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: 'cdp-node', display_name: 'Node', language: 'typescript' } },
    cells: [
      { cell_type: 'markdown', id: 'n1', source: '# Trend', metadata: agent('note') },
      {
        cell_type: 'code',
        id: 'c1',
        source: 'const rows = [1, 2, 3];\nrows.length',
        execution_count: 1,
        metadata: agent('executed', {
          history: [{ source: 'const rows = [1];', by: 'claude-code', at: '2026-11-19T09:00:00Z' }],
        }),
        outputs: [
          {
            output_type: 'execute_result',
            execution_count: 1,
            data: { 'text/plain': '3' },
            metadata: {},
          },
        ],
      },
      { cell_type: 'markdown', id: 'p1', source: 'A person’s remark', metadata: {} },
    ],
  };
  writeFileSync(join(ROOT_DIR, FILE), JSON.stringify(notebook));
});

test.afterEach(async () => {
  await removeFromServer(FILE);
});

test('opens an agent’s notebook as a journal, and writes a note and a request', async ({
  page,
}) => {
  await openWithToken(page);
  await sidebarItem(page, 'Journal e2e').click();

  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  await expect(journal).toBeVisible();
  const cells = journal.getByRole('article');
  await expect(cells).toHaveCount(3);
  await expect(cells.nth(0)).toContainText('Agent note');
  await expect(cells.nth(0).getByRole('heading', { name: 'Trend' })).toBeVisible();
  await expect(cells.nth(1)).toContainText('Agent ran it [1]');
  await expect(cells.nth(1)).toContainText('claude-code');
  await expect(cells.nth(2)).toContainText('Person');

  // Code is folded, the output is shown, and a tap unfolds.
  const fold = cells.nth(1).getByRole('button', { name: '▸ const rows = [1, 2, 3]; · 2 lines' });
  await expect(fold).toBeVisible();
  await expect(cells.nth(1).locator('.journal-output')).toContainText('3');
  await expect(cells.nth(1).locator('.journal-code')).toHaveCount(0);
  await fold.click();
  await expect(cells.nth(1).locator('.journal-code')).toContainText('rows.length');

  // The earlier source behind "rev 2".
  await cells
    .nth(1)
    .getByRole('button', { name: /Revision 2/ })
    .click();
  await expect(cells.nth(1).getByText('const rows = [1];')).toBeVisible();

  const field = journal.getByRole('textbox', { name: 'Write to the journal' });
  await field.fill('Flat after 2019');
  await journal.getByRole('button', { name: 'Add Note' }).click();
  await expect(cells).toHaveCount(4);
  await expect(cells.nth(3)).toContainText('Flat after 2019');
  await field.fill('does dropping 2019 change it?');
  await journal.getByRole('button', { name: 'Ask the agent' }).click();
  await expect(cells).toHaveCount(5);
  await expect(cells.nth(4)).toContainText('@agent does dropping 2019 change it?');

  // On disk once the server autosaves, as Markdown cells at the end.
  await expect
    .poll(() => {
      const saved = JSON.parse(readFileSync(join(ROOT_DIR, FILE), 'utf8')) as {
        cells: { cell_type: string; source: string | string[] }[];
      };
      return saved.cells.slice(3).map(c => [c.cell_type, [c.source].flat().join('')]);
    })
    .toEqual([
      ['markdown', 'Flat after 2019'],
      ['markdown', '@agent does dropping 2019 change it?'],
    ]);

  // The same room as a notebook.
  await journal.getByRole('button', { name: 'Open as Notebook' }).click();
  await expect(page.locator('.jp-Cell')).toHaveCount(5);
  await expect(journal).toBeHidden();
});

test('fits a phone: no sideways scroll and 44 px buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openWithToken(page);
  // The sidebar floats at this width; its entry opens the file.
  const item = sidebarItem(page, 'Journal e2e');
  if (!(await item.isVisible()))
    await page
      .getByRole('button', { name: /Show Sidebar|Sidebar/ })
      .first()
      .click();
  await item.click();
  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  await expect(journal).toBeVisible();
  const overflow = await journal.evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  for (const name of ['Add Note', 'Ask the agent', 'Open as Notebook']) {
    const box = await journal.getByRole('button', { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
