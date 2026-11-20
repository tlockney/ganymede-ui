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

test('resolves a relative URL in an untrusted output without a page error (#704)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  const notebook = JSON.parse(readFileSync(join(ROOT_DIR, FILE), 'utf8')) as {
    cells: unknown[];
  };
  notebook.cells.push({
    cell_type: 'code',
    id: 'h2',
    source: 'display(html)',
    execution_count: 2,
    metadata: agent('executed'),
    outputs: [
      {
        output_type: 'display_data',
        data: { 'text/html': '<b>rel</b><img src="x">' },
        metadata: {},
      },
    ],
  });
  writeFileSync(join(ROOT_DIR, FILE), JSON.stringify(notebook));

  await openWithToken(page);
  await sidebarItem(page, 'Journal e2e').click();
  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  // Rendered as HTML, not shown as raw text.
  const cell = journal.getByRole('article').nth(3);
  await expect(cell.locator('b')).toHaveText('rel');
  await expect(cell.locator('img')).toHaveCount(1);
  await expect(cell).not.toContainText('<img');

  await journal.getByRole('button', { name: 'Open as Notebook' }).click();
  await expect(page.locator('.jp-Cell')).toHaveCount(4);
  const output = page.locator('.jp-Cell').nth(3).locator('.jp-OutputArea');
  await expect(output.locator('b')).toHaveText('rel');
  // OutputArea catches a render error and shows it as stderr text, not a page error.
  await expect(output.locator('[data-mime-type="application/vnd.jupyter.stderr"]')).toHaveCount(0);
  await expect(output).not.toContainText('process is not defined');
  expect(errors.filter(m => m.includes('process is not defined'))).toEqual([]);
});

test('fits a phone: no sideways scroll and 44 px buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openWithToken(page);
  // The sidebar starts closed at this width and floats when shown; its
  // entry opens the file. Closed, it is still in the page, off to the side,
  // so `isVisible` can't tell whether to open it: open it always.
  await page.getByRole('button', { name: 'Show Sidebar' }).click();
  await sidebarItem(page, 'Journal e2e').click();
  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  await expect(journal).toBeVisible();
  const overflow = await journal.evaluate(el => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  // The earlier-versions panel stays inside the page.
  await journal.getByRole('button', { name: /Revision 2/ }).click();
  const panel = journal.getByRole('region', { name: 'Earlier versions' });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(await journal.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  await journal.getByRole('button', { name: /Revision 2/ }).click();
  for (const name of ['Add Note', 'Ask the agent', 'Open as Notebook']) {
    const box = await journal.getByRole('button', { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test("sanitizes an untrusted cell's HTML output: no script runs, event attributes go", async ({
  page,
}) => {
  const html =
    '<b>bold</b><img src="http://127.0.0.1:1/x.png" onerror="window.__pwned = 1">' +
    '<script>window.__pwned = 2</script>';
  const notebook = JSON.parse(readFileSync(join(ROOT_DIR, FILE), 'utf8')) as {
    cells: unknown[];
  };
  // Cell metadata says it is trusted, but the file has no signature from this
  // server, so the page doesn't trust it.
  notebook.cells.push({
    cell_type: 'code',
    id: 'h1',
    source: 'display(html)',
    execution_count: 2,
    metadata: { trusted: true, ...agent('executed') },
    outputs: [{ output_type: 'display_data', data: { 'text/html': html }, metadata: {} }],
  });
  writeFileSync(join(ROOT_DIR, FILE), JSON.stringify(notebook));

  await openWithToken(page);
  await sidebarItem(page, 'Journal e2e').click();
  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  const cell = journal.getByRole('article').nth(3);
  await expect(cell).toContainText('bold');
  await expect(cell.locator('b')).toHaveCount(1);
  // The image stays, without its handler; the script is gone.
  const pic = cell.locator('img');
  await expect(pic).toHaveCount(1);
  expect(await pic.getAttribute('onerror')).toBeNull();
  await expect(cell.locator('script')).toHaveCount(0);
  // The image has failed to load (its error event has fired, so a handler would have run).
  await pic.evaluate(
    img =>
      new Promise<void>(done => {
        const i = img as HTMLImageElement;
        if (i.complete) done();
        else i.addEventListener('error', () => done());
      }),
  );
  expect(await page.evaluate(() => (window as { __pwned?: number }).__pwned)).toBeUndefined();
});
