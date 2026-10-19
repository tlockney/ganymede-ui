// The toolbar's Download button hands the browser the notebook as .ipynb.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXTURE } from './env';
import { openNotebook, openWithToken } from './helpers';

test('downloads the open notebook', async ({ page }) => {
  await openWithToken(page);
  await openNotebook(page, FIXTURE);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Notebook' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(FIXTURE);
  const notebook = JSON.parse(readFileSync(await download.path(), 'utf8'));
  expect(notebook.nbformat).toBe(4);
  expect(notebook.cells.length).toBeGreaterThan(0);
});
