// The journal view (#184): a notebook an agent kept opens as a journal, with
// provenance in the gutter and code folded; the composer adds a note and an
// @agent request through the room, and they land in the notebook and on disk.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { APP_URL, ROOT_DIR } from './env';
import { openWithToken, removeFromServer, sidebarItem, waitForReady } from './helpers';

const FREMONT = 'Fremont Bridge.ipynb';
/** The first cell of "4. Workdays and weekends", in the Fremont Bridge journal. */
const SECTION_4 = '57ee196d3903';

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
  await removeFromServer(FILE, FREMONT);
});

// The notebook view's header shows the eyebrow too (#852). Eyebrow, title
// and status line need more than 52px, so on a Mac it grows to 64px while
// it has one; at 52 the eyebrow was cut off at the top.
test('fits the eyebrow inside the notebook view’s header (#852)', async ({ page }) => {
  await openWithToken(page);
  await sidebarItem(page, 'Journal e2e').click();
  await expect(page.getByRole('region', { name: `Journal of ${FILE}` })).toBeVisible();
  await page
    .getByRole('group', { name: 'View: Journal' })
    .getByRole('button', { name: 'Notebook' })
    .click();
  await expect(page.locator('.jp-Cell')).toHaveCount(3);
  const eyebrow = page.locator('.toolbar .title-eyebrow');
  await expect(eyebrow).toHaveText(/^typescript · /i);
  const [toolbar, box] = await Promise.all([
    page.locator('.toolbar').boundingBox(),
    eyebrow.boundingBox(),
  ]);
  expect(toolbar!.height).toBe(64);
  expect(box!.y).toBeGreaterThanOrEqual(toolbar!.y);
  expect(box!.y + box!.height).toBeLessThanOrEqual(toolbar!.y + toolbar!.height);
});

test('opens an agent’s notebook as a journal, and writes a note and a request', async ({
  page,
}) => {
  await openWithToken(page);
  await sidebarItem(page, 'Journal e2e').click();

  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  await expect(journal).toBeVisible();
  // The header (#852): the language and the day of the earliest cell in an
  // eyebrow, then the title and who started it in the meta line.
  await expect(journal.locator('.journal-eyebrow')).toHaveText(/^typescript · /);
  await expect(journal.locator('.journal-title')).toHaveText('Journal e2e');
  await expect(journal.locator('.journal-meta')).toHaveText(/Started by claude-code · 3 cells/);
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
  // The composer is two buttons until one is used (#816).
  await expect(journal.getByRole('textbox', { name: 'Write to the journal' })).toHaveCount(0);
  for (const name of ['Add note', 'Ask the agent', 'Open as Notebook']) {
    const box = await journal.getByRole('button', { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});

test('writes a note from the phone composer, which collapses again (#816)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openWithToken(page);
  await page.getByRole('button', { name: 'Show Sidebar' }).click();
  await sidebarItem(page, 'Journal e2e').click();
  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  const add = journal.getByRole('button', { name: 'Add note' });
  const ask = journal.getByRole('button', { name: 'Ask the agent' });
  // Side by side, across the width.
  const [a, b] = [(await add.boundingBox())!, (await ask.boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThan(1);
  expect(a.width + b.width).toBeGreaterThan(390 * 0.8);

  await add.click();
  const field = journal.getByRole('textbox', { name: 'Write to the journal' });
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('placeholder', 'A note for the journal');
  await field.fill('Saw it on the phone');
  // Cancel keeps the draft for the next time.
  await journal.getByRole('button', { name: 'Cancel' }).click();
  await expect(field).toHaveCount(0);
  await add.click();
  await expect(field).toHaveValue('Saw it on the phone');
  await journal.getByRole('button', { name: 'Add Note' }).click();
  const cells = journal.getByRole('article');
  await expect(cells).toHaveCount(4);
  await expect(cells.nth(3)).toContainText('Saw it on the phone');
  await expect(field).toHaveCount(0);
  await expect(add).toBeVisible();
});

/** A solid gray PNG, `width` × `height`, base64: a wide chart's stand-in. */
function png(width: number, height: number): string {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 0, 0, 0, 0], 8); // 8-bit grayscale
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width, 0x80)]);
  const pixels = deflateSync(Buffer.concat(Array.from({ length: height }, () => row)));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', pixels),
    chunk('IEND', Buffer.alloc(0)),
  ]).toString('base64');
}

