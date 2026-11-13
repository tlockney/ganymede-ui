// Open Example Notebooks (#414): the examples are copied into a new folder,
// the first opens, and their saved outputs show as trusted, with no Trust
// Notebook, in the browser's storage and on a server, which signs them.
import { expect, type Page, test } from '@playwright/test';
import { openWithToken, outputs, removeFromServer, sidebarItem, waitForReady } from './helpers';

async function openExamples(page: Page) {
  await page.getByRole('button', { name: 'Open Example Notebooks' }).click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Start Here' }).first()).toBeVisible();
  await waitForReady(page);
}

/** The saved outputs render as a trusted notebook's do. */
async function expectTrustedOutputs(page: Page) {
  await expect(page.getByTitle('Trust Notebook')).toHaveCount(0);
  // SVG drawn by a cell, shown as an image.
  await expect(page.locator('[data-mime-type="image/svg+xml"]').first()).toBeVisible();
  // HTML, in a sandboxed frame: only trusted outputs get one.
  const frame = page.locator('[data-mime-type="text/html"] iframe').first();
  await expect(frame.contentFrame().getByText('Galilean moons')).toBeVisible();
}

test('the examples open, trusted, and run in this browser', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });

  await openExamples(page);
  await expectTrustedOutputs(page);
  // Every notebook is in the new folder.
  await expect(sidebarItem(page, 'Examples')).toBeVisible();

  // The first code cell runs on the in-page kernel it asks for.
  await page.locator('.jp-CodeCell').first().click();
  await page.keyboard.press('Shift+Enter');
  await expect(page.getByText(/TypeScript \(cdp-kernel\) · Idle$/)).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    outputs(page).filter({ hasText: "[ 'Io', 'Europa', 'Ganymede', 'Callisto' ]" }),
  ).toBeVisible();

  // The browser's storage keeps the file's lines split: every SVG still
  // draws, including Graphviz's, which starts with an XML prolog.
  await page.goto(`/?open=${encodeURIComponent('Examples/03 Charts and Diagrams.ipynb')}`);
  const svgs = page.locator('[data-mime-type="image/svg+xml"] img');
  await expect(svgs).toHaveCount(6, { timeout: 60_000 });
  await expect
    .poll(() => svgs.evaluateAll(imgs => imgs.map(i => (i as HTMLImageElement).naturalWidth > 0)))
    .toEqual([true, true, true, true, true, true]);
});

// The server's folder is shared with the other specs: leave it as it was.
test.afterAll(() => removeFromServer('Examples'));

test('the examples are signed on a server, so they stay trusted', async ({ page }) => {
  await openWithToken(page);
  await openExamples(page);
  await expectTrustedOutputs(page);
  // Read back from the server: its signature, not the page's flags.
  await page.reload();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await expectTrustedOutputs(page);
});
