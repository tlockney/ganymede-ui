// Screenshots of the app on Ganymede in light and dark, saved under
// test-results/screenshots (CI uploads them). They are the README's
// screenshots/ images: copy them there to refresh it. Orbits.ipynb is
// written for them: stream, result, Markdown with math, HTML, and an error,
// all in one 820-pixel-high window.
import { expect, test } from '@playwright/test';
import { TOKEN } from './env';
import {
  openNotebook,
  outputs,
  runAll,
  screenshot,
  statusLine,
  toolbarMenu,
  waitForIdle,
} from './helpers';

const SHOWCASE = 'Orbits.ipynb';

test.use({ deviceScaleFactor: 2 });

for (const colorScheme of ['light', 'dark'] as const) {
  test(`screenshots (${colorScheme})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/?token=${TOKEN}`);
    await openNotebook(page, SHOWCASE);
    // A fresh kernel, so execution counts start at 1 in both shots: the
    // first run starts one, or a kernel left from the other shot restarts.
    // The status line still says idle from before the restart, so wait for the
    // server to finish it: cells run during the restart can be lost.
    if (
      !(await statusLine(page).locator('.status-dot').getAttribute('class'))?.includes('s-none')
    ) {
      const restarted = page.waitForResponse(
        r => r.request().method() === 'POST' && /\/api\/kernels\/[^/]+\/restart/.test(r.url()),
      );
      await toolbarMenu(page, 'More run actions', 'Restart Kernel');
      await restarted;
      await waitForIdle(page);
    }
    await runAll(page);
    // The HTML output is in a sandboxed frame.
    await expect(
      page.locator('[data-mime-type="text/html"] iframe').contentFrame().getByText('largest moon'),
    ).toBeVisible();
    await expect(outputs(page).filter({ hasText: 'TypeError' })).toBeVisible();
    // Saved, so the status line doesn't say "Edited"; the HTML cell selected.
    await toolbarMenu(page, 'More', 'Save');
    await expect(statusLine(page)).toHaveAccessibleName(/^Saved on /);
    await page.locator('.jp-Cell').nth(4).locator('.jp-InputPrompt').click();
    await screenshot(page, testInfo, `notebook-${colorScheme}`);
  });
}
