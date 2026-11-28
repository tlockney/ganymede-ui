// DuckDB console (#679) on WebKit: online execution, offline Cache Storage restart,
// subsequent `duckdb-console 2.ipynb` export naming, and narrow dark-mode scrolling.
import { expect, test } from '@playwright/test';
import { openWithToken, outputs, removeFromServer, sidebarItem } from './helpers';
import { expectNoHorizontalOverflow, fulfillDuckdbCdn, runPaletteCommand } from './webkit-helpers';

// Keep page.route() DuckDB CDN interception deterministic in WebKit without SW interference.
test.use({ serviceWorkers: 'block' });

test.afterEach(async () => {
  await removeFromServer('duckdb-console.ipynb', 'duckdb-console 2.ipynb');
});

test('runs queries online, starts a second console offline from Cache Storage, and increments Export to Notebook filenames', async ({
  page,
  context,
}) => {
  let cdnRequests = 0;
  await fulfillDuckdbCdn(page, () => {
    cdnRequests += 1;
  });

  await openWithToken(page);
  await runPaletteCommand(page, 'New DuckDB Console');

  const input = page.locator('.duck-console .duck-input .cm-content');
  await expect(input).toBeVisible();

  await input.click();
  await page.keyboard.insertText("SELECT 'Europa' AS moon, 1561 AS radius_km;");
  await page.keyboard.press('Enter');

  const entry = page.locator('.duck-log .duck-entry').first();
  await expect(entry).toContainText('Europa', { timeout: 60_000 });
  await expect(entry).toContainText('1561');
  expect(cdnRequests).toBeGreaterThan(0);

  // Ensure DuckDB WASM files were written to Cache Storage before going offline.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const keys = await caches.keys();
        return keys.some(k => k.startsWith('duckdb-wasm-'));
      }),
    )
    .toBe(true);

  // First Export to Notebook writes `duckdb-console.ipynb`.
  await page.getByRole('button', { name: 'Export to Notebook' }).click();
  await expect(page.locator('.jp-Notebook')).toBeVisible();
  await expect(sidebarItem(page, 'duckdb-console')).toBeVisible();
  await expect(page.locator('.jp-Cell .cm-content').last()).toContainText('Europa');

  // Switch offline and start a brand new DuckDB console — it must boot and execute from cache.
  cdnRequests = 0;
  await context.setOffline(true);
  try {
    await runPaletteCommand(page, 'New DuckDB Console');
    const offlineInput = page.locator('.duck-console .duck-input .cm-content');
    await expect(offlineInput).toBeVisible();
    await offlineInput.click();
    await page.keyboard.insertText("SELECT 'Callisto' AS moon, 2410 AS radius_km;");
    await page.keyboard.press('Enter');

    const offlineEntry = page.locator('.duck-log .duck-entry').first();
    await expect(offlineEntry).toContainText('Callisto', { timeout: 60_000 });
    await expect(offlineEntry).toContainText('2410');
    expect(cdnRequests).toBe(0);
  } finally {
    await context.setOffline(false);
  }

  // Second Export to Notebook must create `duckdb-console 2.ipynb`.
  await page.getByRole('button', { name: 'Export to Notebook' }).click();
  await expect(page.locator('.jp-Notebook')).toBeVisible();
  await expect(sidebarItem(page, 'duckdb-console 2')).toBeVisible();

  // Verify the exported notebook contains our SQL and executes cleanly via Run All Cells.
  await expect(page.locator('.jp-Cell .cm-content').last()).toContainText('Callisto');
  await runPaletteCommand(page, 'Run All Cells');
  await expect(outputs(page).filter({ hasText: 'Callisto' }).first()).toBeVisible({
    timeout: 60_000,
  });
});

test('keeps narrow dark-mode console scrollback, input, and wide tables scrollable without horizontal page overflow', async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    colorScheme: 'dark',
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  try {
    await fulfillDuckdbCdn(page);
    await openWithToken(page);

    await expect
      .poll(() => page.evaluate(() => document.body.dataset.jpThemeName ?? ''))
      .toBe('JupyterLab Dark');

    // Narrow drawer starts open on mobile/narrow only when toggled; close sidebar if open.
    const hideSidebar = page.getByRole('button', { name: 'Hide Sidebar' });
    if (await hideSidebar.isVisible().catch(() => false)) {
      await hideSidebar.click();
    }

    await runPaletteCommand(page, 'New DuckDB Console');
    const input = page.locator('.duck-console .duck-input .cm-content');
    await expect(input).toBeVisible();

    // Tall output creates vertical scrollback in `.duck-log`.
    await input.click();
    await page.keyboard.insertText('SELECT range AS idx, range * 10 AS val FROM range(40);');
    await page.keyboard.press('Enter');
    await expect(page.locator('.duck-log .duck-table').first()).toContainText('390', {
      timeout: 60_000,
    });

    // Wide output tests horizontal scroll inside `.duck-table-wrap` without moving page.
    const cols = Array.from({ length: 16 }, (_, i) => `${i + 1} AS col_${i + 1}`).join(', ');
    await input.click();
    await page.keyboard.insertText(`SELECT ${cols};`);
    await page.keyboard.press('Enter');
    await expect(page.locator('.duck-log .duck-table').nth(1)).toContainText('col_16', {
      timeout: 60_000,
    });

    await expectNoHorizontalOverflow(page);

    const metrics = await page.evaluate(() => {
      const log = document.querySelector('.duck-log');
      const wrap = document.querySelectorAll('.duck-table .gm-table-scroll')[1];
      const inputEl = document.querySelector('.duck-input');
      if (!log || !wrap || !inputEl) return null;
      log.scrollTop = log.scrollHeight;
      const inputRect = inputEl.getBoundingClientRect();
      return {
        logScrollable: log.scrollHeight > log.clientHeight,
        wrapScrollable: wrap.scrollWidth > wrap.clientWidth,
        inputBottom: inputRect.bottom,
        viewportHeight: window.innerHeight,
      };
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.logScrollable).toBe(true);
    expect(metrics?.wrapScrollable).toBe(true);
    expect(metrics?.inputBottom ?? Infinity).toBeLessThanOrEqual(844);
    await expectNoHorizontalOverflow(page);
  } finally {
    await ctx.close();
  }
});
