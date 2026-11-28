import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { GANYMEDE_URL, TOKEN } from './env';
import { openWithToken, useThisBrowser, waitForReady } from './helpers';

const DUCKDB_DIST = join(process.cwd(), 'node_modules/@duckdb/duckdb-wasm/dist');
const JSDELIVR_DUCKDB =
  /^https:\/\/cdn\.jsdelivr\.net\/npm\/@duckdb\/duckdb-wasm@[^/]+\/dist\/(.+)$/;

const DUCKDB_ASSETS = new Map<string, { file: string; contentType: string }>([
  [
    'duckdb-browser-eh.worker.js',
    { file: 'duckdb-browser-eh.worker.js', contentType: 'text/javascript; charset=utf-8' },
  ],
  ['duckdb-eh.wasm', { file: 'duckdb-eh.wasm', contentType: 'application/wasm' }],
]);

/** Encodes a server-relative path for `/api/contents/...` without escaping slashes. */
export function contentsUrl(path: string): string {
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  return `${GANYMEDE_URL}/api/contents/${encoded}?token=${TOKEN}`;
}

/** Writes a UTF-8 text file directly into the test Ganymede workspace. */
export async function writeServerFile(
  request: APIRequestContext,
  path: string,
  content: string,
): Promise<void> {
  const res = await request.put(contentsUrl(path), {
    data: { type: 'file', format: 'text', content },
  });
  expect(res.ok(), `PUT ${path} failed with ${res.status()}`).toBe(true);
}

/** Writes binary bytes (base64) into the test Ganymede workspace. */
export async function writeServerBytes(
  request: APIRequestContext,
  path: string,
  bytes: Buffer,
): Promise<void> {
  const res = await request.put(contentsUrl(path), {
    data: { type: 'file', format: 'base64', content: bytes.toString('base64') },
  });
  expect(res.ok(), `PUT ${path} failed with ${res.status()}`).toBe(true);
}

/** Reads a file's parsed `content` field from the Ganymede contents API. */
export async function readServerContents(
  request: APIRequestContext,
  path: string,
): Promise<unknown> {
  const res = await request.get(contentsUrl(path));
  expect(res.ok(), `GET ${path} failed with ${res.status()}`).toBe(true);
  const body: unknown = await res.json();
  if (typeof body !== 'object' || body === null || !('content' in body)) {
    throw new Error(`Unexpected contents payload for ${path}`);
  }
  return body.content;
}

/**
 * Invokes a Command Palette entry via `ControlOrMeta+Shift+P` so WebKit specs
 * stay independent of `.toolbar` ContextMenu positioning (#927).
 */
export async function runPaletteCommand(
  page: Page,
  query: string,
  optionName?: string | RegExp,
): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Shift+P');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  const box = dialog.getByRole('combobox', { name: 'Command' });
  await box.fill(query);
  const option = optionName
    ? dialog.getByRole('option', { name: optionName }).first()
    : dialog.getByRole('option').first();
  await expect(option).toBeVisible();
  await option.click();
}

/** Opens the workspace connected to Ganymede and creates a new `cdp-node` notebook. */
export async function openNewServerNotebook(page: Page): Promise<void> {
  await openWithToken(page);
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await waitForReady(page);
}

/** Opens the workspace, switches to the in-app browser kernel, and creates a notebook. */
export async function openNewBrowserNotebook(page: Page): Promise<void> {
  await page.goto('/');
  await useThisBrowser(page);
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell')).toHaveCount(1);
  await waitForReady(page);
}

/**
 * Fulfils jsDelivr `@duckdb/duckdb-wasm` worker/wasm requests from local
 * `node_modules` so Cache Storage caching can be verified online and offline.
 */
export async function fulfillDuckdbCdn(
  page: Page,
  onAssetFetch?: (assetName: string) => void,
): Promise<void> {
  await page.route(JSDELIVR_DUCKDB, async route => {
    const match = route.request().url().match(JSDELIVR_DUCKDB);
    const name = match?.[1] ?? '';
    const entry = DUCKDB_ASSETS.get(name);
    if (!entry) {
      await route.abort();
      return;
    }
    onAssetFetch?.(name);
    await route.fulfill({
      status: 200,
      contentType: entry.contentType,
      body: readFileSync(join(DUCKDB_DIST, entry.file)),
    });
  });
}

/** Asserts that `document.documentElement` does not overflow the viewport width. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
}
