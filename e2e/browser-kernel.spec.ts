// The in-browser backend: JupyterLite's in-page server with the JavaScript
// kernel in a Web Worker. Needs no server, only the production build.
import { expect, test } from '@playwright/test';
import { outputs, screenshot, waitForIdle } from './helpers';

for (const colorScheme of ['light', 'dark'] as const) {
  test(`runs JavaScript in a Web Worker (${colorScheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    // A fresh context has no saved connection, so the sheet opens.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Where should kernels run?' })).toBeVisible();
    await page.getByRole('radio', { name: /This browser/ }).click();
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
      timeout: 60_000,
    });

    await page.getByRole('button', { name: 'New Notebook' }).first().click();
    await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
    await waitForIdle(page);

    await page.locator('.jp-Cell .cm-content').first().click();
    await page.keyboard.type(
      'const moons = ["Io", "Europa", "Ganymede", "Callisto"];\n' +
        'moons.map(m => m.toUpperCase()).join(" · ")',
    );
    await page.keyboard.press('Shift+Enter');
    await expect(outputs(page).filter({ hasText: 'GANYMEDE' })).toBeVisible({ timeout: 60_000 });

    await screenshot(page, testInfo, `browser-kernel-${colorScheme}`);
  });
}
