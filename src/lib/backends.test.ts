import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// @jupyterlab/services takes the page's WebSocket when it loads, so the fake
// has to be in place before the import below. It records every socket the
// service manager opens (the events stream, for one) instead of dialing out.
const sockets = vi.hoisted(() => {
  const opened: string[] = [];
  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 0;
    onopen: ((e: unknown) => void) | null = null;
    onclose: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onmessage: ((e: unknown) => void) | null = null;
    constructor(readonly url: string) {
      opened.push(url);
    }
    send() {}
    close() {
      this.readyState = 3;
    }
  }
  globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  return { opened };
});

import type { ServiceManager } from '@jupyterlab/services';
import { fakeBackend, fakeServices } from '../test/fakes';
import {
  type Backend,
  connect,
  loadConfig,
  saveConfig,
  signedInHere,
  trustNotebook,
} from './backends';

const KERNELSPECS = {
  default: 'python3',
  kernelspecs: {
    python3: {
      name: 'python3',
      spec: { display_name: 'Python 3', language: 'python', argv: [] },
      resources: {},
    },
  },
};

type Seen = { url: string; authorization: string | null; credentials: RequestCredentials };

/** A Ganymede server that answers the REST calls a ServiceManager makes. */
function fakeServer(status = 200) {
  const seen: Seen[] = [];
  const fetch = vi.fn(async (req: Request) => {
    const url = new URL(req.url);
    seen.push({
      url: req.url,
      authorization: req.headers.get('Authorization'),
      credentials: req.credentials,
    });
    const path = url.pathname;
    const json = (body: unknown, code = 200) =>
      new Response(JSON.stringify(body), {
        status: code,
        headers: { 'Content-Type': 'application/json' },
      });
    if (path.endsWith('/api/status')) return json({}, status);
    if (path.endsWith('/api/kernelspecs')) return json(KERNELSPECS);
    if (path.endsWith('/api/me')) {
      return json({ identity: { username: 'u', name: 'U', display_name: 'U' }, permissions: {} });
    }
    if (/\/api\/(sessions|kernels|terminals)$/.test(path)) return json([]);
    return json({});
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, seen };
}

let opened: Backend | undefined;
const keep = (b: Backend) => (opened = b);

afterEach(() => {
  opened?.services.dispose();
  opened = undefined;
  sockets.opened.length = 0;
});

describe('connect: ganymede', () => {
  it('talks to this page’s origin when no server is given', async () => {
    const { seen } = fakeServer();
    const backend = keep(await connect({ kind: 'ganymede', url: '', token: 'secret' }));

    const settings = backend.services.serverSettings;
    expect(settings.baseUrl).toBe(`${window.location.origin}/`);
    expect(settings.wsUrl).toBe(`${window.location.origin.replace(/^http/, 'ws')}/`);
    expect(settings.token).toBe('secret');
    expect(settings.appendToken).toBe(true);
    expect(settings.init.credentials).toBe('same-origin');
    expect(backend.label).toBe('Ganymede');
    expect(backend.detail).toBe('local server');

    // The status check comes first, with the token.
    expect(seen[0]!.url.split('?')[0]).toBe(`${window.location.origin}/api/status`);
    expect(seen[0]!.authorization).toBe('token secret');
    expect(seen.every(r => r.authorization === 'token secret')).toBe(true);
    expect(seen.some(r => r.url.includes('/api/kernelspecs'))).toBe(true);
    expect(backend.services.kernelspecs.specs?.default).toBe('python3');
  });

  it('uses the given server and trims trailing slashes; a token means no cookies', async () => {
    const { seen } = fakeServer();
    const backend = keep(
      await connect({ kind: 'ganymede', url: 'https://kernels.example:9999//', token: 't0k' }),
    );

    const settings = backend.services.serverSettings;
    expect(settings.baseUrl).toBe('https://kernels.example:9999/');
    expect(settings.wsUrl).toBe('wss://kernels.example:9999/');
    expect(settings.init.credentials).toBe('same-origin');
    expect(backend.detail).toBe('kernels.example:9999');
    expect(seen.every(r => r.url.startsWith('https://kernels.example:9999/api/'))).toBe(true);
    expect(seen[0]!.credentials).toBe('same-origin');
  });

  it('sends cookies to another server when there is no token', async () => {
    const { seen } = fakeServer();
    const backend = keep(
      await connect({ kind: 'ganymede', url: 'https://kernels.example:9999', token: '' }),
    );
    expect(backend.services.serverSettings.init.credentials).toBe('include');
    expect(seen[0]!.credentials).toBe('include');
  });

  it('puts the token on websocket URLs', async () => {
    fakeServer();
    keep(await connect({ kind: 'ganymede', url: 'http://127.0.0.1:8888', token: 'abc' }));
    await vi.waitFor(() => expect(sockets.opened.length).toBeGreaterThan(0));
    for (const url of sockets.opened) {
      expect(url.startsWith('ws://127.0.0.1:8888/api/')).toBe(true);
      expect(new URL(url).searchParams.get('token')).toBe('abc');
    }
  });

  it.each([
    [401, 'The server refused the token.'],
    [403, 'The server refused the token.'],
    [500, 'The server answered 500.'],
  ])('reports a %i from the status check', async (status, message) => {
    const { fetch } = fakeServer(status);
    await expect(connect({ kind: 'ganymede', url: '', token: 'x' })).rejects.toThrow(message);
    // Nothing else is asked before the status check passes.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(connect({ kind: 'ganymede', url: '', token: 'x' })).rejects.toThrow();
  });
});

describe('connect: browser', () => {
  let services: ServiceManager.IManager;

  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('no network in the browser backend')),
    );
    const backend = keep(await connect({ kind: 'browser' }));
    expect(backend.label).toBe('This browser');
    expect(backend.detail).toBe('JavaScript in a Web Worker');
    services = backend.services;
  });

  it('builds the in-page server without the network', () => {
    const settings = services.serverSettings;
    expect(settings.baseUrl).toBe(`${window.location.origin}/`);
    expect(settings.wsUrl).toBe(`${window.location.origin.replace(/^http/, 'ws')}/`);
    // Kernel websockets go to mock-socket, not the page's WebSocket.
    expect(settings.WebSocket).not.toBe(globalThis.WebSocket);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('offers cdp-kernel first, and the JavaScript Web Worker kernel', () => {
    const specs = services.kernelspecs.specs;
    // JupyterLite's default is the first name in order.
    expect(specs?.default).toBe('cdp-browser');
    expect(specs?.kernelspecs['cdp-browser']?.display_name).toBe('TypeScript (cdp-kernel)');
    expect(specs?.kernelspecs.javascript?.display_name).toBe('JavaScript (Web Worker)');
  });

  it('stores notebooks in browser storage', async () => {
    const model = await services.contents.newUntitled({ type: 'notebook', path: '' });
    expect(model.path).toMatch(/\.ipynb$/);
    const listing = await services.contents.get('', { content: true });
    expect(listing.content.map((m: { path: string }) => m.path)).toContain(model.path);
    await services.contents.delete(model.path);
  });
});

