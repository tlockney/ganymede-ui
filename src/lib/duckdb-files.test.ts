import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQL_MODULES } from '@tlockney/cdp-kernel/browser';
import {
  CACHE,
  type DuckdbFilesState,
  duckdbFilesState,
  duckdbModules,
  FILES,
  loadDuckdbFiles,
  noteKernelRequest,
  onDuckdbFilesState,
  readCachedDuckdbFiles,
  resetDuckdbFiles,
  usesSql,
} from './duckdb-files';

/** A Cache Storage with one cache, as Map. */
function fakeCaches() {
  const store = new Map<string, Response>();
  let reads = 0;
  const cache = {
    match: async (url: string) => (reads++, store.get(url)?.clone()),
    // As Cache Storage does: reads the body to its end, or rejects.
    put: async (url: string, res: Response) =>
      void store.set(url, new Response(await res.arrayBuffer())),
  };
  const opened: string[] = [];
  const names = new Set(['duckdb-wasm-1.0.0', 'workbox-precache']);
  vi.stubGlobal('caches', {
    open: async (name: string) => (opened.push(name), names.add(name), cache),
    keys: async () => [...names],
    has: async (name: string) => names.has(name),
    delete: async (name: string) => names.delete(name),
  });
  return { store, cache, opened, names, reads: () => reads };
}

