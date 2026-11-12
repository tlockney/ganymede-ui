// The build served by Ganymede itself (`ganymede serve --static-dir dist`),
// on the server's origin: the printed token URL becomes a login cookie, and
// the app connects on it, saving through the `_xsrf` cookie the server sets.
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { FIXTURE, GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import { openNotebook, outputs, removeFromServer } from './helpers';

const COPY = 'Served by Ganymede.ipynb';

test.beforeEach(() => {
  const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  copyFileSync(join(fixtures, FIXTURE), join(ROOT_DIR, COPY));
});
test.afterEach(() => removeFromServer(COPY));

test('opens from the URL ganymede serve prints, runs a cell and saves', async ({ page }) => {
  await page.goto(`${GANYMEDE_URL}/?token=${TOKEN}`);
  // The server took the token; the app connected on the cookie, no sheet.
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByText('Where should kernels run?')).toHaveCount(0);

  await openNotebook(page, COPY);
  // Opening it to read starts no kernel; the first run does.
  await expect(page.getByText(/ · Starts when you run a cell$/)).toBeVisible();
  await page.locator('.jp-CodeCell').first().click();
  await page.keyboard.press('Shift+Enter');
  await expect(
    outputs(page).filter({ hasText: 'Ganymede is the largest moon in the solar system' }),
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');

  await expect
    .poll(() => readFileSync(join(ROOT_DIR, COPY), 'utf8'))
    .toContain('Ganymede is the largest moon in the solar system');
});

// The Apple apps load their hidden kernel page from the server, on the
// origin the notebook page's service worker controls. With a query, the
// precache missed it and the navigation fallback loaded the notebook app
// in its place, so the in-app kernel never started (#518).
test('serves the kernel page, not the app, under the service worker', async ({ page }) => {
  await page.goto(`${GANYMEDE_URL}/?token=${TOKEN}`);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 60_000,
    })
    .toBe(true);
  for (const path of ['/kernel.html', `/kernel.html?token=${TOKEN}`]) {
    await page.goto(`${GANYMEDE_URL}${path}`);
    await expect(page).toHaveTitle('Ganymede kernels');
    await expect
      .poll(() =>
        page.evaluate(() => typeof (window as { ganymedeKernelHost?: unknown }).ganymedeKernelHost),
      )
      .toBe('object');
  }
});
