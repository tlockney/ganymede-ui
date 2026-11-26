// An interrupt that resets the in-page kernel's state (#796). cdp-kernel's
// browser kernel can't stop a busy cell in place, so it ends the cells'
// Worker, and a new one starts on the next cell without the earlier
// cells' variables. Since cdp-kernel#538 its stderr note says so in its
// metadata, and the notebook offers Restart & Run All. An interrupt that a
// waiting cell answers keeps the state and says nothing. Needs no server,
// only the production build.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { outputs, useThisBrowser, waitForIdle, waitForReady } from './helpers';

/** The installed cdp-kernel: its version, and whether its kernel sends the metadata. */
const kernel = (() => {
  const dir = join(process.cwd(), 'node_modules', '@tlockney', 'cdp-kernel');
  const version = (
    JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { version: string }
  ).version;
  const marks = readFileSync(join(dir, 'dist', 'browser', 'kernel.js'), 'utf8').includes(
    'state_reset',
  );
  return { version, marks };
})();

test.skip(
  !kernel.marks,
  `cdp-kernel ${kernel.version} doesn't mark a reset with state_reset metadata: that comes in the release after 0.15.0 (cdp-kernel#538)`,
);

const notice = (page: Page) => page.locator('.pane-notice.problem-state-reset');

/** A new notebook in the browser backend, with `moon` defined in its first cell. */
async function withMoon(page: Page) {
  await page.goto('/');
  await useThisBrowser(page);
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);
  await page.locator('.jp-Cell .cm-content').first().click();
  await page.keyboard.type('const moon = "Io";');
  await page.keyboard.press('Shift+Enter');
  await waitForIdle(page);
}

/** Type `code` in the cell at `index`: the Interrupt button took the focus. */
async function typeIn(page: Page, index: number, code: string) {
  await page.locator('.jp-Cell .cm-content').nth(index).click();
  await page.keyboard.type(code);
}

/** Type `code` in the active cell, run it and interrupt it once it is running. */
async function runAndInterrupt(page: Page, index: number, code: string) {
  await page.keyboard.type(code);
  await page.keyboard.press('Shift+Enter');
  const stop = page.locator('.jp-Cell').nth(index).getByRole('button', { name: 'Interrupt' });
  await stop.click({ timeout: 30_000 });
}

test('a busy cell’s interrupt says the state is gone, and Restart & Run All restores it', async ({
  page,
}) => {
  await withMoon(page);
  // Busy for good, so the interrupt always finds it running.
  await runAndInterrupt(page, 1, 'while (true) {}');
  await expect(notice(page)).toContainText('Kernel state was reset by the interrupt.');
  await waitForIdle(page);
  // The variable is gone, as the notice says.
  await typeIn(page, 2, 'moon');
  await page.keyboard.press('Shift+Enter');
  await expect(outputs(page).filter({ hasText: /moon is not defined/ })).toBeVisible();
  // The loop is fixed, as a person would before running every cell again.
  await page.locator('.jp-Cell .cm-content').nth(1).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('const busy = false;');

  await notice(page).getByRole('button', { name: 'Restart & Run All' }).click();
  await expect(notice(page)).toHaveCount(0);
  const third = page.locator('.jp-Cell').nth(2);
  await expect(third.locator('.jp-OutputArea-output')).toHaveText(/Io/, { timeout: 60_000 });
  await expect(third.getByText(/not defined/)).toHaveCount(0);
});

test('a waiting cell’s interrupt keeps the state and says nothing', async ({ page }) => {
  await withMoon(page);
  await runAndInterrupt(page, 1, 'await new Promise(r => setTimeout(r, 60_000));');
  await waitForIdle(page);
  await typeIn(page, 2, 'moon');
  await page.keyboard.press('Shift+Enter');
  await expect(page.locator('.jp-Cell').nth(2).locator('.jp-OutputArea-output')).toHaveText(/Io/);
  await expect(notice(page)).toHaveCount(0);
});