describe('DuckDB files', () => {
  beforeEach(() => {
    resetDuckdbFiles();
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fetches the eh pair once, then maps it from the cache', async () => {
    const { store, opened, names } = fakeCaches();
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => (fetched.push(url), new Response(url)));
    await loadDuckdbFiles();
    expect(opened).toEqual([CACHE]);
    expect(CACHE).toBe(`duckdb-wasm-${SQL_MODULES.duckdb.split('@').pop()}`);
    // An earlier DuckDB's cache goes; others stay.
    expect([...names].sort()).toEqual([CACHE, 'workbox-precache'].sort());
    expect(fetched).toEqual(FILES.map(f => f.url));
    expect([...store.keys()]).toEqual(FILES.map(f => f.url));
    expect(Object.keys(duckdbModules()).sort()).toEqual(
      [SQL_MODULES.ehWasm, SQL_MODULES.ehWorker].sort(),
    );

    // The next page reads the cache and fetches nothing.
    resetDuckdbFiles();
    fetched.length = 0;
    await loadDuckdbFiles();
    expect(fetched).toEqual([]);
    expect(Object.keys(duckdbModules())).toHaveLength(2);
    expect(duckdbFilesState()).toEqual({ state: 'ready' });
  });

  it('does nothing more once the files are mapped', async () => {
    const { opened, reads } = fakeCaches();
    vi.stubGlobal('fetch', async (url: string) => new Response(url));
    await loadDuckdbFiles();
    const before = { opened: opened.length, reads: reads() };
    const blobs = vi.spyOn(URL, 'createObjectURL');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const seen: DuckdbFilesState[] = [];
    onDuckdbFilesState(s => seen.push(s));
    await loadDuckdbFiles();
    await readCachedDuckdbFiles();
    expect({ opened: opened.length, reads: reads() }).toEqual(before);
    expect(blobs).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
  });

  it('maps files already cached with the browser offline', async () => {
    const { store } = fakeCaches();
    for (const f of FILES) store.set(f.url, new Response(f.url));
    vi.stubGlobal('navigator', { onLine: false });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await loadDuckdbFiles();
    expect(fetch).not.toHaveBeenCalled();
    expect(duckdbFilesState()).toEqual({ state: 'ready' });
    expect(Object.keys(duckdbModules())).toHaveLength(2);
  });

  it('fetches only the file a failed try left out', async () => {
    const { store } = fakeCaches();
    store.set(FILES[0].url, new Response('worker'));
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => (fetched.push(url), new Response(url)));
    await loadDuckdbFiles();
    expect(fetched).toEqual([FILES[1].url]);
    expect(duckdbFilesState()).toEqual({ state: 'ready' });
  });

  it('says when a download stops partway, and keeps the file that came', async () => {
    const { store } = fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (url: string) => {
      if (url !== FILES[0].url) return new Response(url);
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(new Uint8Array(4));
          c.error(new TypeError('network error'));
        },
      });
      return new Response(body);
    });
    await loadDuckdbFiles();
    expect(duckdbFilesState()).toEqual({
      state: 'failed',
      message: 'The download from cdn.jsdelivr.net stopped.',
    });
    // The worker came first and failed; the wasm after it is kept.
    expect([...store.keys()]).toEqual([FILES[1].url]);
    expect(duckdbModules()).toEqual({});
  });

  it('maps nothing while a fetch fails, and keeps what it got', async () => {
    const { store } = fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('.wasm') ? new Response('', { status: 503 }) : new Response(url),
    );
    await loadDuckdbFiles();
    expect(duckdbModules()).toEqual({});
    // The worker, fetched first, stays for the next page.
    expect([...store.keys()]).toEqual([FILES[0].url]);
    expect(FILES[0].url).toMatch(/worker\.js$/);
  });

  it('does nothing without Cache Storage', async () => {
    vi.stubGlobal('caches', undefined);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await loadDuckdbFiles();
    await readCachedDuckdbFiles();
    expect(fetch).not.toHaveBeenCalled();
    expect(duckdbModules()).toEqual({});
    expect(duckdbFilesState()).toEqual({ state: 'unsupported' });
  });

  // #794: a load that didn't get the files isn't kept.
  it('tries again on the next use after a failed fetch', async () => {
    fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let up = false;
    const fetched: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      fetched.push(url);
      if (!up) throw new TypeError('Failed to fetch');
      return new Response(url);
    });
    await loadDuckdbFiles();
    expect(duckdbModules()).toEqual({});
    expect(duckdbFilesState()).toEqual({
      state: 'failed',
      message: 'Couldn’t reach cdn.jsdelivr.net.',
    });

    up = true;
    fetched.length = 0;
    await loadDuckdbFiles();
    expect(fetched).toEqual(FILES.map(f => f.url));
    expect(Object.keys(duckdbModules())).toHaveLength(2);
    expect(duckdbFilesState()).toEqual({ state: 'ready' });
  });

  it('fetches nothing while the browser is offline, and fetches once it is back', async () => {
    fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let onLine = false;
    vi.stubGlobal('navigator', {
      get onLine() {
        return onLine;
      },
    });
    const fetch = vi.fn(async (url: string) => new Response(url));
    vi.stubGlobal('fetch', fetch);
    await loadDuckdbFiles();
    expect(fetch).not.toHaveBeenCalled();
    expect(duckdbFilesState()).toEqual({ state: 'failed', message: 'This browser is offline.' });

    onLine = true;
    await loadDuckdbFiles();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(duckdbFilesState()).toEqual({ state: 'ready' });
  });

  it('shares one load between calls made while it runs', async () => {
    fakeCaches();
    const fetch = vi.fn(async (url: string) => new Response(url));
    vi.stubGlobal('fetch', fetch);
    await Promise.all([loadDuckdbFiles(), loadDuckdbFiles(), loadDuckdbFiles()]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports the bytes as they come, against the total the answers give', async () => {
    fakeCaches();
    const sizes = [3, 5];
    vi.stubGlobal('fetch', async (url: string) => {
      const n = sizes[FILES.findIndex(f => f.url === url)]!;
      return new Response(new Uint8Array(n), { headers: { 'content-length': String(n) } });
    });
    const seen: DuckdbFilesState[] = [];
    onDuckdbFilesState(s => seen.push(s));
    await loadDuckdbFiles();
    expect(seen[0]).toEqual({ state: 'loading', received: 0, total: null });
    const loading = seen.filter(s => s.state === 'loading').slice(1);
    expect(loading.at(-1)).toEqual({ state: 'loading', received: 8, total: 8 });
    expect(loading.every(s => s.state === 'loading' && s.total === 8)).toBe(true);
    expect(seen.at(-1)).toEqual({ state: 'ready' });
  });

  it('leaves the total unknown for an answer with no length', async () => {
    fakeCaches();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new Uint8Array(3));
              c.close();
            },
          }),
        ),
    );
    const seen: DuckdbFilesState[] = [];
    onDuckdbFilesState(s => seen.push(s));
    await loadDuckdbFiles();
    const loading = seen.filter(s => s.state === 'loading');
    expect(loading.at(-1)).toMatchObject({ received: 6 });
    expect(loading.every(s => s.total === null)).toBe(true);
  });

  it('leaves the total unknown for a compressed answer', async () => {
    fakeCaches();
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('xy', { headers: { 'content-length': '1', 'content-encoding': 'br' } }),
    );
    const seen: DuckdbFilesState[] = [];
    onDuckdbFilesState(s => seen.push(s));
    await loadDuckdbFiles();
    expect(seen.filter(s => s.state === 'loading').every(s => s.total === null)).toBe(true);
  });

  it('reads what an earlier visit cached at start, and fetches nothing', async () => {
    const { store, names } = fakeCaches();
    names.delete('duckdb-wasm-1.0.0');
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await readCachedDuckdbFiles();
    expect(fetch).not.toHaveBeenCalled();
    expect(duckdbModules()).toEqual({});
    expect(duckdbFilesState()).toEqual({ state: 'idle' });
    // Not even an empty cache is made.
    expect(names.has(CACHE)).toBe(false);

    names.add(CACHE);
    for (const f of FILES) store.set(f.url, new Response(f.url));
    await readCachedDuckdbFiles();
    expect(fetch).not.toHaveBeenCalled();
    expect(Object.keys(duckdbModules())).toHaveLength(2);
    expect(duckdbFilesState()).toEqual({ state: 'ready' });
  });

  it('keeps a failure through a start-up read that finds nothing', async () => {
    const { names } = fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async () => new Response('', { status: 503 }));
    await loadDuckdbFiles();
    expect(duckdbFilesState()).toEqual({
      state: 'failed',
      message: 'cdn.jsdelivr.net answered 503.',
    });
    names.delete(CACHE);
    await readCachedDuckdbFiles();
    expect(duckdbFilesState()).toEqual({
      state: 'failed',
      message: 'cdn.jsdelivr.net answered 503.',
    });
  });

  it('says when the browser has no room to keep the files', async () => {
    const { cache } = fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    cache.put = async () => {
      throw new DOMException('q', 'QuotaExceededError');
    };
    vi.stubGlobal('fetch', async (url: string) => new Response(url));
    await loadDuckdbFiles();
    expect(duckdbFilesState()).toEqual({
      state: 'failed',
      message: 'This browser has no room to keep DuckDB.',
    });
  });

  it('fails, not ready, when the cache doesn’t keep what it was given', async () => {
    const { cache } = fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    cache.put = async (_url: string, res: Response) => void (await res.arrayBuffer());
    vi.stubGlobal('fetch', async (url: string) => new Response(url));
    await loadDuckdbFiles();
    expect(duckdbFilesState()).toEqual({
      state: 'failed',
      message: 'DuckDB’s files aren’t in the cache.',
    });
    expect(duckdbModules()).toEqual({});
  });

  it('reports the first file’s failure when both fail', async () => {
    fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', async (url: string) => {
      if (url === FILES[0].url) throw new TypeError('Failed to fetch');
      return new Response('', { status: 503 });
    });
    await loadDuckdbFiles();
    expect(duckdbFilesState()).toEqual({
      state: 'failed',
      message: 'Couldn’t reach cdn.jsdelivr.net.',
    });
  });

  it('fetches for a use that comes while the start-up read runs', async () => {
    fakeCaches();
    const fetch = vi.fn(async (url: string) => new Response(url));
    vi.stubGlobal('fetch', fetch);
    const read = readCachedDuckdbFiles();
    const use = loadDuckdbFiles();
    await Promise.all([read, use]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(duckdbFilesState()).toEqual({ state: 'ready' });
  });
});