/**
 * A journal like the Fremont Bridge one (#798): wide Markdown and HTML
 * tables, wide images in Markdown (an attachment) and in outputs, long
 * unbroken text in Markdown and in a stream, and a long line of code.
 */
function richJournal() {
  const columns = Array.from({ length: 12 }, (_, i) => `Counter column ${i + 1}`);
  const markdownTable = [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---:').join(' | ')} |`,
    ...[2019, 2020, 2021].map(y => `| ${columns.map((_, i) => `${y}-${1000 + i}`).join(' | ')} |`),
  ].join('\n');
  const htmlTable =
    '<table class="dataframe"><thead><tr>' +
    columns.map(c => `<th>${c}</th>`).join('') +
    '</tr></thead><tbody><tr>' +
    columns.map((_, i) => `<td>${123456 + i}</td>`).join('') +
    '</tr></tbody></table>';
  // No hyphens or other break points: only overflow-wrap can break it.
  const longWord = 'https://data.seattle.gov/' + 'fremontbridgebicyclecounter'.repeat(14);
  const chart = png(1600, 60);
  const cells = [
    { cell_type: 'markdown', id: 'r0', source: '# Fremont Bridge', metadata: agent('note') },
    {
      cell_type: 'markdown',
      id: 'r1',
      source: `## Totals by counter\n\n${markdownTable}`,
      metadata: agent('note'),
    },
    {
      cell_type: 'markdown',
      id: 'r2',
      source: `Source: ${longWord}\n\n\`\`\`\n${'x'.repeat(300)}\n\`\`\``,
      metadata: agent('note'),
    },
    {
      cell_type: 'markdown',
      id: 'r3',
      source: '![daily counts](attachment:chart.png)',
      attachments: { 'chart.png': { 'image/png': chart } },
      metadata: agent('note'),
    },
    {
      cell_type: 'code',
      id: 'r4',
      source: 'df.pivot_table()',
      execution_count: 1,
      metadata: agent('executed'),
      outputs: [
        {
          output_type: 'execute_result',
          execution_count: 1,
          data: { 'text/html': htmlTable, 'text/plain': 'table' },
          metadata: {},
        },
      ],
    },
    {
      cell_type: 'code',
      id: 'r5',
      source: 'plot(daily)',
      execution_count: 2,
      metadata: agent('executed'),
      outputs: [
        { output_type: 'stream', name: 'stdout', text: longWord },
        { output_type: 'display_data', data: { 'image/png': chart }, metadata: {} },
      ],
    },
    {
      cell_type: 'markdown',
      id: 'r6',
      source: '| a | b |\n| --- | --- |\n| 1 | 2 |',
      metadata: agent('note'),
    },
    {
      cell_type: 'markdown',
      id: 'r7',
      source: '$$' + Array.from({ length: 60 }, (_, i) => `x_{${i}}`).join('+') + '$$',
      metadata: agent('note'),
    },
  ];
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { name: 'cdp-node', display_name: 'Node', language: 'typescript' } },
    cells,
  };
}

