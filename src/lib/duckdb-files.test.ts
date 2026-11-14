import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SQL_MODULES } from '@tlockney/cdp-kernel/browser';
import { CACHE, duckdbModules, FILES, loadDuckdbFiles, resetDuckdbFiles } from './duckdb-files';

/** A Cache Storage with one cache, as Map. */
function fakeCaches() {
  const store = new Map<string, Response>();
  const cache = {
    match: async (url: string) => store.get(url)?.clone(),
    put: async (url: string, res: Response) => void store.set(url, res),
  };
  const opened: string[] = [];
  const names = new Set(['duckdb-wasm-1.0.0', 'workbox-precache']);
  vi.stubGlobal('caches', {
    open: async (name: string) => (opened.push(name), names.add(name), cache),
    keys: async () => [...names],
    delete: async (name: string) => names.delete(name),
  });
  return { store, opened, names };
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
    expect(fetch).not.toHaveBeenCalled();
    expect(duckdbModules()).toEqual({});
  });
});
