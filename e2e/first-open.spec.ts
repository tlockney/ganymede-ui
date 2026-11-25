// First open in the browser (#815): with no saved connection the page shows
// three actions, not the connection sheet. Try a Notebook runs the sample
// in this browser with nothing from the network; Open a Notebook… takes a
// file from the device; Connect to a Server… keeps the sheet. Needs no
// server, only the production build.
import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { openConnectSheet, outputs, screenshot, tabTo, tryButton, waitForReady } from './helpers';

const RESULT = 'Ganymede is the largest moon in the solar system.';
const NOTE = 'Saved in this browser. Download a copy to keep it elsewhere.';
const SAMPLE = 'Ganymede Tour';

const DUCKDB_PREFETCH =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm@[\d.]+\/dist\/duckdb-(browser-eh\.worker\.js|eh\.wasm)$/;

/** Aborts every request to an origin other than the app's, and says which were tried. */
async function blockOtherOrigins(page: Page, baseURL: string | undefined) {
  const own = new URL(baseURL!).origin;
  const attempted: string[] = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === own) return route.continue();
    // The browser kernel warms DuckDB's files from jsDelivr in the
    // background when its first kernel starts (duckdb-files.ts); the sample
    // doesn't use SQL and the run doesn't wait for it, so it isn't counted.
    if (!DUCKDB_PREFETCH.test(route.request().url())) attempted.push(route.request().url());
    return route.abort();
  });
  return attempted;
}

const cellText = (page: Page, n: number) => page.locator('.jp-Cell .cm-content').nth(n);

