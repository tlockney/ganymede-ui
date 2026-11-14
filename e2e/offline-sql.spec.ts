// jupyter.sql in the browser kernel runs with no network once the page
// has DuckDB's wasm and worker cached (ganymede#747): the app serves
// DuckDB's module itself (scripts/kernel-modules.ts), and the page
// fetches the wasm and worker from jsDelivr into Cache Storage
// (src/lib/duckdb-files.ts). Here jsDelivr is the package's own files.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { waitForReady } from './helpers';

const DIST = join(process.cwd(), 'node_modules/@duckdb/duckdb-wasm/dist');
const JSDELIVR =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm@[\d.]+\/dist\/([\w.-]+)$/;

/** A new notebook; the first visit picks the browser's own kernels. */
async function openNotebook(page: Page, first: boolean) {
  await page.goto('/');
  if (first) {
    await page.getByRole('radio', { name: /This browser/ }).click();
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
  }
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);
}

const cached = (page: Page) =>
  page.evaluate(async () => {
    const names = await caches.keys();
    const cache = names.find(n => n.startsWith('duckdb-wasm-'));
    if (!cache) return 0;
    return (await (await caches.open(cache)).keys()).length;
  });

test('SQL runs with the CDNs unreachable once the page has fetched DuckDB', async ({ page }) => {
  test.setTimeout(180_000);
  // First visit, online: the page fetches the eh pair in the background.
  await page.context().route(JSDELIVR, route => {
    const file = JSDELIVR.exec(route.request().url())![1];
    return route.fulfill({
      body: readFileSync(join(DIST, file)),
      contentType: file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      headers: { 'access-control-allow-origin': '*' },
    });
  });
  await openNotebook(page, true);
  await expect.poll(() => cached(page), { timeout: 60_000 }).toBe(2);

  // Then offline: no esm.sh, no jsDelivr.
  await page.context().unrouteAll();
  const cdn: string[] = [];
  await page.context().route(/^https:\/\/(esm\.sh|cdn\.jsdelivr\.net)\//, route => {
    cdn.push(route.request().url());
    return route.abort();
  });
  await openNotebook(page, false);
  await page.locator('.jp-CodeCell').last().locator('.cm-content').click();
  await page.keyboard.insertText('await jupyter.sql`select 42 as answer`');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.jp-OutputArea-output').getByText('42')).toBeVisible({
    timeout: 60_000,
  });
  expect(cdn).toEqual([]);
});
