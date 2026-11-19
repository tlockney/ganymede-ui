import { describe, expect, it, vi } from 'vitest';
import { ContentsManager, ServerConnection } from '@jupyterlab/services';
import { BrowserStorageDrive } from '@jupyterlite/services';
import localforage from 'localforage';
import { TooLarge, decodeText, readBytes, readStream } from './data-read';

const stream = (parts: string[], headers: Record<string, string> = {}) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(new TextEncoder().encode(p));
        c.close();
      },
    }),
    { headers },
  );

describe('readStream', () => {
  it('reads a small body whole', async () => {
    const r = await readStream(stream(['ab', 'cd']), 100, false);
    expect(new TextDecoder().decode(r.bytes)).toBe('abcd');
    expect(r.truncated).toBe(false);
  });

  it('stops at the cap and says the file was cut', async () => {
    const r = await readStream(stream(['abcd', 'efgh', 'ijkl']), 6, false);
    expect(new TextDecoder().decode(r.bytes)).toBe('abcdef');
    expect(r.truncated).toBe(true);
  });

  it('is not cut when the body is exactly the cap', async () => {
    const r = await readStream(stream(['abc', 'def']), 6, false);
    expect(r.truncated).toBe(false);
    expect(r.bytes).toHaveLength(6);
  });

  it('refuses a file past the cap when it can’t be cut', async () => {
    await expect(readStream(stream(['abcd', 'efgh']), 6, true)).rejects.toBeInstanceOf(TooLarge);
    await expect(
      readStream(stream(['x'], { 'content-length': '999999999' }), 6, true),
    ).rejects.toThrow(/over the .* the data view opens/);
  });
});

describe('decodeText', () => {
  it('drops a UTF-8 BOM', () => {
    expect(decodeText(new TextEncoder().encode('\uFEFFa,é'))).toBe('a,é');
  });
  it('reads UTF-16 by its byte order mark', () => {
    const le = Uint8Array.from([0xff, 0xfe, ...[...'a,é'].flatMap(c => [c.charCodeAt(0), 0])]);
    const be = Uint8Array.from([0xfe, 0xff, ...[...'a,é'].flatMap(c => [0, c.charCodeAt(0)])]);
    expect(decodeText(le)).toBe('a,é');
    expect(decodeText(be)).toBe('a,é');
  });
});

/**
 * JupyterLite's real browser drive, over an in-memory localforage driver
 * (jsdom has no IndexedDB), so the browser backend reads what it stores.
 */
async function browserBackend() {
  const stores = new Map<string, Map<string, unknown>>();
  const driver = {
    _driver: 'memory',
    _support: true,
    _initStorage(options: { storeName: string }) {
      const store = stores.get(options.storeName) ?? new Map<string, unknown>();
      stores.set(options.storeName, store);
      (this as unknown as { _store: Map<string, unknown> })._store = store;
    },
    clear: async () => {},
    getItem: async function (this: { _store: Map<string, unknown> }, key: string) {
      return this._store.get(key) ?? null;
    },
    setItem: async function (this: { _store: Map<string, unknown> }, key: string, v: unknown) {
      this._store.set(key, v);
      return v;
    },
    removeItem: async function (this: { _store: Map<string, unknown> }, key: string) {
      this._store.delete(key);
    },
    length: async function (this: { _store: Map<string, unknown> }) {
      return this._store.size;
    },
    key: async () => null,
    keys: async function (this: { _store: Map<string, unknown> }) {
      return [...this._store.keys()];
    },
    iterate: async function (
      this: { _store: Map<string, unknown> },
      fn: (v: unknown, k: string, n: number) => unknown,
    ) {
      let n = 1;
      for (const [k, v] of this._store) {
        const r = fn(v, k, n++);
        if (r !== undefined) return r;
      }
    },
  };
  const lf = localforage.createInstance({ name: 'test' });
  await localforage.defineDriver(driver as never);
  void lf;
  const drive = new BrowserStorageDrive({
    localforage,
    storageName: 'data-read-test',
    storageDrivers: ['memory'],
  });
  await drive.initialize();
  const contents = new ContentsManager({ defaultDrive: drive });
  return { contents, backend: { config: { kind: 'browser' }, services: { contents } } as never };
}

describe('readBytes in the browser backend', () => {
  it('reads text as stored: accents and characters past U+00FF stay whole', async () => {
    const { contents, backend } = await browserBackend();
    const text = 'name\nGanymède\n日本語 ☃\n';
    await contents.save('a.csv', { type: 'file', format: 'text', content: text });
    const { bytes, truncated } = await readBytes(backend, 'a.csv', 1000);
    expect(decodeText(bytes)).toBe(text);
    expect(truncated).toBe(false);
  });

  it('reads base64 files, and JSON files, as stored', async () => {
    const { contents, backend } = await browserBackend();
    await contents.save('a.parquet', {
      type: 'file',
      format: 'base64',
      content: btoa('PAR1\u0000\u00ff'),
    });
    expect([...(await readBytes(backend, 'a.parquet', 100, true)).bytes]).toEqual([
      0x50, 0x41, 0x52, 0x31, 0, 0xff,
    ]);
    await contents.save('a.json', { type: 'file', format: 'json', content: { moons: ['Io'] } });
    expect(decodeText((await readBytes(backend, 'a.json', 100, true)).bytes)).toBe(
      '{"moons":["Io"]}',
    );
  });

  it('cuts a file past the cap, and refuses to cut a whole-file format', async () => {
    const { contents, backend } = await browserBackend();
    await contents.save('big.csv', { type: 'file', format: 'text', content: 'abcdefghij' });
    const cut = await readBytes(backend, 'big.csv', 4);
    expect(cut.truncated).toBe(true);
    expect(cut.bytes).toHaveLength(4);
    await expect(readBytes(backend, 'big.csv', 4, true)).rejects.toBeInstanceOf(TooLarge);
  });
});

describe('readBytes sizes', () => {
  /** A Ganymede backend whose contents API says the file is `size` bytes. */
  function ganymede(size: number) {
    const get = vi.fn(async () => ({ size }));
    const makeRequest = vi
      .spyOn(ServerConnection, 'makeRequest')
      .mockResolvedValue(new Response('a,b\n1,2\n'));
    const backend = {
      config: { kind: 'ganymede', url: '', token: '' },
      services: { contents: { get }, serverSettings: { baseUrl: 'http://x/' } },
    } as never;
    return { get, makeRequest, backend };
  }

  it('asks the size first and fetches nothing from a file over the ceiling', async () => {
    const { get, makeRequest, backend } = ganymede(300 * 1024 * 1024);
    await expect(readBytes(backend, 'huge.csv', 1000)).rejects.toThrow(/300 MB, over the 256 MB/);
    expect(get).toHaveBeenCalledWith('huge.csv', { content: false });
    expect(makeRequest).not.toHaveBeenCalled();
  });

  it('refuses a whole-file format over its own cap before fetching', async () => {
    const { makeRequest, backend } = ganymede(20 * 1024 * 1024);
    await expect(readBytes(backend, 'a.json', 16 * 1024 * 1024, true)).rejects.toBeInstanceOf(
      TooLarge,
    );
    expect(makeRequest).not.toHaveBeenCalled();
  });

  it('streams a file under the ceiling', async () => {
    const { makeRequest, backend } = ganymede(10);
    const r = await readBytes(backend, 'ok.csv', 1000);
    expect(decodeText(r.bytes)).toBe('a,b\n1,2\n');
    expect(makeRequest).toHaveBeenCalledOnce();
  });
});
