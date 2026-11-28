// Data views (#671) on WebKit: CSV/TSV/JSON/Parquet, sorting, 50-row paging, filtering,
// 10k row cap, quoted commas/newlines, UTF-8 BOM, JSON fold/search/error, offline DuckDB
// via Cache Storage, Open as Text, and New Notebook from File.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { TOKEN } from './env';
import { openWithToken, removeFromServer, sidebarItem } from './helpers';
import { fulfillDuckdbCdn, writeServerBytes, writeServerFile } from './webkit-helpers';

// Keep page.route() DuckDB CDN interception deterministic in WebKit without SW interference.
test.use({ serviceWorkers: 'block' });

const CREATED = [
  'moons-65.csv',
  'many-10005.csv',
  'moons.tsv',
  'orbit.json',
  'broken.json',
  'moons-a.parquet',
  'moons-b.parquet',
  'actions-test.csv',
  'actions-test.ipynb',
];

function build65RowsCsv(): string {
  const lines = [
    '\uFEFFname,radius_km,note',
    '"Europa, Moon",1560.8,"subsurface\nocean"',
    'Tiny Moon,9,"smaller than 100"',
    'Medium Moon,100,"numeric sort check"',
  ];
  for (let i = 4; i <= 65; i++) {
    lines.push(`Body ${i},${1000 + i},"row ${i}"`);
  }
  return `${lines.join('\n')}\n`;
}

function build10005RowsCsv(): string {
  const lines = ['idx,value'];
  for (let i = 1; i <= 10_005; i++) {
    lines.push(`${i},${i * 2}`);
  }
  return `${lines.join('\n')}\n`;
}

test.afterEach(async () => {
  await removeFromServer(...CREATED);
});

test('renders CSV with UTF-8 BOM, quoted commas/newlines, numeric sort, 50-row paging, filter, 10k cap, and TSV', async ({
  page,
  request,
}) => {
  await writeServerFile(request, 'moons-65.csv', build65RowsCsv());
  await writeServerFile(request, 'many-10005.csv', build10005RowsCsv());
  await writeServerFile(request, 'moons.tsv', 'name\tperiod_days\nIo\t1.769\nCallisto\t16.689\n');

  await openWithToken(page);
  await sidebarItem(page, 'moons-65.csv').click();

  const table = page.locator('.data-pane .gm-table');
  await expect(table).toBeVisible();

  // Header lacks UTF-8 BOM (\uFEFF) and quoted fields preserve commas + newlines.
  const firstHeader = await table.locator('thead th .gm-table-name').first().innerText();
  expect(firstHeader.trim()).toBe('name');
  expect(firstHeader.charCodeAt(0)).not.toBe(0xfeff);

  const firstRowCells = table.locator('tbody tr').first().locator('td');
  await expect(firstRowCells.nth(0)).toHaveText('Europa, Moon');
  await expect(firstRowCells.nth(2)).toContainText('subsurface');
  await expect(firstRowCells.nth(2)).toContainText('ocean');

  // 50-row paging.
  await expect(table.locator('tbody tr')).toHaveCount(50);
  const footer = page.locator('.gm-table-footer');
  await expect(footer).toContainText(/1.*50 of 65/);
  const nextBtn = page.getByRole('button', { name: 'Next rows' });
  const prevBtn = page.getByRole('button', { name: 'Previous rows' });
  await expect(prevBtn).toBeDisabled();
  await expect(nextBtn).toBeEnabled();

  await nextBtn.click();
  await expect(table.locator('tbody tr')).toHaveCount(15);
  await expect(footer).toContainText(/51.*65 of 65/);
  await expect(nextBtn).toBeDisabled();
  await prevBtn.click();
  await expect(table.locator('tbody tr')).toHaveCount(50);

  // Numeric sort: 9 < 100 < 1004 < 1560.8 (not lexicographical "100" < "9").
  await page.getByTitle('Sort by radius_km', { exact: true }).click();
  await expect(table.locator('tbody tr').first().locator('td').nth(1)).toHaveText('9');
  await expect(table.locator('tbody tr').nth(1).locator('td').nth(1)).toHaveText('100');

  // Filter narrows rows and clearing restores all 65.
  const filter = page.getByRole('searchbox', { name: 'Filter rows' });
  await filter.fill('Europa, Moon');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('Europa, Moon');

  await filter.fill('');
  await expect(footer).toContainText(/1.*50 of 65/);
  await expect(table.locator('tbody tr')).toHaveCount(50);

  // CSV > 10,000 rows displays cap notice.
  await sidebarItem(page, 'many-10005.csv').click();
  await expect(page.locator('.data-note')).toContainText('Showing the first 10,000 rows.');

  // TSV rendering.
  await sidebarItem(page, 'moons.tsv').click();
  await expect(table.locator('tbody tr')).toHaveCount(2);
  await expect(table.locator('tbody tr').nth(1).locator('td').first()).toHaveText('Callisto');
});

