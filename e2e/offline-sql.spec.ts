// jupyter.sql in the browser kernel runs with no network once the page
// has DuckDB's wasm and worker cached (ganymede#747): the app serves
// DuckDB's module itself (scripts/kernel-modules.ts), and the page
// fetches the wasm and worker from jsDelivr into Cache Storage
// (src/lib/duckdb-files.ts) when DuckDB is first used, or on Download in
// Settings (#794). Here jsDelivr is the package's own files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { useThisBrowser, waitForReady } from './helpers';

const DIST = join(process.cwd(), 'node_modules/@duckdb/duckdb-wasm/dist');
const JSDELIVR =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm@[\d.]+\/dist\/([\w.-]+)$/;
const CDN = /^https:\/\/(esm\.sh|cdn\.jsdelivr\.net)\//;

/** jsDelivr answers with the package's files; returns the URLs asked for. */
async function online(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.context().unrouteAll();
  await page.context().route(JSDELIVR, route => {
    asked.push(route.request().url());
    const file = JSDELIVR.exec(route.request().url())![1];
    return route.fulfill({
      body: readFileSync(join(DIST, file)),
      contentType: file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  return asked;
}

/** No esm.sh, no jsDelivr; returns the URLs asked for. */
async function offline(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.context().unrouteAll();
  await page.context().route(CDN, route => {
    asked.push(route.request().url());
    return route.abort();
  });
  return asked;
}

/** Opens the app, picking the browser's own kernels on the first visit. */
async function openApp(page: Page, first: boolean) {
  await page.goto('/');
  if (first) {
    await useThisBrowser(page);
  }
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
}

/** A new notebook, with a new kernel, without loading the page again. */
async function newNotebook(page: Page) {
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  // Only the new notebook's one cell: the last one's have gone.
  await expect(page.locator('.jp-CodeCell:visible')).toHaveCount(1);
  await waitForReady(page);
}

/** Runs SQL in the shown notebook's last cell; returns that cell. */
async function runSql(page: Page) {
  const cells = page.locator('.jp-CodeCell:visible');
  const cell = cells.nth((await cells.count()) - 1);
  await cell.locator('.cm-content').click();
  await page.keyboard.insertText('await jupyter.sql`select 42 as answer`');
  await page.keyboard.press('Shift+Enter');
  return cell;
}

const answer = (cell: Locator) =>
  expect(cell.locator('.jp-OutputArea-output').getByText('42')).toBeVisible({ timeout: 60_000 });

const cached = (page: Page) =>
  page.evaluate(async () => {
    const names = await caches.keys();
    const cache = names.find(n => n.startsWith('duckdb-wasm-'));
    if (!cache) return 0;
    return (await (await caches.open(cache)).keys()).length;
  });

test('Download in Settings prepares SQL for offline use', async ({ page }) => {
  test.setTimeout(180_000);
  const asked = await online(page);
  await openApp(page, true);
  // Nothing is fetched until asked for.
  expect(asked).toEqual([]);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Download DuckDB' }).click();
  await expect(page.getByText('Downloaded. SQL works offline in this browser.')).toBeVisible({
    timeout: 60_000,
  });
  expect(asked).toHaveLength(2);
  expect(await cached(page)).toBe(2);
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Offline, and the page loaded again: SQL runs from the cache.
  const cdn = await offline(page);
  await openApp(page, false);
  await newNotebook(page);
  await answer(await runSql(page));
  expect(cdn).toEqual([]);
});

test('SQL tried offline fetches DuckDB once the network is back, without a reload', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await offline(page);
  await openApp(page, true);
  await newNotebook(page);
  // The kernel can't reach jsDelivr, nor can the page. DuckDB's worker
  // fails to load, and since cdp-kernel 0.16.0 (cdp-kernel#539) the cell
  // fails with that error instead of waiting for good. The kernel may also
  // write a warning naming the load failure, so either output will do.
  const cell = await runSql(page);
  await expect(
    cell.locator('.jp-OutputArea-output').filter({ hasText: 'failed to load' }).first(),
  ).toBeVisible({ timeout: 60_000 });
  expect(await cached(page)).toBe(0);

  // Back online: SQL in a new kernel fetches DuckDB, for the page as well
  // as for the kernel.
  await online(page);
  await newNotebook(page);
  await answer(await runSql(page));
  await expect.poll(() => cached(page), { timeout: 60_000 }).toBe(2);

  // Offline again: a new kernel runs SQL from the cache.
  const cdn = await offline(page);
  await newNotebook(page);
  await answer(await runSql(page));
  expect(cdn).toEqual([]);
});

test('a failed download says why, and Try Again stays one line beside it', async ({ page }) => {
  await offline(page);
  await openApp(page, true);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Download DuckDB' }).click();
  const section = page.locator('section', { hasText: 'Offline SQL' });
  await expect(section.getByRole('status')).toHaveText(
    'DuckDB didn’t download: Couldn’t reach cdn.jsdelivr.net.',
  );
  // The message wraps; the button's label doesn't (the button's height
  // is fixed, so count the label's lines).
  const lines = await page.getByRole('button', { name: 'Try Again' }).evaluate(button => {
    const range = document.createRange();
    range.selectNodeContents(button);
    return new Set([...range.getClientRects()].map(r => Math.round(r.top))).size;
  });
  expect(lines).toBe(1);
  expect(await cached(page)).toBe(0);
});
