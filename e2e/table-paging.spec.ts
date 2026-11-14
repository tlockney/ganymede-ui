// Tables past the cap page and sort through the kernel (ganymede#747,
// cdp-kernel#489): the table output's `ganymede.page` names the kernel's
// copy, and the app asks for rows over the `ganymede.table.v1` comm.
import { expect, type Page, test } from '@playwright/test';
import { waitForReady } from './helpers';

async function connectBrowser(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
}

test('a table past the cap pages and sorts through the kernel', async ({ page }) => {
  await connectBrowser(page);
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);

  await page.locator('.jp-CodeCell').last().locator('.cm-content').click();
  await page.keyboard.insertText(
    'jupyter.table(Array.from({ length: 2500 }, (_, i) => ({ n: i, name: `row ${i}` })))',
  );
  await page.keyboard.press('Shift+Enter');
  const table = page.locator('.gm-table');
  const footer = table.locator('.gm-table-footer span');
  await expect(footer).toHaveText('Rows 1–50 of 2,500', { timeout: 60_000 });

  // Past the 1,000 rows embedded: the kernel sends them.
  for (let i = 0; i < 20; i++) await table.getByRole('button', { name: 'Next rows' }).click();
  await expect(footer).toHaveText('Rows 1,001–1,050 of 2,500');
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('1000');

  // Sorting covers the whole table.
  await table.getByTitle('Sort by n', { exact: true }).click();
  await table.getByTitle('Sort by n', { exact: true }).click();
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('2499');
  await expect(footer).toHaveText('Rows 1–50 of 2,500');
});
