// jupyter.chart in the browser kernel draws with no network (ganymede#747,
// decision 7): the app serves vega, vega-lite and linkedom itself
// (scripts/kernel-modules.ts) and maps cdp-kernel's specifiers to them.
import { expect, test } from '@playwright/test';
import { waitForReady } from './helpers';

test('a chart draws with the CDN unreachable', async ({ page }) => {
  const cdn: string[] = [];
  await page.context().route(/^https:\/\/esm\.sh\//, route => {
    cdn.push(route.request().url());
    return route.abort();
  });
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
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
