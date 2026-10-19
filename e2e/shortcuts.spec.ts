// The keyboard shortcuts sheet: from the toolbar, and from H in command mode.
import { expect, test } from '@playwright/test';
import { FIXTURE } from './env';
import { openNotebook, openWithToken } from './helpers';

test('shows the keyboard shortcuts from the toolbar and from H', async ({ page }) => {
  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  const sheet = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });

  await page.getByRole('button', { name: 'Keyboard Shortcuts' }).click();
  await expect(sheet.getByText('Run cell, select below')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  // Command mode on the first cell, then H.
  await page.locator('.jp-Cell').first().locator('.jp-InputPrompt').click();
  await page.keyboard.press('h');
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toHaveCount(0);
});

test('a shortcut added in the sheet works in the notebook and survives a reload', async ({
  page,
}) => {
  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  const sheet = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  const cells = page.locator('.jp-Cell');

  await page.getByRole('button', { name: 'Keyboard Shortcuts' }).click();
  await sheet.getByRole('button', { name: 'Add a shortcut to Insert cell below' }).click();
  await page.keyboard.press('n');
  await expect(
    sheet.getByRole('button', { name: 'Remove N from Insert cell below' }),
  ).toBeAttached();
  await sheet.getByRole('button', { name: 'Done' }).click();

  const before = await cells.count();
  await cells.first().locator('.jp-InputPrompt').click();
  await page.keyboard.press('n');
  await expect(cells).toHaveCount(before + 1);

  await page.reload();
  await openNotebook(page, FIXTURE);
  await page.getByRole('button', { name: 'Keyboard Shortcuts' }).click();
  await expect(
    sheet.getByRole('button', { name: 'Remove N from Insert cell below' }),
  ).toBeAttached();
  await sheet.getByRole('button', { name: 'Reset All' }).click();
  await expect(sheet.getByRole('button', { name: 'Remove N from Insert cell below' })).toHaveCount(
    0,
  );
});