test.describe('on a desktop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Try a Notebook by keyboard: runs the first cell, says where it is saved, survives a reload, downloads', async ({
    page,
    baseURL,
  }, testInfo) => {
    const attempted = await blockOtherOrigins(page, baseURL);
    await page.goto('/');
    // No sheet on a first open: three actions.
    await expect(tryButton(page)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Open a Notebook…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Connect to a Server…' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Where should kernels run?')).toHaveCount(0);
    // Nothing about servers, tokens or placement until the sheet.
    await expect(page.getByLabel('Token')).toHaveCount(0);
    await screenshot(page, testInfo, 'first-open-start-1440-light');

    await tabTo(page, tryButton(page));
    await page.keyboard.press('Enter');

    // The notebook opens with its first cell active and focused in command
    // mode: Shift-Enter runs it, with no click.
    await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
    await waitForReady(page);
    await expect(cellText(page, 0)).toContainText('Press Shift-Enter to run this cell');
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('.jp-Notebook')))
      .toBe(true);
    // Said before the first edit, and before the first run.
    const note = page.getByRole('note');
    await expect(note).toContainText(NOTE);
    await screenshot(page, testInfo, 'first-open-notebook-notice');

    await page.keyboard.press('Shift+Enter');
    await expect(outputs(page).filter({ hasText: RESULT })).toBeVisible({ timeout: 60_000 });

    // Reload: the saved connection is the browser's, the notebook is listed
    // and reopens, and no second sample is made.
    await page.reload();
    await expect(
      page.locator('.sidebar .folder-list').getByRole('button', { name: SAMPLE, exact: true }),
    ).toBeVisible({ timeout: 60_000 });
    await expect(
      page.locator('.sidebar .folder-list').getByRole('button', { name: `${SAMPLE} 2` }),
    ).toHaveCount(0);
    await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
    await expect(cellText(page, 0)).toContainText('const moon = "Ganymede"');
    await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible();
    await expect(tryButton(page)).toHaveCount(0);
    // Not dismissed, so the notice is still there; download a copy.
    await expect(page.getByRole('note')).toContainText(NOTE);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download a Copy' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${SAMPLE}.ipynb`);
    const nb = JSON.parse(readFileSync((await download.path())!, 'utf8'));
    expect(nb.nbformat).toBe(4);
    expect(nb.cells[0].cell_type).toBe('code');
    expect(nb.cells[0].source).toContain('const moon = "Ganymede"');

    // Dismissed for this origin: gone, and still gone after another reload.
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByRole('note')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('note')).toHaveCount(0);

    // No request left the page's origin (no CDN).
    expect(attempted).toEqual([]);
  });

  test('Connect to a Server… still opens the sheet, and Cancel returns to the start screen', async ({
    page,
  }) => {
    await page.goto('/');
    await openConnectSheet(page);
    await expect(page.getByRole('radio', { name: /Ganymede server/ })).toBeChecked();
    await expect(page.getByLabel('Token')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(tryButton(page)).toBeVisible();
  });

  test('Open a Notebook… saves the file in this browser and opens it', async ({ page }) => {
    await page.goto('/');
    const notebook = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: {
          name: 'cdp-browser',
          display_name: 'TypeScript (cdp-kernel)',
          language: 'typescript',
        },
      },
      cells: [
        {
          id: 'a',
          cell_type: 'code',
          metadata: {},
          source: 'const mine = 6 * 7;\nmine',
          outputs: [],
          execution_count: null,
        },
      ],
    };
    await page.locator('input[type="file"]').setInputFiles({
      name: 'Mine.ipynb',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(notebook)),
    });
    await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
    await expect(cellText(page, 0)).toContainText('const mine = 6 * 7;');
    await expect(page.getByRole('note')).toContainText(NOTE);
    await expect(page.getByRole('button', { name: 'Mine', exact: true }).first()).toBeVisible();
  });

  test('Open a Notebook… with a file that is not a notebook says so and connects nothing', async ({
    page,
  }) => {
    await page.goto('/');
    const file = page.locator('input[type="file"]');
    await file.setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hi'),
    });
    await expect(page.getByRole('alert')).toContainText('Couldn’t open “notes.txt”');
    await file.setInputFiles({
      name: 'Broken.ipynb',
      mimeType: 'application/json',
      buffer: Buffer.from('{"cells": []}'),
    });
    await expect(page.getByRole('alert')).toContainText('Couldn’t open “Broken.ipynb”');
    await expect(page.getByRole('alert')).toContainText('no nbformat');
    // Still the start screen, nothing connected or saved.
    await expect(tryButton(page)).toBeVisible();
    await expect(page.locator('.jp-Cell')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('ganymede-ui:backend'))).toBeNull();
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the start screen (${colorScheme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await expect(tryButton(page)).toBeVisible();
      await screenshot(page, testInfo, `first-open-start-1440-${colorScheme}`);
    });
  }
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Try a Notebook by touch: taps Run and gets the result', async ({
    page,
    baseURL,
  }, testInfo) => {
    const attempted = await blockOtherOrigins(page, baseURL);
    await page.goto('/');
    await expect(tryButton(page)).toBeVisible();
    const box = (await tryButton(page).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    await screenshot(page, testInfo, 'first-open-start-390-light');
    await tryButton(page).tap();
    await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
    await waitForReady(page);
    await expect(page.getByRole('note')).toContainText(NOTE);
    await screenshot(page, testInfo, 'first-open-notebook-notice-390-light');
    await page.getByRole('button', { name: /Run Cell/ }).tap();
    await expect(outputs(page).filter({ hasText: RESULT })).toBeVisible({ timeout: 60_000 });
    expect(attempted).toEqual([]);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`the start screen fits a phone (${colorScheme})`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await expect(tryButton(page)).toBeVisible();
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scroll).toBeLessThanOrEqual(390);
      for (const name of ['Try a Notebook', 'Open a Notebook…', 'Connect to a Server…']) {
        const b = (await page.getByRole('button', { name }).boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(390);
      }
      await screenshot(page, testInfo, `first-open-start-390-${colorScheme}`);
    });
  }
});

test.describe('on a phone on its side', () => {
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

  test('the start screen scrolls to Connect to a Server… in a short window', async ({ page }) => {
    await page.goto('/');
    await expect(tryButton(page)).toBeVisible();
    // Taller than the window: the last button is reached by scrolling.
    await page.getByRole('button', { name: 'Connect to a Server…' }).tap();
    await expect(page.getByRole('dialog', { name: 'Where should kernels run?' })).toBeVisible();
  });
});