for (const { name, width, height } of [
  { name: 'a phone', width: 390, height: 844 },
  { name: 'a desktop', width: 1280, height: 820 },
]) {
  test(`keeps wide content in its own scroll box on ${name} (#798)`, async ({ page }) => {
    writeFileSync(join(ROOT_DIR, FILE), JSON.stringify(richJournal()));
    await page.setViewportSize({ width, height });
    await openWithToken(page);
    const sidebar = page.getByRole('button', { name: 'Show Sidebar' });
    if (width < 600) await sidebar.click();
    await sidebarItem(page, 'Journal e2e').click();
    const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
    const cells = journal.getByRole('article');
    await expect(cells).toHaveCount(8);
    // Everything has rendered: the tables, both images and the equation.
    await expect(journal.locator('table')).toHaveCount(3);
    const tables = journal.locator('table').filter({ hasText: 'Counter column 12' });
    await expect(tables).toHaveCount(2);
    const equation = cells.nth(7).locator("mjx-container[display='true']");
    await expect(equation).toHaveCount(1);
    const images = journal.locator('img');
    await expect(images).toHaveCount(2);
    await expect(cells.nth(5).locator('img')).toHaveCount(1);
    await expect
      .poll(() => images.evaluateAll(els => els.every(i => (i as HTMLImageElement).complete)))
      .toBe(true);

    // No sideways scroll: not the page, not the journal, not its scroll area.
    const scroll = journal.locator('.journal-scroll');
    expect(await scroll.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(await journal.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(0);

    // Each cell's body stays inside the column.
    const column = await journal.locator('.journal-content').evaluate(el => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return {
        left: r.left + parseFloat(s.paddingLeft),
        right: r.right - parseFloat(s.paddingRight),
      };
    });
    for (const box of await journal
      .locator('.journal-body')
      .evaluateAll(els => els.map(e => e.getBoundingClientRect().toJSON() as DOMRect))) {
      expect(box.left).toBeGreaterThanOrEqual(column.left - 0.5);
      expect(box.right).toBeLessThanOrEqual(column.right + 0.5);
    }

    // Images shrink to the column, keeping their shape (1600 × 60).
    for (const box of await images.evaluateAll(els =>
      els.map(e => e.getBoundingClientRect().toJSON() as DOMRect),
    )) {
      expect(box.right).toBeLessThanOrEqual(column.right + 0.5);
      expect(Math.abs(box.width / box.height - 1600 / 60)).toBeLessThan(0.5);
    }

    // Both tables are wider than the column and scroll in their own box:
    // the nearest scrollable ancestor is no wider than the column.
    for (const table of await tables.all()) {
      const local = await table.evaluate(el => {
        let box: HTMLElement | null = el as HTMLElement;
        while (
          box &&
          !(box.scrollWidth > box.clientWidth && getComputedStyle(box).overflowX !== 'visible')
        )
          box = box.parentElement;
        if (!box) return undefined;
        const r = box.getBoundingClientRect();
        return {
          scroller: box.classList.contains('journal-scroll'),
          left: r.left,
          right: r.right,
          before: box.scrollLeft,
          after: ((box.scrollLeft = 200), box.scrollLeft),
        };
      });
      expect(local).toBeDefined();
      expect(local!.scroller).toBe(false);
      expect(local!.right).toBeLessThanOrEqual(column.right + 0.5);
      expect(local!.after).toBeGreaterThan(local!.before);
    }
    // The long equation scrolls in its own box too.
    expect(await equation.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0);
    // ...sideways only. MathJax overhangs its box by a pixel or two
    // (scrollHeight stays above clientHeight whatever overflow-y is), so
    // what keeps it from scrolling vertically is overflow-y: hidden.
    expect(await equation.evaluate(el => getComputedStyle(el).overflowY)).toBe('hidden');
    const eqBox = (await equation.boundingBox())!;
    expect(eqBox.x + eqBox.width).toBeLessThanOrEqual(column.right + 0.5);

    // A narrow table keeps its own width and stays centered in the
    // Markdown's content box (JupyterLab pads its right side).
    const narrow = await cells
      .nth(6)
      .locator('.jp-RenderedMarkdown')
      .evaluate(el => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        const left = r.left + parseFloat(s.paddingLeft);
        const right = r.right - parseFloat(s.paddingRight);
        const table = el.querySelector('table')!.getBoundingClientRect();
        const row = el.querySelector('tr')!.getBoundingClientRect();
        return {
          table: table.width,
          row: row.width,
          offset: table.left + table.width / 2 - (left + right) / 2,
        };
      });
    expect(narrow.row).toBeGreaterThan(0);
    expect(Math.abs(narrow.table - narrow.row)).toBeLessThan(2);
    expect(Math.abs(narrow.offset)).toBeLessThan(1);
    // Long text wraps rather than widening the Markdown.
    const markdown = cells.nth(2).locator('.journal-rendered').first();
    expect(await markdown.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0);
  });
}

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

// Where a journal opens, and following it live (#816), with the real Fremont
// Bridge journal an agent kept: 29 cells, six sections.

/** Put the Fremont Bridge journal in the server's folder. */
function writeFremont() {
  writeFileSync(
    join(ROOT_DIR, FREMONT),
    readFileSync(new URL('./fixtures/journal/Fremont Bridge.ipynb', import.meta.url)),
  );
}

