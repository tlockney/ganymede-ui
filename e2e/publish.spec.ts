// Publish as Web Page (#563): the toolbar opens the sheet, and the page
// comes from the server's HTML export with its redactions.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXTURE, ROOT_DIR, TOKEN } from './env';
import { openNotebook, openWithToken } from './helpers';

test('publishes the open notebook as one web page', async ({ page }) => {
  await openWithToken(page);
  await openNotebook(page, FIXTURE);

  await page.getByRole('button', { name: 'Publish as Web Page' }).click();
  const sheet = page.getByRole('dialog', { name: `Publish ${FIXTURE}` });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('combobox').selectOption('shown');
  await sheet.getByRole('textbox', { name: /Byline/ }).fill('For the e2e run');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('button', { name: 'Publish' }).click(),
  ]);
  await expect(sheet).toBeHidden();
  expect(download.suggestedFilename()).toBe(FIXTURE.replace(/\.ipynb$/, '.html'));
  const html = readFileSync(await download.path(), 'utf8');
  expect(html).toContain('<meta name="generator" content="Ganymede ');
  expect(html).not.toContain(TOKEN);
  expect(html).not.toContain(ROOT_DIR);
});
