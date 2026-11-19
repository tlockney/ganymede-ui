// The DuckDB console (#679): opened from the Command Palette, it runs SQL
// on DuckDB wasm in the page, reads a CSV and a Parquet file in the folder
// by relative path, shows errors inline, and exports a notebook.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openWithToken, removeFromServer, sidebarItem } from './helpers';

const DIST = join(process.cwd(), 'node_modules/@duckdb/duckdb-wasm/dist');
const JSDELIVR =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm@[\d.]+\/dist\/([\w.-]+)$/;
const CSV = 'name,radius_km\nIo,1821.6\nEuropa,1560.8\nGanymede,2634.1\n';

test.afterEach(async () => {
  await removeFromServer('console-moons.csv', 'console-moons.parquet', 'duckdb-console.ipynb');
});

/** DuckDB's wasm and worker come from the package, not jsDelivr. */
async function serveDuckdb(page: Page) {
  await page.context().route(JSDELIVR, route => {
    const file = JSDELIVR.exec(route.request().url())![1];
    return route.fulfill({
      body: readFileSync(join(DIST, file)),
      contentType: file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

async function openConsole(page: Page) {
  await openWithToken(page);
  await page.getByTitle('Command Palette').click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Command' }).fill('duckdb');
  await expect(palette.getByRole('option', { name: /New DuckDB Console/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('.duck-console')).toBeVisible();
  await expect(page.getByText('Starting DuckDB…')).toBeHidden({ timeout: 90_000 });
}

/** Types into the console's input and presses Enter. */
async function enter(page: Page, sql: string) {
  await page.locator('.duck-input .cm-content').click();
  await page.keyboard.insertText(sql);
  await page.keyboard.press('Enter');
}

test('runs SQL, queries a CSV and a Parquet file by path, and shows errors inline', async ({
  page,
}) => {
  test.setTimeout(180_000);
  writeFileSync(join(ROOT_DIR, 'console-moons.csv'), CSV);
  copyFileSync(
    join(process.cwd(), 'e2e/data/moons.parquet'),
    join(ROOT_DIR, 'console-moons.parquet'),
  );
  await serveDuckdb(page);
  await openConsole(page);

  await enter(page, 'select 6 * 7 as answer;');
  const first = page.locator('.duck-entry').nth(0);
  await expect(first.locator('.gm-table tbody td').first()).toHaveText('42');
  await expect(first).toContainText('1 row');

  // A line with no ; ends nothing: Enter adds a line, Shift-Enter runs.
  await page.keyboard.insertText("select name from 'console-moons.csv'");
  await page.keyboard.press('Enter');
  await expect(page.locator('.duck-entry')).toHaveCount(1);
  await page.keyboard.insertText('where radius_km > 1700 order by 1');
  await page.keyboard.press('Shift+Enter');
  const csv = page.locator('.duck-entry').nth(1);
  await expect(csv.locator('.gm-table tbody tr')).toHaveCount(2);
  await expect(csv.locator('.gm-table tbody td').first()).toHaveText('Ganymede');
  await expect(csv).toContainText('read console-moons.csv');

  await enter(page, "select name from 'console-moons.parquet' order by rank limit 2;");
  const parquet = page.locator('.duck-entry').nth(2);
  await expect(parquet.locator('.gm-table tbody tr')).toHaveCount(2);
  await expect(parquet.locator('.gm-table tbody td').first()).toHaveText('Io');

  // The tables you make stay.
  await enter(
    page,
    "create table big as select * from 'console-moons.csv' where radius_km > 1600;",
  );
  await expect(page.locator('.duck-entry').nth(3)).toContainText('2 rows affected');
  await enter(page, 'select count(*) as n from big;');
  await expect(page.locator('.duck-entry').nth(4).locator('.gm-table tbody td').first()).toHaveText(
    '2',
  );

  // DuckDB's own error, inline, and the console keeps working.
  await enter(page, 'selec 1;');
  await expect(page.locator('.duck-entry').nth(5).getByRole('alert')).toContainText(
    /syntax error/i,
  );
  await enter(page, "select * from 'nope.csv';");
  await expect(page.locator('.duck-entry').nth(6).getByRole('alert')).toContainText('nope.csv');
  await enter(page, '.tables');
  await expect(page.locator('.duck-entry').nth(7).locator('.gm-table tbody td').first()).toHaveText(
    'big',
  );

  // ↑ brings back the last input.
  await page.keyboard.press('ArrowUp');
  await expect(page.locator('.duck-input .cm-content')).toHaveText('.tables');

  // Closing the console, here by opening a notebook, ends DuckDB's worker.
  expect(page.workers()).toHaveLength(1);
  await sidebarItem(page, 'Galilean moons').click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(page.locator('.duck-console')).toHaveCount(0);
  await expect.poll(() => page.workers().length).toBe(0);
});

test('Export to Notebook writes the statements that ran and opens the notebook', async ({
  page,
}) => {
  test.setTimeout(180_000);
  writeFileSync(join(ROOT_DIR, 'console-moons.csv'), CSV);
  await serveDuckdb(page);
  await openConsole(page);
  const exportButton = page.getByRole('button', { name: 'Export to Notebook' });
  await expect(exportButton).toBeDisabled();

  await enter(page, "select count(*) as n from 'console-moons.csv';");
  await expect(page.locator('.duck-entry').first().locator('.gm-table')).toBeVisible();
  await enter(page, 'selec 1;');
  await expect(page.locator('.duck-entry').nth(1).getByRole('alert')).toBeVisible();
  await exportButton.click();

  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(sidebarItem(page, 'duckdb-console')).toBeVisible();
  const code = page.locator('.jp-CodeCell .cm-content');
  await expect(code).toHaveCount(2);
  await expect(code.nth(0)).toContainText(
    'jupyter.sql.load("console_moons_file", "console-moons.csv")',
  );
  await expect(code.nth(1)).toContainText(
    "jupyter.sql`select count(*) as n from 'console-moons.csv'`",
  );
  expect(readFileSync(join(ROOT_DIR, 'duckdb-console.ipynb'), 'utf8')).not.toContain('selec 1');
});

test('closing the console during a long statement still ends DuckDB’s worker', async ({ page }) => {
  test.setTimeout(180_000);
  await serveDuckdb(page);
  await openConsole(page);
  expect(page.workers()).toHaveLength(1);

  // Far longer than the test: it never finishes, so the worker is mid-query.
  await enter(page, 'select count(*) from range(200000000000) a;');
  await expect(page.locator('.duck-entry').first()).toContainText('Running…');
  await sidebarItem(page, 'Galilean moons').click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(page.locator('.duck-console')).toHaveCount(0);
  await expect.poll(() => page.workers().length, { timeout: 15_000 }).toBe(0);
});

test('shows nested values, intervals and long timestamps as DuckDB writes them', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await serveDuckdb(page);
  await openConsole(page);
  await enter(
    page,
    "select [1.5, 2.25] as l, {'a': 1.5} as s, [date '2024-01-01'] as d, interval 1 day as i, " +
      "timestamp '2024-01-02 03:04:05.123456' as t;",
  );
  const cells = page.locator('.duck-entry').first().locator('.gm-table tbody td');
  await expect(cells).toHaveText([
    '[1.50, 2.25]',
    "{'a': 1.5}",
    '[2024-01-01]',
    '1 day',
    '2024-01-02 03:04:05.123456',
  ]);
});
