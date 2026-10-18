// Screenshots of the app on Ganymede in light and dark, saved under
// test-results/screenshots (CI uploads them). They are the README's
// screenshots/ images: copy them there to refresh it.
import { expect, test } from '@playwright/test';
import { FIXTURE, TOKEN } from './env';
import { notebookName, openNotebook, outputs, screenshot, sidebarItem } from './helpers';

test.use({ deviceScaleFactor: 2 });

for (const colorScheme of ['light', 'dark'] as const) {
  test(`screenshots (${colorScheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/?token=${TOKEN}`);
    await expect(sidebarItem(page, notebookName(FIXTURE))).toBeVisible();
    await screenshot(page, testInfo, `empty-${colorScheme}`);

    await openNotebook(page, FIXTURE);
    await page.getByRole('button', { name: 'Run All' }).click();
    await expect(page.locator('[data-mime-type="text/html"] table')).toBeVisible();
    await expect(outputs(page).filter({ hasText: 'largest moon' })).toBeVisible();
    await screenshot(page, testInfo, `notebook-${colorScheme}`);
  });
}
