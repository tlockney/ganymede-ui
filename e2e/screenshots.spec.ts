// Screenshots of the app on Ganymede in light and dark, saved under
// test-results/screenshots (CI uploads them). They are the README's
// screenshots/ images: copy them there to refresh it. Orbits.ipynb is
// written for them: stream, result, Markdown with math, HTML, and an error,
// all in one 820-pixel-high window.
import { expect, test } from '@playwright/test';
import { TOKEN } from './env';
import { openNotebook, outputs, screenshot, waitForIdle } from './helpers';

const SHOWCASE = 'Orbits.ipynb';

test.use({ deviceScaleFactor: 2 });

for (const colorScheme of ['light', 'dark'] as const) {
  test(`screenshots (${colorScheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/?token=${TOKEN}`);
    await openNotebook(page, SHOWCASE);
    // A fresh kernel, so execution counts start at 1 in both shots.
    await page.getByRole('button', { name: 'Restart Kernel' }).click();
    await waitForIdle(page);
    await page.getByRole('button', { name: 'Run All' }).click();
    await expect(outputs(page).filter({ hasText: 'largest moon' })).toBeVisible();
    await expect(outputs(page).filter({ hasText: 'TypeError' })).toBeVisible();
    // Saved, so the title doesn't say "Edited"; the HTML cell selected.
    await page.getByRole('button', { name: /^Save/ }).click();
    await expect(page.getByText('— Edited')).toHaveCount(0);
    await page.locator('.jp-Cell').nth(4).locator('.jp-InputPrompt').click();
    await screenshot(page, testInfo, `notebook-${colorScheme}`);
  });
}
