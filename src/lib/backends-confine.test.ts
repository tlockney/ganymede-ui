import { ContentsManager } from '@jupyterlab/services';
import { describe, expect, it, vi } from 'vitest';
import {
  confinedFetch,
  confinedWebSocket,
  isUnderMount,
  machinePrefix,
  settingsFor,
} from './backends';

const ORIGIN = 'http://localhost:8123';
const ID = 'm-1';
const P = machinePrefix(ID);

describe('isUnderMount', () => {
  const ok = (url: string, scheme: 'http' | 'ws' = 'http') => isUnderMount(url, ORIGIN, ID, scheme);

  it('accepts paths under the prefix', () => {
    expect(ok(`${ORIGIN}${P}api/contents/a/b.ipynb`)).toBe(true);
    expect(ok(`${P}api/status`)).toBe(true);
    expect(ok(`${ORIGIN}${P}api/contents/a/../b`)).toBe(true);
    expect(ok(`ws://localhost:8123${P}api/events/subscribe`, 'ws')).toBe(true);
    expect(isUnderMount(`wss://localhost:8123${P}api/x`, 'https://localhost:8123', ID, 'ws')).toBe(
      true,
    );
  });

  it('takes ws for an http page and wss for an https one', () => {
    expect(ok(`wss://localhost:8123${P}api/kernels/k/channels`, 'ws')).toBe(false);
    expect(isUnderMount(`ws://localhost:8123${P}api/x`, 'https://localhost:8123', ID, 'ws')).toBe(
      false,
    );
  });

  it('refuses climbing out of the prefix, however it is spelled', () => {
    expect(ok(`${ORIGIN}${P}api/contents/../../../api/contents/x`)).toBe(false);
    expect(ok(`${ORIGIN}${P}api/contents/%2e%2e/%2e%2e/%2e%2e/api/x`)).toBe(false);
    expect(ok(`${ORIGIN}${P}api/contents/%2E%2E/%2E%2E/%2E%2E/api/x`)).toBe(false);
    expect(ok(`${ORIGIN}${P}..`)).toBe(false);
    expect(ok(`${ORIGIN}${P}..%2f..%2fapi`)).toBe(true); // an encoded slash stays inside one segment
  });

  it('refuses another origin, machine, or a bare prefix', () => {
    expect(ok(`http://evil.example${P}api/status`)).toBe(false);
    expect(ok(`http://localhost:9999${P}api/status`)).toBe(false);
    expect(ok(`${ORIGIN}/machines/other/api/status`)).toBe(false);
    expect(ok(`${ORIGIN}/machines/${ID}`)).toBe(false);
    expect(ok(`${ORIGIN}/machines/${ID}x/api/status`)).toBe(false);
    expect(ok(`${ORIGIN}/api/contents/x`)).toBe(false);
  });

  it('refuses a protocol mismatch', () => {
    expect(ok(`https://localhost:8123${P}api/status`)).toBe(false);
    expect(ok(`ws://localhost:8123${P}api/status`)).toBe(false);
    expect(ok(`${ORIGIN}${P}api/status`, 'ws')).toBe(false);
    expect(ok(`wss://localhost:9999${P}x`, 'ws')).toBe(false);
  });
});

describe('confinedFetch', () => {
  it('refuses string, URL and Request inputs outside the mount without calling fetch', async () => {
    const under = vi.fn(async () => new Response('{}'));
    const f = confinedFetch(ORIGIN, ID, under as unknown as typeof fetch);
    const bad = `${ORIGIN}/api/contents/x`;
    await expect(f(bad)).rejects.toThrow(/outside the machine/);
    await expect(f(new URL(bad) as unknown as string)).rejects.toThrow(/outside the machine/);
    await expect(f(new Request(bad))).rejects.toThrow(/outside the machine/);
    expect(under).not.toHaveBeenCalled();
    await f(`${ORIGIN}${P}api/status`);
    await f(new Request(`${ORIGIN}${P}api/status`));
    expect(under).toHaveBeenCalledTimes(2);
  });
});