const journalOf = (page: Page) => page.getByRole('region', { name: `Journal of ${FREMONT}` });

async function openFremont(page: Page) {
  await openWithToken(page);
  await sidebarItem(page, 'Fremont Bridge').click();
  const journal = journalOf(page);
  await expect(journal).toBeVisible();
  await expect(journal.getByRole('article')).toHaveCount(29);
  return journal;
}

/** How far a cell's top is below the top of the journal's scroll area, in px. */
const topOf = (page: Page, id: string) =>
  page.evaluate((cell: string) => {
    const scroller = document.querySelector('.journal-scroll')!;
    const article = [...scroller.querySelectorAll<HTMLElement>('.journal-cell')].find(
      a => a.dataset.cellId === cell,
    )!;
    return article.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  }, id);

/** How far the scroll area is from its end, in px. */
const fromEnd = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector('.journal-scroll')!;
    return s.scrollHeight - s.scrollTop - s.clientHeight;
  });

const scrollTop = (page: Page) =>
  page.evaluate(() => document.querySelector('.journal-scroll')!.scrollTop);

/**
 * Wait until the journal's content stops changing height: framed outputs
 * (the plots) load after the cells, and on a slow machine a scroll made
 * before they settle lands somewhere else.
 */
async function settled(page: Page) {
  let last = -1;
  await expect
    .poll(
      async () => {
        const h = await page.evaluate(
          () => document.querySelector('.journal-scroll')!.scrollHeight,
        );
        const same = h === last;
        last = h;
        return same;
      },
      { intervals: [500], timeout: 20_000 },
    )
    .toBe(true);
}

/** Scroll a cell to the top of the journal. */
const scrollToCell = (page: Page, id: string) =>
  page.evaluate((cell: string) => {
    document
      .querySelector(`.journal-cell[data-cell-id="${cell}"]`)!
      .scrollIntoView({ block: 'start' });
  }, id);

/** Another person in the same room: a second browser opening the journal. */
async function someoneElse(browser: Browser) {
  const context = await browser.newContext({
    baseURL: APP_URL,
    viewport: { width: 1280, height: 820 },
  });
  const page = await context.newPage();
  await openFremont(page);
  const note = async (text: string) => {
    const journal = journalOf(page);
    const before = await journal.getByRole('article').count();
    await journal.getByRole('textbox', { name: 'Write to the journal' }).fill(text);
    await journal.getByRole('button', { name: 'Add Note' }).click();
    await expect(journal.getByRole('article')).toHaveCount(before + 1);
  };
  return { note, close: () => context.close() };
}

test('opens a finished journal at its start, with no Follow button (#816)', async ({ page }) => {
  writeFremont();
  const journal = await openFremont(page);
  const question = journal.getByRole('heading', {
    name: 'Have bike commutes over the Fremont Bridge come back since 2019?',
  });
  await expect(question).toBeVisible();
  expect(await scrollTop(page)).toBe(0);
  const top = await question.evaluate(
    el =>
      el.getBoundingClientRect().top -
      document.querySelector('.journal-scroll')!.getBoundingClientRect().top,
  );
  expect(top).toBeLessThan(120);
  // The server writes the notebook's metadata a moment after it opens (the kernel
  // starting); that is not live work.
  await page.waitForTimeout(3000);
  await expect(journal.getByRole('button', { name: /Follow live/ })).toHaveCount(0);
});

test('reopens at the cell the reader left (#816)', async ({ page }) => {
  writeFremont();
  const journal = await openFremont(page);
  await settled(page);
  await scrollToCell(page, SECTION_4);
  await expect.poll(() => topOf(page, SECTION_4)).toBeLessThan(2);
  // Kept as they read, at most twice a second.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('ganymede.journal.positions') ?? ''))
    .toContain(SECTION_4);

  // Leave for another file, and come back.
  await sidebarItem(page, 'Journal e2e').click();
  await expect(page.getByRole('region', { name: `Journal of ${FILE}` })).toBeVisible();
  await sidebarItem(page, 'Fremont Bridge').click();
  await expect(journal).toBeVisible();
  await expect(journal.getByRole('heading', { name: '4. Workdays and weekends' })).toBeInViewport();
  await expect.poll(async () => Math.abs(await topOf(page, SECTION_4))).toBeLessThan(4);
  // Nothing new since: no button.
  await expect(journal.getByRole('button', { name: /Follow live/ })).toHaveCount(0);
});

