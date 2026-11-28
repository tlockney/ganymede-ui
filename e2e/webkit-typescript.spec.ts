// TypeScript language features (#676) and in-app kernel offline persistence (#668) on WebKit.
import { expect, test } from '@playwright/test';
import { outputs, removeFromServer, waitForIdle, waitForReady } from './helpers';
import { openNewBrowserNotebook, openNewServerNotebook, runPaletteCommand } from './webkit-helpers';

test.afterEach(async () => {
  await removeFromServer('Untitled.ipynb');
});

for (const mode of ['server', 'browser'] as const) {
  test(`signature help + Escape keeps edit mode, F12 goes to definition, and F2 renames across cells on ${mode} kernel (#676)`, async ({
    page,
  }) => {
    if (mode === 'server') {
      await openNewServerNotebook(page);
    } else {
      await openNewBrowserNotebook(page);
    }

    // Cell 0: function definition.
    const cell0 = page.locator('.jp-Cell .cm-content').first();
    await cell0.click();
    await page.keyboard.insertText(
      'function orbit(name: string, days: number): string { return `${name}:${days}`; }',
    );
    await page.keyboard.press('Shift+Enter');
    await waitForIdle(page);

    // Cell 1: signature help via `orbit(` (retry once TS finishes cold-starting).
    const cell1 = page.locator('.jp-Cell .cm-content').nth(1);
    await cell1.click();
    const sigTooltip = page.locator('.cm-signature-help');
    await expect(async () => {
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('orbit(');
      await expect(sigTooltip).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(sigTooltip).toContainText('name: string');
    await expect(cell1.locator('..')).toBeVisible();

    // Escape closes signature help WITHOUT leaving edit mode.
    await page.keyboard.press('Escape');
    await expect(sigTooltip).toHaveCount(0);
    const stillFocused = await page.evaluate(
      () => document.activeElement?.closest('.cm-editor') !== null,
    );
    expect(stillFocused).toBe(true);

    // Finish call, commit cell 1, and move onto `orbit` identifier to test F12 + F2.
    await page.keyboard.insertText('"Io", 1.77);');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');

    // F12 jumps back to definition in cell 0.
    await page.keyboard.press('F12');
    await expect(page.locator('.jp-Cell').first()).toHaveClass(/jp-mod-active/);

    // F2 opens rename prompt and renames both declaration and call site.
    await page.keyboard.press('F2');
    const renameInput = page.locator('.rename-prompt input');
    await expect(renameInput).toBeVisible();
    await renameInput.fill('spin');
    await renameInput.press('Enter');

    await expect(cell0).toContainText('function spin(');
    await expect(cell1).toContainText('spin("Io", 1.77);');

    // Run all cells so the renamed definition in cell 0 executes before the new call in cell 2.
    await cell1.click();
    await runPaletteCommand(page, 'Insert Code Cell');
    const cell2 = page.locator('.jp-Cell .cm-content').nth(2);
    await cell2.click();
    await page.keyboard.insertText('spin("Europa", 3.55)');
    await runPaletteCommand(page, 'Run All Cells');
    await waitForIdle(page);
    await expect(outputs(page).filter({ hasText: 'Europa:3.55' })).toBeVisible();
  });
}

test('in-app browser kernel shows TS2322 diagnostics on hover and keeps TypeScript tools working offline after reload (#668)', async ({
  page,
  context,
}) => {
  await openNewBrowserNotebook(page);

  // Start the in-app worker by running a typed binding first, matching real notebook editing.
  const cell0 = page.locator('.jp-Cell .cm-content').first();
  await cell0.click();
  await page.keyboard.type('const n: number = 1;');
  await page.keyboard.press('Shift+Enter');
  await waitForIdle(page);

  const cell1 = page.locator('.jp-Cell .cm-content').nth(1);
  await cell1.click();
  await page.keyboard.type('const badMoon: string = n;');

  const lintMark = page.locator('.jp-Cell').nth(1).locator('.cm-lintRange-error').first();
  await expect(lintMark).toBeVisible({ timeout: 60_000 });
  await lintMark.hover();
  await expect(page.locator('.cm-tooltip-lint')).toContainText(
    "Type 'number' is not assignable to type 'string'",
  );

  // Wait for Workbox Service Worker controller + settled `kernel-typescript` Cache Storage assets.
  await expect
    .poll(() =>
      page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) return false;
        if (!(await caches.has('kernel-typescript'))) return false;
        const cache = await caches.open('kernel-typescript');
        const firstKeys = await cache.keys();
        const urls = firstKeys.map(req => new URL(req.url).pathname);
        const hasCore =
          urls.some(u => u.endsWith('/typescript.js')) &&
          urls.some(u => u.endsWith('/lib.es5.d.ts')) &&
          urls.some(u => u.endsWith('/lib.esnext.d.ts')) &&
          urls.some(u => u.endsWith('/runtime/display.d.mts'));
        if (!hasCore) return false;
        await new Promise(r => setTimeout(r, 250));
        return (await cache.keys()).length === firstKeys.length;
      }),
    )
    .toBe(true);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'New Notebook' }).first().click();
    await expect(page.locator('.jp-Cell')).toHaveCount(1);
    await waitForReady(page);

    const offlineCell0 = page.locator('.jp-Cell .cm-content').first();
    await offlineCell0.click();
    await page.keyboard.type('const offN: number = 99;');
    await page.keyboard.press('Shift+Enter');
    await waitForIdle(page);

    const offlineCell1 = page.locator('.jp-Cell .cm-content').nth(1);
    const offlineLint = page.locator('.jp-Cell').nth(1).locator('.cm-lintRange-error').first();
    await expect(async () => {
      await offlineCell1.click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('const offMoon: string = offN;');
      await expect(offlineLint).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 60_000 });
    await offlineLint.hover();
    await expect(page.locator('.cm-tooltip-lint')).toContainText(
      "Type 'number' is not assignable to type 'string'",
    );

    // Signature help also keeps working offline from the cached compiler.
    await expect(async () => {
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText('function track(id: number): number { return id; }\n');
      await page.keyboard.type('track(');
      await expect(page.locator('.cm-signature-help')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.locator('.cm-signature-help')).toContainText('id: number');
  } finally {
    await context.setOffline(false);
  }
});
