// jupyter.chart in the browser kernel draws with no network (ganymede#747,
// decision 7): the app serves vega, vega-lite and linkedom itself
// (scripts/kernel-modules.ts) and maps cdp-kernel's specifiers to them.
// And nothing fetches DuckDB until something uses it (#794).
import { expect, test } from '@playwright/test';
import { useThisBrowser, waitForReady } from './helpers';

test('a chart draws with the CDN unreachable', async ({ page }) => {
  const cdn: string[] = [];
  await page.context().route(/^https:\/\/esm\.sh\//, route => {
    cdn.push(route.request().url());
    return route.abort();
  });
  await page.goto('/');
  await useThisBrowser(page);
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);

  await page.locator('.jp-CodeCell').last().locator('.cm-content').click();
  await page.keyboard.insertText(
    'jupyter.chart({ mark: "bar", data: { values: [{ a: "x", b: 1 }, { a: "y", b: 2 }] }, encoding: { x: { field: "a" }, y: { field: "b", type: "quantitative" } } })',
  );
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-mime-type="image/svg+xml"] img').first()).toBeVisible({
    timeout: 60_000,
  });
  expect(cdn).toEqual([]);
});

// #794: the page used to fetch DuckDB's 36 MB from jsDelivr on its first visit
// online, whether or not anything used it.
test('TypeScript and a chart run with no network, and nothing asks for DuckDB', async ({
  page,
}) => {
  const away: string[] = [];
  await page.context().route(
    url => !['127.0.0.1', 'localhost'].includes(url.hostname),
    route => {
      away.push(route.request().url());
      return route.abort();
    },
  );
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);

  const cell = page.locator('.jp-CodeCell').first();
  await cell.locator('.cm-content').click();
  await page.keyboard.insertText('const answer: number = 6 * 7;\nanswer');
  await page.keyboard.press('Shift+Enter');
  await expect(cell.locator('.jp-OutputArea-output')).toHaveText('42', { timeout: 60_000 });

  await page.locator('.jp-CodeCell').last().locator('.cm-content').click();
  await page.keyboard.insertText(
    'jupyter.chart({ mark: "bar", data: { values: [{ a: "x", b: 1 }] }, encoding: { x: { field: "a" }, y: { field: "b", type: "quantitative" } } })',
  );
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('[data-mime-type="image/svg+xml"] img').first()).toBeVisible({
    timeout: 60_000,
  });
  // The old page fetched DuckDB as it loaded, long before this.
  expect(away).toEqual([]);
  expect(
    await page.evaluate(async () => (await caches.keys()).filter(n => n.startsWith('duckdb-'))),
  ).toEqual([]);
});