test('renders JSON tree folding and search, plus readable error for invalid JSON', async ({
  page,
  request,
}) => {
  await writeServerFile(
    request,
    'orbit.json',
    JSON.stringify(
      {
        jupiter: {
          moons: ['Io', 'Europa'],
          ring: { dust: 'faint' },
        },
        saturn: { moons: ['Titan'] },
      },
      null,
      2,
    ),
  );
  await writeServerFile(request, 'broken.json', '{ "bad": ');

  await openWithToken(page);
  await sidebarItem(page, 'orbit.json').click();

  const jsonTree = page.locator('.data-body .jp-RenderedJSON');
  await expect(jsonTree).toBeVisible();
  await expect(jsonTree).toContainText('jupiter');

  // Level-1 nodes start collapsed: clicking "jupiter" expands its keys, clicking "moons"
  // expands array items ("Europa"), and clicking "jupiter" again collapses the whole subtree.
  const jupiterNode = jsonTree.getByText('jupiter', { exact: true }).first();
  await expect(jsonTree).not.toContainText('moons');
  await jupiterNode.click();
  await expect(jsonTree).toContainText('moons');
  await expect(jsonTree).not.toContainText('Europa');

  await jsonTree.getByText('moons', { exact: true }).first().click();
  await expect(jsonTree).toContainText('Europa');

  await jupiterNode.click();
  await expect(jsonTree).not.toContainText('moons');
  await expect(jsonTree).not.toContainText('Europa');

  // Filter / search auto-expands matching branches and highlights matched value.
  await jsonTree.getByPlaceholder('Find…').fill('faint');
  await expect(jsonTree.locator('.jp-mod-selected')).toHaveText(/faint/i);

  // Invalid JSON reports readable alert.
  await sidebarItem(page, 'broken.json').click();
  await expect(page.locator('.data-error')).toContainText('This isn’t valid JSON:');
});

test('renders Parquet rows and Schema list online, then loads another Parquet with CDN offline via Cache Storage', async ({
  page,
  request,
}) => {
  const bytes = readFileSync(join(process.cwd(), 'e2e/data/moons.parquet'));
  await writeServerBytes(request, 'moons-a.parquet', bytes);
  await writeServerBytes(request, 'moons-b.parquet', bytes);

  let cdnRequests = 0;
  await fulfillDuckdbCdn(page, () => {
    cdnRequests += 1;
  });

  await openWithToken(page);
  await sidebarItem(page, 'moons-a.parquet').click();

  const table = page.locator('.data-pane .gm-table');
  await expect(table).toBeVisible({ timeout: 60_000 });
  const initialRowCount = await table.locator('tbody tr').count();
  expect(initialRowCount).toBeGreaterThan(0);

  const schemaSummary = page.locator('.data-schema summary');
  await expect(schemaSummary).toHaveText(/Schema \(\d+ columns\)/);
  await schemaSummary.click();
  await expect(page.locator('.data-schema')).toHaveJSProperty('open', true);

  // Wait for DuckDB-WASM runtime cache to be populated in Cache Storage.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        return keys.some(k => k.startsWith('duckdb-wasm-'));
      }),
    )
    .toBe(true);
  expect(cdnRequests).toBeGreaterThan(0);

  // Block external DuckDB CDN completely while keeping local server /api/contents reachable;
  // opening a second Parquet file must read DuckDB-WASM from Cache Storage with 0 CDN requests.
  cdnRequests = 0;
  await page.unrouteAll({ behavior: 'wait' });
  await page.route(/^https:\/\/cdn\.jsdelivr\.net\/.+$/, async route => {
    cdnRequests += 1;
    await route.abort('failed');
  });
  await sidebarItem(page, 'moons-b.parquet').click();
  await expect(table.locator('tbody tr')).toHaveCount(initialRowCount);
  await expect(page.locator('.data-schema summary')).toHaveText(/Schema \(\d+ columns\)/);
  expect(cdnRequests).toBe(0);
});

test('Open as Text posts path to native handler, saving updates re-renders DataPane, and New Notebook from File creates and opens notebook', async ({
  page,
  request,
}) => {
  await writeServerFile(request, 'actions-test.csv', 'moon,km\nIo,421700\n');

  await page.addInitScript(() => {
    const w = window as unknown as {
      __openedPaths?: Array<{ path?: string }>;
      webkit?: {
        messageHandlers?: { openFile?: { postMessage: (msg: { path?: string }) => void } };
      };
    };
    w.__openedPaths = [];
    w.webkit = {
      messageHandlers: {
        openFile: {
          postMessage: msg => {
            w.__openedPaths?.push(msg);
          },
        },
      },
    };
  });

  // Same-origin proxy URL (`url === ''`) matches the native app's own server (#855).
  await page.goto(`/?token=${encodeURIComponent(TOKEN)}&kernels=server`);
  await sidebarItem(page, 'actions-test.csv').click();

  const openAsText = page.getByRole('button', { name: 'Open as Text' });
  await expect(openAsText).toBeVisible();
  await openAsText.click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const w = window as unknown as { __openedPaths?: Array<{ path?: string }> };
        return w.__openedPaths ?? [];
      }),
    )
    .toEqual([{ path: 'actions-test.csv' }]);

  // Persist a file edit (as saved by the text editor) and verify DataPane displays it.
  await writeServerFile(request, 'actions-test.csv', 'moon,km\nGanymede,1070400\n');
  await page.reload();
  await sidebarItem(page, 'actions-test.csv').click();
  await expect(page.locator('.data-pane .gm-table')).toContainText('Ganymede');
  await expect(page.locator('.data-pane .gm-table')).toContainText('1070400');

  // New Notebook from File creates `<name>.ipynb` and opens it ready to inspect/run.
  await page.getByRole('button', { name: 'New Notebook from File' }).click();
  await expect(page.locator('.jp-Notebook')).toBeVisible();
  await expect(page.locator('.jp-Cell .cm-content').first()).toContainText('actions-test.csv');
  await expect(sidebarItem(page, 'actions-test')).toBeVisible();
});