describe('connect: ganymede, kernels in the page', () => {
  it('keeps notebooks on the server and runs the browser kernels', async () => {
    const { fetch, seen } = fakeServer();
    const backend = keep(
      await connect({
        kind: 'ganymede',
        url: 'https://ipad.example:8888',
        token: 't0k',
        kernels: 'page',
      }),
    );
    expect(backend.label).toBe('Ganymede');
    expect(backend.detail).toBe('ipad.example:8888, kernels in this page');

    const specs = backend.services.kernelspecs.specs;
    expect(specs?.default).toBe('cdp-browser');
    // Only the status check went to the server; kernels never do.
    expect(seen.map(s => new URL(s.url).pathname)).toEqual(['/api/status']);

    const contents = backend.services.contents.serverSettings;
    expect(contents.baseUrl).toBe('https://ipad.example:8888/');
    expect(contents.token).toBe('t0k');

    fetch.mockClear();
    await trustNotebook(backend, 'Io.ipynb');
    const req = fetch.mock.calls[0]![0] as Request;
    expect(req.url.split('?')[0]).toBe('https://ipad.example:8888/api/contents/Io.ipynb/trust');
    expect(req.headers.get('Authorization')).toBe('token t0k');
  });
});

describe('trustNotebook', () => {
  const lastRequest = (fetch: ReturnType<typeof vi.fn>) =>
    fetch.mock.calls[fetch.mock.calls.length - 1]![0] as Request;

  it('asks Ganymede to sign the notebook', async () => {
    const { fetch } = fakeServer();
    const backend = keep(await connect({ kind: 'ganymede', url: '', token: 'secret' }));
    fetch.mockClear();
    await trustNotebook(backend, 'moons/Galilean moons.ipynb');
    expect(fetch).toHaveBeenCalledTimes(1);
    const req = lastRequest(fetch);
    expect(req.method).toBe('POST');
    expect(req.url.split('?')[0]).toBe(
      `${window.location.origin}/api/contents/moons/Galilean%20moons.ipynb/trust`,
    );
    expect(req.headers.get('Authorization')).toBe('token secret');
  });

  it('reports a refusal', async () => {
    const { fetch } = fakeServer();
    const backend = keep(await connect({ kind: 'ganymede', url: '', token: 'secret' }));
    fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(trustNotebook(backend, 'gone.ipynb')).rejects.toThrow('404');
  });

  it('does nothing for the browser backend', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const { services } = fakeServices();
    await trustNotebook(fakeBackend(services, { kind: 'browser' }), 'Untitled.ipynb');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('signedInHere', () => {
  it("asks this page's server for its status on the login cookie", async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    expect(await signedInHere()).toBe(true);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(`${window.location.origin}/api/status`);
    expect(init.credentials).toBe('same-origin');
  });

  it('is false when the server refuses, or there is none', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    expect(await signedInHere()).toBe(false);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    expect(await signedInHere()).toBe(false);
  });
});

describe('saved config', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips through localStorage', () => {
    expect(loadConfig()).toBeUndefined();
    saveConfig({ kind: 'ganymede', url: 'https://x.example', token: 't' });
    expect(loadConfig()).toEqual({ kind: 'ganymede', url: 'https://x.example', token: 't' });
    saveConfig({ kind: 'browser' });
    expect(loadConfig()).toEqual({ kind: 'browser' });
  });

  it('ignores a corrupt entry', () => {
    localStorage.setItem('ganymede-ui:backend', '{not json');
    expect(loadConfig()).toBeUndefined();
  });

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => saveConfig({ kind: 'browser' })).not.toThrow();
    expect(loadConfig()).toBeUndefined();
  });
});
