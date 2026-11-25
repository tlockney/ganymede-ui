// The connection sheet by keyboard alone (#797): a modal dialog that takes
// focus, keeps Tab inside, picks a kind with the arrow keys, and gives focus
// back to the control that opened it.
import { expect, type Page, test } from '@playwright/test';

const inDialog = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

test('connects to this browser and opens a notebook by keyboard only', async ({ page }) => {
  // A fresh context has no saved connection, so the sheet opens.
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Where should kernels run?' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const server = page.getByRole('radio', { name: /Ganymede server/ });
  const browser = page.getByRole('radio', { name: /This browser/ });
  await expect(server).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(browser).toHaveAttribute('aria-checked', 'true');
  await expect(browser).toBeFocused();

  // Tab stays in the sheet: through Connect and round to the choice again.
  const connect = dialog.getByRole('button', { name: 'Connect', exact: true });
  await page.keyboard.press('Tab');
  await expect(connect).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(browser).toBeFocused();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Shift+Tab');
    expect(await inDialog(page)).toBe(true);
  }
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    expect(await inDialog(page)).toBe(true);
  }
  // Two stops (the chosen kind and Connect), so an even count is back here.
  await expect(browser).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(connect).toBeFocused();
  await page.keyboard.press('Enter');

  const chip = page.getByRole('button', { name: /This browser/ });
  await expect(chip).toBeVisible({ timeout: 60_000 });
  await expect(dialog).toHaveCount(0);

  // A notebook from the command palette.
  await page.keyboard.press('ControlOrMeta+Shift+P');
  const command = page.getByRole('combobox', { name: 'Command' });
  await expect(command).toBeFocused();
  await page.keyboard.type('New Notebook');
  await page.keyboard.press('Enter');
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });

  // Opened from the backend chip, closed with Escape: focus goes back to it.
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(browser).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(chip).toBeFocused();

  // And with Cancel.
  await page.keyboard.press('Enter');
  await expect(browser).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(chip).toBeFocused();
});
