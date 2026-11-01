// Notebooks made elsewhere, as the app shows them to read (#133): each
// fixture in e2e/fixtures/reading (built by scripts/make-reading-fixtures.py)
// opened from the URL, as the Mac app opens a file from the Finder, and
// screenshotted in light and dark under test-results/screenshots. Nothing
// runs: the outputs are the ones saved in the files.
import { expect, test } from '@playwright/test';
import { TOKEN } from './env';
import { screenshot, waitForReady } from './helpers';

const FIXTURES = [
  'Data frames',
  'Plots',
  'Errors and long output',
  'Math and Markdown',
  'Widgets',
  'Old format',
];

test.use({ deviceScaleFactor: 2 });

for (const colorScheme of ['light', 'dark'] as const) {
  for (const name of FIXTURES) {
    test(`reads ${name} (${colorScheme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.goto(
        `/?token=${TOKEN}&kernels=server&open=${encodeURIComponent(`reading/${name}.ipynb`)}`,
      );
      await expect(page.locator('.jp-Cell').first()).toBeVisible();
      await waitForReady(page);
      const slug = name.toLowerCase().replace(/ /g, '-');
      await screenshot(page, testInfo, `reading-${slug}-${colorScheme}`);
      // The rest of the notebook, a window at a time.
      for (let i = 1; i <= 3; i++) {
        const scrolled = await page.evaluate(() => {
          const scroller = Array.from(
            document.querySelectorAll<HTMLElement>('.notebook-page *'),
          ).find(
            el =>
              el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflowY !== 'visible',
          );
          if (!scroller || scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1)
            return false;
          scroller.scrollBy(0, scroller.clientHeight * 0.9);
          return true;
        });
        if (!scrolled) break;
        await screenshot(page, testInfo, `reading-${slug}-${colorScheme}-${i}`);
      }
    });
  }
}
