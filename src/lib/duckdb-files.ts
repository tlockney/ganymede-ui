/**
 * DuckDB's wasm and worker for jupyter.sql in the browser kernel, kept in
 * the page's Cache Storage so SQL runs offline (ganymede#747). They are
 * 36 MB, too big to ship in the app, so the page fetches them from
 * jsDelivr when DuckDB is first used (#794): a cell that names `sql`, the
 * DuckDB console, a Parquet file, or Download in Settings. Kernels
 * started after that load them from the cache. Until then, and where
 * there is no Cache Storage, the kernel loads them from jsDelivr itself.
 * A load that didn't get them is tried again on the next use.
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

/** Where the files stand, for Settings' Download (#794). */
export type DuckdbFilesState =
  /** Not looked for yet. */
  | { state: 'idle' }
  /** Reading the cache, or fetching: `received` bytes of `total`, when known. */
  | { state: 'loading'; received: number; total: number | null }
  /** Cached and mapped: kernels started from now on run SQL offline. */
  | { state: 'ready' }
  /**
   * The last load didn't get them; the next use tries again, except after
   * `noRoom` (the browser wouldn't keep them), which only the person's
   * Download or Try Again retries, as each try fetches 36 MB to fail.
   */
  | { state: 'failed'; message: string; noRoom?: true }
  /** No Cache Storage (an insecure origin): kernels use jsDelivr. */
  | { state: 'unsupported' };

let mapped: { [specifier: string]: string } = {};
let status: DuckdbFilesState = { state: 'idle' };
const listeners = new Set<(s: DuckdbFilesState) => void>();

function setStatus(next: DuckdbFilesState): void {
  status = next;
  for (const l of listeners) l(next);
}

/** Where the files stand now. */
export function duckdbFilesState(): DuckdbFilesState {
  return status;
}