describe('SQL in a cell', () => {
  it.each([
    ['await jupyter.sql`select 1`', true],
    ['const { sql } = jupyter;', true],
    ['sql.query("select 1", [])', true],
    ['jupyter["sql"]', true],
    ['1 + 1', false],
    ['const mysql = 1; sqlite', false],
    ['jupyter.chart({})', false],
  ])('%s: %s', (code, expected) => {
    expect(usesSql(code)).toBe(expected);
  });

  it('loads the files for an execute_request that may use SQL, and only that', async () => {
    resetDuckdbFiles();
    fakeCaches();
    const fetch = vi.fn(async (url: string) => new Response(url));
    vi.stubGlobal('fetch', fetch);
    noteKernelRequest({ header: { msg_type: 'execute_request' }, content: { code: '1 + 1' } });
    noteKernelRequest({ header: { msg_type: 'complete_request' }, content: { code: 'sql' } });
    noteKernelRequest({ header: { msg_type: 'execute_request' }, content: { code: 3 } });
    await vi.waitFor(() => expect(duckdbFilesState()).toEqual({ state: 'idle' }));
    expect(fetch).not.toHaveBeenCalled();

    noteKernelRequest({
      header: { msg_type: 'execute_request' },
      content: { code: 'await jupyter.sql`select 42`' },
    });
    await vi.waitFor(() => expect(duckdbFilesState()).toEqual({ state: 'ready' }));
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
