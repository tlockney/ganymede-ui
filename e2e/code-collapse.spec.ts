// Collapsing code cells (#564): the disclosure button beside a code cell,
// the keyboard, and the first line shown in place of the code.
import { expect, type Page, test } from '@playwright/test';

async function newBrowserNotebook(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeAttached({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'New Notebook' }).last().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
}

test('a code cell collapses to its first line and expands again', async ({ page }) => {
  await newBrowserNotebook(page);
  const cell = page.locator('.jp-Cell').first();
  await cell.locator('.cm-content').click();
  await page.keyboard.type('const io = 1;\nio + 1');
  await page.keyboard.press('Escape');

  const toggle = cell.getByRole('button', { name: 'Collapse Code' });
  await cell.hover();
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(cell.locator('.jp-InputPlaceholder')).toContainText('const io = 1;');
  await expect(cell.locator('.cm-editor')).toHaveCount(0);
  const expand = cell.getByRole('button', { name: 'Expand Code' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.click();
  await expect(cell.locator('.cm-editor')).toBeVisible();

  // Command mode: ⌘⌥[ / Ctrl+Alt+[ collapses, ⌘⌥] / Ctrl+Alt+] expands.
  await cell.locator('.jp-InputPrompt').click();
  await page.keyboard.press('ControlOrMeta+Alt+BracketLeft');
  await expect(cell.locator('.jp-InputPlaceholder')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Alt+BracketRight');
  await expect(cell.locator('.cm-editor')).toBeVisible();
});
