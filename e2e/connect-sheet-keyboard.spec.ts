// The connection sheet by keyboard alone (#797): a modal dialog that takes
// focus, keeps Tab inside, picks a kind with the arrow keys, and gives focus
// back to the control that opened it. From a fresh page the sheet is behind
// the start screen's Connect to a Server… (#815).
import { expect, type Page, test } from '@playwright/test';
import { tabTo } from './helpers';

const inDialog = (page: Page) =>
  page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));

test('connects to this browser and opens a notebook by keyboard only', async ({ page }) => {
  // A fresh context has no saved connection: the start screen, with no
  // sheet. Tab reaches the three actions in order; Enter on the last opens it.
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: 'Where should kernels run?' });
  await expect(page.getByRole('button', { name: 'Try a Notebook' })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const startConnect = page.getByRole('button', { name: 'Connect to a Server…' });
  await tabTo(page, page.getByRole('button', { name: 'Try a Notebook' }));
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Open a Notebook…' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(startConnect).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  const server = page.getByRole('radio', { name: /Ganymede server/ });
  const browser = page.getByRole('radio', { name: /This browser/ });
  await expect(server).toBeFocused();

  // Escape returns to the start screen, with focus on the button that opened
  // the sheet, and Enter opens it again on the chosen kind.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(startConnect).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
  await expect(server).toBeFocused();

  await page.keyboard.press('ArrowRight');
  await expect(browser).toHaveAttribute('aria-checked', 'true');
  await expect(browser).toBeFocused();

  // Tab stays in the sheet: through Cancel (offered now that the start
  // screen is behind it) and Connect, and round to the choice again.
  const connect = dialog.getByRole('button', { name: 'Connect', exact: true });
  const cancel = dialog.getByRole('button', { name: 'Cancel' });
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
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
  // Three stops (the chosen kind, Cancel and Connect), so a multiple of
  // three is back here.
  await expect(browser).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(cancel).toBeFocused();
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
