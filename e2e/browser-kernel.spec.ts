// The in-browser backend: JupyterLite's in-page server with cdp-kernel's
// browser kernel (the default) and the JavaScript kernel, cells in Web
// Workers. Needs no server, only the production build.
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
    // TypeScript: the default kernel is cdp-kernel's.
    await page.keyboard.type(
      'const moons: string[] = ["Io", "Europa", "Ganymede", "Callisto"];\n' +
        'moons.map((m: string) => m.toUpperCase()).join(" · ")',
    );
    await page.keyboard.press('Shift+Enter');
    await expect(outputs(page).filter({ hasText: 'GANYMEDE' })).toBeVisible({ timeout: 60_000 });

    await screenshot(page, testInfo, `browser-kernel-${colorScheme}`);
  });
}
