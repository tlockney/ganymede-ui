// A JupyterLab dialog's message is a <pre>: it wraps in the app, so a long
// one (a kernel's error naming a path) isn't cut off at the edge (#869).
import { expect, test } from '@playwright/test';

test("wraps a JupyterLab dialog's long message", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Try a Notebook' })).toBeVisible();
  const fits = await page.evaluate(() => {
    const body = document.createElement('div');
    body.className = 'jp-Dialog-body';
    body.style.width = '320px';
    const pre = document.createElement('pre');
    // No spaces or hyphens: only `overflow-wrap: anywhere` can break it.
    pre.textContent = `io: kernelspec ${'/Volumes/Secondary/home/dev_caches/mise/installs/node/26.8.1/bin/node'.repeat(2)}`;
    body.append(pre);
    document.body.append(body);
    const result = { scroll: pre.scrollWidth, client: pre.clientWidth };
    body.remove();
    return result;
  });
  expect(fits.scroll).toBeLessThanOrEqual(fits.client);
});
