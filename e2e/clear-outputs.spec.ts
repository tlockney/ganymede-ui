// Clear All Outputs (#588): from the Command Palette, every output and
// execution count goes, and the notebook is unsaved.
import { expect, test } from '@playwright/test';
import { FIXTURE } from './env';
import { openNotebook, openWithToken, outputs, screenshot, waitForIdle } from './helpers';

test('clears all outputs from the command palette', async ({ page }, testInfo) => {
  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  await page.getByRole('button', { name: 'Run All' }).click();
  await expect(outputs(page).filter({ hasText: 'largest moon' })).toBeVisible();
  await waitForIdle(page);
  await expect(page.locator('.jp-CodeCell .jp-InputPrompt').first()).toHaveText(/\[\d+\]/);

  await page.getByTitle('Command Palette').click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Command' }).fill('clear all');
  await expect(palette.getByRole('option', { name: /Clear All Outputs/ })).toBeVisible();
  await screenshot(page, testInfo, 'clear-outputs-palette');
  await page.keyboard.press('Enter');

  await expect(outputs(page)).toHaveCount(0);
  await expect(page.locator('.jp-CodeCell .jp-InputPrompt').first()).not.toHaveText(/\[\d+\]/);
  await screenshot(page, testInfo, 'clear-outputs-cleared');
});
