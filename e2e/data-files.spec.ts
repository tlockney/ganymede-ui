// CSV files open in the data view from the sidebar (#671): a table that
// sorts and filters, and a notebook made from the file.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openWithToken, removeFromServer, sidebarItem } from './helpers';

const CSV = 'name,radius_km,ok\nIo,1821.6,true\nEuropa,1560.8,false\nGanymede,2634.1,true\n';

test.afterEach(async () => {
  await removeFromServer('moons.csv', 'moons.ipynb');
});

test('opens a CSV from the sidebar as a table that sorts and filters', async ({ page }) => {
  writeFileSync(join(ROOT_DIR, 'moons.csv'), CSV);
  await openWithToken(page);
  await sidebarItem(page, 'moons.csv').click();

  const table = page.locator('.data-pane .gm-table');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('Io');
  await expect(table.locator('.gm-table-footer')).toContainText('Rows 1–3 of 3');

  // Numbers sort as numbers: descending puts Ganymede first.
  await table.getByTitle('Sort by radius_km', { exact: true }).click();
  await table.getByTitle('Sort by radius_km', { exact: true }).click();
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('Ganymede');

  await page.getByRole('searchbox', { name: 'Filter rows' }).fill('euro');
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table.locator('tbody tr').first().locator('td').first()).toHaveText('Europa');
});

test('New Notebook from File writes a notebook beside the CSV and opens it', async ({ page }) => {
  writeFileSync(join(ROOT_DIR, 'moons.csv'), CSV);
  await openWithToken(page);
  await sidebarItem(page, 'moons.csv').click();
  await page.getByRole('button', { name: 'New Notebook from File' }).click();

  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(page.locator('.jp-CodeCell .cm-content').first()).toContainText(
    'jupyter.sql.load("moons", "moons.csv")',
  );
  await expect(sidebarItem(page, 'moons')).toBeVisible();
});