/** Calls `listener` with each change of state; returns the unsubscribe. */
export function onDuckdbFilesState(listener: (s: DuckdbFilesState) => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The blob URLs for the cached files, once `loadDuckdbFiles` found both. */
export function duckdbModules(): { [specifier: string]: string } {
  return mapped;
}

/**
 * Reads the files from the cache into blob URLs for `duckdbModules`, or,
 * when they aren't all there, fetches them first. Kernels that start
 * before it settles go on without them. Calls while one runs share it;
 * once the files are mapped it does nothing more, and after a load that
 * didn't get them the next call tries again (#794), unless the browser
 * had no room for them: then only a call with `asked` (Download or Try
 * Again in Settings) does. Never rejects: without the files, SQL and the
 * data views load them from jsDelivr.
 */
export function loadDuckdbFiles({ asked = false }: { asked?: boolean } = {}): Promise<void> {
  return run(true, asked);
}

/**
 * Maps the files if an earlier visit cached them, and fetches nothing:
 * for page start, so the first kernel usually finds them mapped.
 */
export function readCachedDuckdbFiles(): Promise<void> {
  return run(false);
}

let loading: { promise: Promise<void>; fetches: boolean } | null = null;

function run(fetches: boolean, asked = false): Promise<void> {
  // Mapped: nothing more to read or fetch.
  if (status.state === 'ready') return Promise.resolve();
  // No room: another try would fetch 36 MB to fail the same way.
  if (status.state === 'failed' && status.noRoom && !asked) return Promise.resolve();
  if (loading) {
    // A read of the cache alone doesn't do for a use: fetch after it.
    return loading.fetches || !fetches
      ? loading.promise
      : loading.promise.then(() => run(true, asked));
  }
  const before = status;
  const promise = load(fetches)
    .then(() => setStatus({ state: 'ready' }))
    .catch(err => {
      if (err instanceof Unsupported) return setStatus({ state: 'unsupported' });
      if (err instanceof NotCached) return setStatus(before);
      console.warn('DuckDB files: not cached', err);
      const message = err instanceof Error ? err.message : String(err);
      setStatus(
        err instanceof NoRoom
          ? { state: 'failed', message, noRoom: true }
          : { state: 'failed', message },
      );
    })
    .finally(() => {
      loading = null;
    });
  loading = { promise, fetches };
  return promise;
}

/**
 * Whether a cell's code may use `jupyter.sql`: it names `sql` as a word
 * (`jupyter.sql`, `const { sql } = jupyter`, `sql.query`). Generous, as
 * a false match only fetches DuckDB early.
 */
export function usesSql(code: unknown): boolean {
  return typeof code === 'string' && /\bsql\b/.test(code);
}

/**
 * For a message on its way to a browser kernel: an execute_request whose
 * code may use SQL starts loading DuckDB's files, so the next kernel has
 * them (this one was started with the map it had then).
 */
export function noteKernelRequest(msg: {
  header?: { msg_type?: string };
  content?: { code?: unknown };
}): void {
  if (msg.header?.msg_type === 'execute_request' && usesSql(msg.content?.code)) {
    void loadDuckdbFiles();
  }
}

class Unsupported extends Error {}
class NotCached extends Error {}
class NoRoom extends Error {}

/**
 * Maps the files, fetching what the cache lacks when `fetches`; throws
 * when it can't.
 */
async function load(fetches: boolean): Promise<void> {
  if (typeof caches === 'undefined') throw new Unsupported('no Cache Storage');
  if (!fetches) {
    if (!(await caches.has(CACHE)) || !(await read(await caches.open(CACHE)))) {
      throw new NotCached();
    }
    return;
  }
  setStatus({ state: 'loading', received: 0, total: null });
  // An earlier DuckDB's files: 37 MB nothing reads any more.
  for (const name of await caches.keys()) {
    if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
  }
  const cache = await caches.open(CACHE);
  // Cached but not yet mapped: no network needed, even offline.
  if (await read(cache)) return;
  await prefetch(cache);
  if (!(await read(cache))) throw new Error('DuckDB’s files aren’t in the cache.');
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
 * Fetches the files the cache lacks, reporting the bytes as they come,
 * and caches each one it gets, worker first. A failure throws after
 * caching what did come, for the next try.
 */
async function prefetch(cache: Cache): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('This browser is offline.');
  }
  const missing: (typeof FILES)[number][] = [];
  for (const f of FILES) if (!(await cache.match(f.url))?.ok) missing.push(f);
  const answers = await Promise.allSettled(
    missing.map(f => fetch(f.url, { mode: 'cors', credentials: 'omit' })),
  );
  // The total once every answer gives its length; a compressed body's
  // length isn't what reading it counts.
  let total: number | null = 0;
  for (const a of answers) {
    // No header reads as 0: unknown.
    const length = a.status === 'fulfilled' ? Number(a.value.headers.get('content-length')) : 0;
    const encoded = a.status === 'fulfilled' && a.value.headers.has('content-encoding');
    total = total !== null && length > 0 && !encoded ? total + length : null;
  }
  let received = 0;
  let failure: Error | undefined;
  for (const [i, f] of missing.entries()) {
    const a = answers[i]!;
    const host = new URL(f.url).host;
    if (a.status === 'rejected') {
      failure ??= new Error(`Couldn’t reach ${host}.`, { cause: a.reason });
      continue;
    }
    const res = a.value;
    if (!res.ok) {
      failure ??= new Error(`${host} answered ${res.status}.`);
      void res.body?.cancel();
      continue;
    }
    // Streamed into the cache, counting the bytes on the way, so the
    // 36 MB never sit in the page's memory.
    const counter = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, out) {
        received += chunk.byteLength;
        setStatus({ state: 'loading', received, total });
        out.enqueue(chunk);
      },
    });
    try {
      await cache.put(
        f.url,
        new Response(res.body?.pipeThrough(counter) ?? null, {
          headers: { 'content-type': f.type },
        }),
      );
    } catch (err) {
      failure ??=
        err instanceof DOMException && err.name === 'QuotaExceededError'
          ? new NoRoom('This browser has no room to keep DuckDB.', { cause: err })
          : new Error(`The download from ${host} stopped.`, { cause: err });
    }
  }
  if (failure) throw failure;
}

/** For tests: forget what was loaded. */
export function resetDuckdbFiles(): void {
  for (const url of Object.values(mapped)) URL.revokeObjectURL(url);
  mapped = {};
  loading = null;
  status = { state: 'idle' };
  listeners.clear();
}
