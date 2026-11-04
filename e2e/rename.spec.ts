// Renaming the open notebook from its title (#202), on the in-browser
// backend's contents API: the sidebar, the window title, `?open=` and the
// running kernel follow the new name; a taken name is refused.
import { expect, type Page, test } from '@playwright/test';
import { outputs, waitForReady } from './helpers';

async function newNotebook(page: Page) {
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);
}

const title = (page: Page, name: string | RegExp) =>
  page.locator('.toolbar').getByRole('button', { name, exact: typeof name === 'string' });
const field = (page: Page) => page.getByRole('textbox', { name: 'Notebook Name' });

test('renames the open notebook from its title', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
  await newNotebook(page);
  await page.locator('.jp-Cell .cm-content').first().click();
  await page.keyboard.type('6 * 7');
  await page.keyboard.press('Shift+Enter');
  await expect(outputs(page).filter({ hasText: '42' })).toBeVisible({ timeout: 60_000 });

  // Escape leaves it as it was.
  await title(page, 'Untitled').click();
  await expect(field(page)).toBeFocused();
  await page.keyboard.type('Nope');
  await page.keyboard.press('Escape');
  await expect(title(page, 'Untitled')).toBeVisible();

  // Enter renames: everything follows, the kernel keeps running.
  await title(page, 'Untitled').click();
  await page.keyboard.type('Galilean moons');
  await page.keyboard.press('Enter');
  await expect(title(page, 'Galilean moons')).toBeVisible();
  await expect(page).toHaveTitle('Galilean moons');
  await expect(page).toHaveURL(/[?&]open=Galilean(\+|%20)moons\.ipynb/);
  const sidebar = page.locator('.sidebar');
  await expect(
    sidebar.locator('.folder-list').getByRole('button', { name: 'Galilean moons', exact: true }),
  ).toHaveCount(1);
  await expect(sidebar.getByRole('button', { name: /^Galilean moons\s*cdp-/ })).toBeVisible();
  await expect(outputs(page).filter({ hasText: '42' })).toBeVisible();
  await expect(page.getByText(/ · Idle$/)).toBeVisible();

  // A name that is taken is refused, and the field stays open to fix it.
  await newNotebook(page);
  await title(page, /^Untitled\d*$/).click();
  await page.keyboard.type('Galilean moons');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toHaveText(/“Galilean moons\.ipynb” already exists/);
  await expect(field(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(title(page, /^Untitled\d*$/)).toBeVisible();
});
