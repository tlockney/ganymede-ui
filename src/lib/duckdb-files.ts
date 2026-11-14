/**
 * DuckDB's wasm and worker for jupyter.sql in the browser kernel, kept in
 * the page's Cache Storage so SQL runs offline (ganymede#747). They are
 * 36 MB, too big to ship in the app, so the page fetches them from
 * jsDelivr in the background the first time it is online, and kernels
 * started after that load them from the cache. Until then, and where
 * there is no Cache Storage, the kernel loads them from jsDelivr itself.
 *
 * The kernel's Worker can't read this page's cache, so the files reach
 * it as blob URLs (same origin), through the `modules` option.
 */
import { SQL_MODULES } from '@tlockney/cdp-kernel/browser';

/** The version cdp-kernel imports, from its specifier. */
const VERSION = SQL_MODULES.duckdb.slice(SQL_MODULES.duckdb.lastIndexOf('@') + 1);
const CDN = `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${VERSION}/dist/`;
/** Named by version, so a new DuckDB never reads an old file. */
const PREFIX = 'duckdb-wasm-';
export const CACHE = `${PREFIX}${VERSION}`;

/**
 * The `eh` pair: every browser the apps run in has wasm exceptions, so
 * the `mvp` pair stays on jsDelivr.
 */
export const FILES = [
  {
    specifier: SQL_MODULES.ehWorker,
    url: `${CDN}duckdb-browser-eh.worker.js`,
    type: 'text/javascript',
  },
  { specifier: SQL_MODULES.ehWasm, url: `${CDN}duckdb-eh.wasm`, type: 'application/wasm' },
] as const;

let mapped: { [specifier: string]: string } = {};
let loading: Promise<void> | null = null;

/** The blob URLs for the cached files, once `loadDuckdbFiles` found both. */
export function duckdbModules(): { [specifier: string]: string } {
  return mapped;
}

/**
 * Reads the files from the cache into blob URLs for `duckdbModules`, or,
 * when they aren't all there, fetches them first. Kernels that start
 * before it settles go on without them. Never rejects: without the
 * files, SQL loads them from jsDelivr.
 */
export function loadDuckdbFiles(): Promise<void> {
  loading ??= load().catch(err => {
    console.warn('DuckDB files: not cached', err);
  });
  return loading;
}

async function load(): Promise<void> {
  if (typeof caches === 'undefined') return;
  // An earlier DuckDB's files: 37 MB nothing reads any more.
  for (const name of await caches.keys()) {
    if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
  }
  const cache = await caches.open(CACHE);
  if (!(await read(cache)) && (await prefetch(cache))) await read(cache);
}

/** Maps the files if the cache has them all. */
async function read(cache: Cache): Promise<boolean> {
  const found = await Promise.all(FILES.map(f => cache.match(f.url)));
  if (!found.every(r => r?.ok)) return false;
  const blobs = await Promise.all(found.map(r => r!.blob()));
  mapped = Object.fromEntries(
    FILES.map((f, i) => [f.specifier, URL.createObjectURL(new Blob([blobs[i]], { type: f.type }))]),
  );
  return true;
}

/**
 * Fetches the files the cache lacks, worker first. True when it got them
 * all; a failure leaves the rest for the next page.
 */
async function prefetch(cache: Cache): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  for (const f of FILES) {
    if ((await cache.match(f.url))?.ok) continue;
    try {
      const res = await fetch(f.url, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await cache.put(f.url, res);
    } catch (err) {
      console.warn(`DuckDB files: fetching ${f.url} failed`, err);
      return false;
    }
  }
  return true;
}

/** For tests: forget what was loaded. */
export function resetDuckdbFiles(): void {
  for (const url of Object.values(mapped)) URL.revokeObjectURL(url);
  mapped = {};
  loading = null;
}