test('keeps the end in view while following, and says what is new once paused (#816)', async ({
  page,
  browser,
}) => {
  writeFremont();
  const journal = await openFremont(page);
  const other = await someoneElse(browser);
  try {
    // A change from someone else, read from the start: offered, not followed.
    await other.note('First note from elsewhere');
    const follow = journal.getByRole('button', { name: '1 new · Follow live' });
    await expect(follow).toBeVisible();
    expect(await scrollTop(page)).toBe(0);
    await follow.click();
    await expect.poll(() => fromEnd(page)).toBeLessThan(4);
    await expect(journal.getByRole('button', { name: /Follow live/ })).toHaveCount(0);

    // Following: more cells arrive, and the end stays in view.
    await other.note('Second note from elsewhere');
    await expect(journal.getByRole('article').last()).toContainText('Second note from elsewhere');
    await expect.poll(() => fromEnd(page)).toBeLessThan(4);
    await expect(journal.getByRole('article').last()).toBeInViewport();
    await expect(journal.getByRole('button', { name: /Follow live/ })).toHaveCount(0);

    // Scrolled up: paused, the place is kept and the count says what came.
    await page.locator('.journal-scroll').hover();
    await page.mouse.wheel(0, -1500);
    await expect.poll(() => fromEnd(page)).toBeGreaterThan(500);
    const held = await scrollTop(page);
    await other.note('Third note from elsewhere');
    await other.note('Fourth note from elsewhere');
    const count = journal.getByRole('button', { name: '2 new · Follow live' });
    await expect(count).toBeVisible();
    expect(Math.abs((await scrollTop(page)) - held)).toBeLessThan(4);
    await count.click();
    await expect.poll(() => fromEnd(page)).toBeLessThan(4);
    await expect(journal.getByRole('article').last()).toContainText('Fourth note from elsewhere');
    await expect(journal.getByRole('button', { name: /Follow live/ })).toHaveCount(0);
  } finally {
    await other.close();
  }
});

test('keeps the cell in view going to the notebook and back (#816)', async ({ page }) => {
  writeFremont();
  const journal = await openFremont(page);
  await settled(page);
  await scrollToCell(page, SECTION_4);
  await expect.poll(() => topOf(page, SECTION_4)).toBeLessThan(2);

  await journal.getByRole('button', { name: 'Open as Notebook' }).click();
  await expect(journal).toBeHidden();
  const heading = page.locator('.jp-Cell').filter({ hasText: '4. Workdays and weekends' });
  await expect(heading).toBeInViewport();
  await expect(heading).toHaveClass(/jp-mod-active/);
  // At the top of the notebook, as the journal had it.
  const near = () =>
    heading.evaluate(el => {
      const outer = el.closest('.jp-WindowedPanel-outer') ?? el.closest('.jp-Notebook')!;
      return el.getBoundingClientRect().top - outer.getBoundingClientRect().top;
    });
  // Under the toolbar, not further down the page.
  await expect.poll(async () => Math.abs(await near())).toBeLessThan(150);

  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('menuitem', { name: 'View as Journal' }).click();
  await expect(journal).toBeVisible();
  await expect.poll(async () => Math.abs(await topOf(page, SECTION_4))).toBeLessThan(4);
  await expect(journal.getByRole('heading', { name: '4. Workdays and weekends' })).toBeInViewport();
});