describe('a machine page', () => {
  function setup(answer?: (url: string, init?: RequestInit) => unknown) {
    const seen: string[] = [];
    const config = { kind: 'ganymede', url: '', token: '', machine: ID } as const;
    const base = settingsFor(config, ORIGIN);
    const fake = async (input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.url;
      seen.push(new URL(url).pathname);
      return new Response(JSON.stringify(answer?.(url, init) ?? {}), {
        status: (typeof input === 'string' ? init?.method : input.method) === 'POST' ? 201 : 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    // Same call path as connectTo, with the fetch underneath injected.
    const settings = {
      ...base,
      fetch: confinedFetch(ORIGIN, ID, fake as unknown as typeof fetch),
    };
    return { contents: new ContentsManager({ serverSettings: settings }), seen };
  }
  const outside = (seen: string[]) => seen.filter(p => !p.startsWith(P));

  it('builds confined settings only for a machine', () => {
    const own = settingsFor({ kind: 'ganymede', url: '', token: '' }, ORIGIN);
    expect(own.fetch).toBe(globalThis.fetch);
    expect(
      settingsFor({ kind: 'ganymede', url: '', token: '', machine: ID }, ORIGIN).fetch,
    ).not.toBe(globalThis.fetch);
  });

  it('refuses get and save with a climbing path', async () => {
    const { contents, seen } = setup();
    // Jupyter's own URL join already resolves the climb, so its base-URL
    // check may refuse first; either way nothing reaches the network.
    await expect(contents.get('../../../api/contents/x')).rejects.toThrow();
    await expect(
      contents.save('../../../api/contents/x', { type: 'file', format: 'text', content: 'x' }),
    ).rejects.toThrow();
    expect(seen).toEqual([]);
  });

  it('refuses a path a machine answers with', async () => {
    const { contents, seen } = setup(url =>
      url.endsWith('/api/contents/') || url.includes('/api/contents')
        ? {
            name: 'notes.ipynb',
            path: '../../../api/contents/Users/me/notes.ipynb',
            type: 'notebook',
            format: 'json',
            content: null,
            writable: true,
            created: '',
            last_modified: '',
            mimetype: '',
          }
        : {},
    );
    const model = await contents.newUntitled({ type: 'notebook' });
    await expect(contents.get(model.path)).rejects.toThrow();
    expect(outside(seen)).toEqual([]);
    expect(seen.length).toBe(1);
  });

  it('lets a normal path through', async () => {
    const { contents, seen } = setup(() => ({
      name: 'b.ipynb',
      path: 'a/b.ipynb',
      type: 'notebook',
      format: 'json',
      content: { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 },
      writable: true,
      created: '',
      last_modified: '',
      mimetype: '',
    }));
    await contents.get('a/b.ipynb');
    expect(seen).toEqual([`${P}api/contents/a/b.ipynb`]);
  });
});

describe('confinedWebSocket', () => {
  it('throws outside the mount without building the socket, and builds inside', () => {
    const made: string[] = [];
    class Fake {
      constructor(url: string | URL) {
        made.push(String(url));
      }
    }
    const WS = confinedWebSocket(ORIGIN, ID, Fake as unknown as typeof WebSocket);
    expect(() => new WS('ws://localhost:8123/api/events/subscribe')).toThrow(/outside the machine/);
    expect(() => new WS(`ws://localhost:8123${P}../api/x`)).toThrow(/outside the machine/);
    expect(() => new WS(`ws://evil.example${P}api/x`)).toThrow(/outside the machine/);
    expect(made).toEqual([]);
    new WS(`ws://localhost:8123${P}api/events/subscribe`);
    expect(made).toEqual([`ws://localhost:8123${P}api/events/subscribe`]);
  });
});
