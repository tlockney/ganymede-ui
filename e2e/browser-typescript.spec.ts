// Typed help in the browser kernel (#668): TypeScript 6 and its lib files
// are served by the app and loaded by cdp-kernel's language service Worker
// on the first request, so type errors, typed completion and the other
// language features work in the in-browser backend, as in the apps' in-app
// kernel. Needs no server, only the production build.
import { expect, test } from '@playwright/test';
import { outputs, useThisBrowser, waitForReady } from './helpers';

test('type errors and typed completion from TypeScript the app serves', async ({ page }) => {
  const fetched: string[] = [];
  // The context sees the service worker's requests too, not just the page's.
  page.context().on('request', r => {
    if (r.url().includes('/kernel-typescript/')) fetched.push(r.url());
  });
  await page.goto('/');
  await useThisBrowser(page);
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);
  // Nothing of TypeScript is fetched with the page or the notebook, nor
  // precached by the service worker once it is installed.
  const precached = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const req of await (await caches.open(name)).keys()) urls.push(req.url);
    }
    const sw = await (await fetch('/sw.js')).text();
    return { urls, inManifest: sw.includes('kernel-typescript/typescript-') };
  });
  expect(precached.urls.length).toBeGreaterThan(0);
  expect(precached.urls.filter(u => u.includes('/kernel-typescript/'))).toEqual([]);
  expect(precached.inManifest).toBe(false);
  expect(fetched).toEqual([]);

  const first = page.locator('.jp-Cell .cm-content').first();
  await first.click();
  await page.keyboard.type(
    'const n: number = 1;\nconst u = { name: "Io" } as { name: string; radius?: number };',
  );
  await page.keyboard.press('Shift+Enter');
  await expect(outputs(page)).toHaveCount(0);

  const second = page.locator('.jp-Cell .cm-content').nth(1);
  await second.click();
  await page.keyboard.type('const s: string = n;');
  // The language service loads (about a second), then the error shows.
  const error = page.locator('.jp-Cell').nth(1).locator('.cm-lintRange-error');
  await expect(error).toBeVisible({ timeout: 60_000 });
  await error.hover();
  await expect(page.getByText(/Type 'number' is not assignable to type 'string'/)).toBeVisible();
  expect(fetched.some(u => u.endsWith('/typescript.js'))).toBe(true);
  expect(fetched.some(u => u.endsWith('/lib.es5.d.ts'))).toBe(true);
  // `jupyter` is typed from the kernel's runtime types.
  expect(fetched.some(u => u.endsWith('/runtime/display.d.mts'))).toBe(true);
  // lib.dom isn't served or asked for.
  expect(fetched.some(u => u.includes('lib.dom'))).toBe(false);

  // Typed completion: `radius` is declared, not a runtime value.
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('u.');
  await page.keyboard.press('Tab');
  await expect(page.locator('.jp-Completer').getByText('radius')).toBeVisible({ timeout: 30_000 });
});