test('names the view in the header, and switching from it keeps the cell (#819)', async ({
  page,
}) => {
  writeFremont();
  const journal = await openFremont(page);
  await settled(page);
  await scrollToCell(page, SECTION_4);
  await expect.poll(() => topOf(page, SECTION_4)).toBeLessThan(2);

  // The header names the mode; the other part switches, as the ⋯ item does.
  const view = page.getByRole('group', { name: 'View: Journal' });
  await expect(view.getByRole('button', { name: 'Notebook' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  // Beside the title, not at the far end of the status line.
  const [titleBox, viewBox] = await Promise.all([
    page.locator('.toolbar .title-button').boundingBox(),
    view.boundingBox(),
  ]);
  expect(viewBox!.x - (titleBox!.x + titleBox!.width)).toBeLessThan(20);
  // With room in the toolbar the title shows whole: its box is not clipped.
  expect(
    await page.locator('.toolbar .title-button').evaluate(el => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(0);
  await view.getByRole('button', { name: 'Notebook' }).click();
  await expect(journal).toBeHidden();
  const heading = page.locator('.jp-Cell').filter({ hasText: '4. Workdays and weekends' });
  await expect(heading).toBeInViewport();
  await expect(heading).toHaveClass(/jp-mod-active/);

  await page
    .getByRole('group', { name: 'View: Notebook' })
    .getByRole('button', { name: 'Journal' })
    .click();
  await expect(journal).toBeVisible();
  await expect.poll(async () => Math.abs(await topOf(page, SECTION_4))).toBeLessThan(4);
  await expect(journal.getByRole('heading', { name: '4. Workdays and weekends' })).toBeInViewport();
});

test('fits the header control on a phone, which still switches (#819)', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await openWithToken(page);
  await page.getByRole('button', { name: 'Show Sidebar' }).click();
  await sidebarItem(page, 'Journal e2e').click();
  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  await expect(journal).toBeVisible();

  const view = page.getByRole('group', { name: 'View: Journal' });
  await expect(view).toBeVisible();
  // The title and its status line still fit: no sideways scroll.
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(0);
  // And they show whole, as they do without the control: neither the title
  // nor the visible status line is clipped to its box.
  await waitForReady(page);
  const title = page.locator('.toolbar .title');
  await expect(title).toHaveText('Journal e2e');
  const status = page.locator('.toolbar .status-text');
  await expect(status).toContainText('Runs');
  for (const part of [page.locator('.toolbar .title-button'), status]) {
    const clipped = await part.evaluate(
      n => n.scrollWidth - n.clientWidth > 1 || n.scrollHeight - n.clientHeight > 1,
    );
    expect(clipped).toBe(false);
  }
  // A touch screen: targets of 44px, and the box ends at its buttons, which
  // share its width.
  for (const name of ['Notebook', 'Journal']) {
    const box = await view.getByRole('button', { name }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  const switchBox = (await view.boundingBox())!;
  const [first, second] = await Promise.all([
    view.getByRole('button', { name: 'Notebook' }).boundingBox(),
    view.getByRole('button', { name: 'Journal' }).boundingBox(),
  ]);
  expect(first!.x - switchBox.x).toBeLessThanOrEqual(2);
  expect(switchBox.x + switchBox.width - (second!.x + second!.width)).toBeLessThanOrEqual(2);
  expect(first!.width + second!.width).toBeGreaterThanOrEqual(switchBox.width - 4);
  // In the journal view the control's own row grows the toolbar by its
  // 44px: 52 + 44, with no safe-top in a plain page, as the 52 below.
  expect((await page.locator('.toolbar').boundingBox())!.height).toBe(96);
  await view.getByRole('button', { name: 'Notebook' }).click();
  await expect(page.locator('.jp-Cell')).toHaveCount(3);
  // The notebook on a phone keeps its header height: the view is in ⋯.
  await expect(page.getByRole('group', { name: /^View/ })).toHaveCount(0);
  expect((await page.locator('.toolbar').boundingBox())!.height).toBe(52);
});

// Wider than the phone's 720px, on a touch screen: the control still fits
// the toolbar's fixed 52px, spanning the title and the status line.
test.describe('a touch screen wider than a phone', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('spans the header control over the title and its status line (#819)', async ({ page }) => {
    await openWithToken(page);
    await sidebarItem(page, 'Journal e2e').click();
    const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
    await expect(journal).toBeVisible();
    // The notebook view, which keeps the header control at this width.
    await page
      .getByRole('group', { name: 'View: Journal' })
      .getByRole('button', { name: 'Notebook' })
      .click();
    await expect(journal).toBeHidden();
    await expect(page.locator('.jp-Cell')).toHaveCount(3);

    const view = page.getByRole('group', { name: 'View: Notebook' });
    await expect(view).toBeVisible();
    // A touch screen: targets of 44px.
    for (const name of ['Notebook', 'Journal']) {
      expect(
        (await view.getByRole('button', { name }).boundingBox())!.height,
      ).toBeGreaterThanOrEqual(44);
    }
    // The 'title mode' / 'status mode' grid: the control to the right of the
    // title, spanning it and the status line, which stays under the title.
    const [title, status, mode, toolbar] = await Promise.all([
      page.locator('.toolbar .title').boundingBox(),
      page.locator('.toolbar .status-line').boundingBox(),
      view.boundingBox(),
      page.locator('.toolbar').boundingBox(),
    ]);
    expect(mode!.x).toBeGreaterThanOrEqual(title!.x + title!.width);
    expect(status!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
    expect(mode!.y).toBeLessThanOrEqual(title!.y);
    expect(mode!.y + mode!.height).toBeGreaterThanOrEqual(status!.y + status!.height);
    // The grid's own word for where the title and the status line sit.
    // Geometry alone can't pin this: auto-placement lands the same cells,
    // so the areas are asserted by name.
    await expect(page.locator('.toolbar .title')).toHaveCSS('grid-area', 'title');
    await expect(page.locator('.toolbar .status-line')).toHaveCSS('grid-area', 'status');
    // Inside the toolbar's fixed 52px, with nothing over the control.
    expect(toolbar!.height).toBe(52);
    expect(mode!.y + mode!.height).toBeLessThanOrEqual(toolbar!.y + toolbar!.height);
    expect(
      await page.evaluate(
        ({ x, y }) => {
          const hit = document.elementFromPoint(x, y);
          return !!hit?.closest('.mode-switch');
        },
        { x: mode!.x + mode!.width / 2, y: mode!.y + mode!.height / 2 },
      ),
    ).toBe(true);
  });
});

test('keeps a one-line wide cell its scrollbar room after the journal and back (#841)', async ({
  page,
}) => {
  const wide = 'Wide one-line e2e.ipynb';
  writeFileSync(
    join(ROOT_DIR, wide),
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { name: 'cdp-node', display_name: 'Node', language: 'typescript' } },
      cells: [
        {
          cell_type: 'code',
          id: 'w1',
          metadata: {},
          outputs: [],
          execution_count: null,
          source: `const long = ${'"abcdefghij" + '.repeat(40)}1;`,
        },
      ],
    }),
  );
  try {
    await openWithToken(page);
    await sidebarItem(page, 'Wide one-line e2e').click();
    const editor = page.locator('.jp-CodeCell .jp-InputArea-editor').first();
    await expect(editor).toBeVisible();
    const before = await editor.evaluate(el => el.getBoundingClientRect().height);

    await page
      .getByRole('group', { name: 'View: Notebook' })
      .getByRole('button', { name: 'Journal' })
      .click();
    await expect(page.getByRole('region', { name: `Journal of ${wide}` })).toBeVisible();
    // Under the journal the notebook keeps its layout, out of sight and reach.
    const notebook = page.locator('.notebook-page');
    await expect(notebook).toBeHidden();
    expect(
      await notebook.evaluate(el => ({
        visibility: getComputedStyle(el).visibility,
        laidOut: el.getBoundingClientRect().height > 0,
        editorLaidOut: el.querySelector('.jp-InputArea-editor')!.getBoundingClientRect().height > 0,
      })),
    ).toEqual({ visibility: 'hidden', laidOut: true, editorLaidOut: true });
    // A click where the cell is lands in the journal, not the notebook.
    const box = (await editor.boundingBox())!;
    expect(
      await page.evaluate(
        ([x, y]) => {
          const hit = document.elementFromPoint(x!, y!);
          return {
            journal: !!hit?.closest('.journal'),
            notebook: !!hit?.closest('.notebook-page'),
          };
        },
        [box.x + box.width / 2, box.y + box.height / 2],
      ),
    ).toEqual({ journal: true, notebook: false });
    const content = page.locator('.jp-CodeCell .cm-content').first();
    await content.focus();
    expect(await content.evaluate(el => el.contains(document.activeElement))).toBe(false);

    await page
      .getByRole('group', { name: 'View: Journal' })
      .getByRole('button', { name: 'Notebook' })
      .click();
    await expect(editor).toBeVisible();
    expect(await editor.evaluate(el => el.getBoundingClientRect().height)).toBe(before);
  } finally {
    await removeFromServer(wide);
  }
});
