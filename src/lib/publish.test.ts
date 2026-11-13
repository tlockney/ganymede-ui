import { ServerConnection } from '@jupyterlab/services';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import {
  defaultByline,
  defaultOptions,
  fetchPublished,
  PUBLISH_TIMEOUT_MS,
  pageName,
  publishAvailable,
  publishUrl,
} from './publish';

describe('publish', () => {
  afterEach(() => vi.restoreAllMocks());

  it('spells out every option in the URL, and leaves out an empty byline', () => {
    expect(
      publishUrl('http://h/base/', 'a b/Io #1.ipynb', {
        code: 'shown',
        byline: ' 13 November 2026 ',
        copy: true,
      }),
    ).toBe(
      'http://h/base/nbconvert/html/a%20b/Io%20%231.ipynb?code=shown&copy=true&byline=13+November+2026',
    );
    expect(publishUrl('http://h/', 'Io.ipynb', { code: 'hidden', byline: '  ', copy: false })).toBe(
      'http://h/nbconvert/html/Io.ipynb?code=hidden&copy=false',
    );
  });

  it('defaults to the CLI’s: code folded, the date, the notebook copy', () => {
    const day = new Date(2026, 10, 13);
    expect(defaultByline(day)).toBe('13 November 2026');
    expect(defaultOptions(day)).toEqual({ code: 'folded', byline: '13 November 2026', copy: true });
  });

  it('names the page after the notebook', () => {
    expect(pageName('moons/Io.ipynb')).toBe('Io.html');
    expect(pageName('notes.IPYNB')).toBe('notes.html');
  });

  it('publishes only from a Ganymede server, which redacts', () => {
    const { services } = fakeServices();
    expect(publishAvailable(fakeBackend(services))).toBe(true);
    expect(
      publishAvailable(
        fakeBackend(services, { kind: 'ganymede', url: '', token: '', kernels: 'page' }),
      ),
    ).toBe(true);
    expect(publishAvailable(fakeBackend(services, { kind: 'browser' }))).toBe(false);
    expect(publishAvailable(undefined)).toBe(false);
  });

  it('says what the server answered, and refuses a page that isn’t HTML', async () => {
    const { services, contents } = fakeServices();
    Object.assign(contents, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://h/' }),
    });
    const backend = fakeBackend(services);
    const opts = defaultOptions();
    const request = vi.spyOn(ServerConnection, 'makeRequest');
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'code must be shown, folded or hidden' }), {
        status: 400,
      }),
    );
    await expect(fetchPublished(backend, 'Io.ipynb', opts)).rejects.toThrow(
      'code must be shown, folded or hidden',
    );
    request.mockResolvedValueOnce(
      new Response('{}', { headers: { 'content-type': 'text/plain' } }),
    );
    await expect(fetchPublished(backend, 'Io.ipynb', opts)).rejects.toThrow('newer Ganymede');
    request.mockResolvedValueOnce(
      new Response('<!doctype html><title>App</title>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );
    await expect(fetchPublished(backend, 'Io.ipynb', opts)).rejects.toThrow('newer Ganymede');
    const html = (body: string) =>
      new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    const generator = '<meta name="generator" content="Ganymede 0.11.0">';
    const copy = '<script type="application/json" id="notebook">{}</script>';
    const page = (code: string) =>
      `<!doctype html>\n<head>\n${generator}\n<meta name="ganymede-code" content="${code}">\n</head><body>${copy}`;
    request.mockResolvedValueOnce(html(page('folded')));
    await expect(fetchPublished(backend, 'Io.ipynb', opts)).resolves.toBe(page('folded'));
  });

  it('refuses a page from a server that ignored the options', async () => {
    const { services, contents } = fakeServices();
    Object.assign(contents, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://h/' }),
    });
    const backend = fakeBackend(services);
    const request = vi.spyOn(ServerConnection, 'makeRequest');
    const html = (body: string) =>
      new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    // Ganymede 0.10.0: its page, code folded whatever was asked, no mode named.
    const old = '<head><meta name="generator" content="Ganymede 0.10.0"></head><body>';
    request.mockResolvedValueOnce(html(old));
    await expect(
      fetchPublished(backend, 'Io.ipynb', { code: 'hidden', byline: '', copy: false }),
    ).rejects.toThrow('default options');
    // A newer server that sent another mode than the one asked for.
    const folded =
      '<head><meta name="generator" content="Ganymede 0.11.0">' +
      '<meta name="ganymede-code" content="folded"></head><body>';
    request.mockResolvedValueOnce(html(folded));
    await expect(
      fetchPublished(backend, 'Io.ipynb', { code: 'hidden', byline: '', copy: false }),
    ).rejects.toThrow('default options');
    // The copy asked for and left out.
    request.mockResolvedValueOnce(html(folded));
    await expect(
      fetchPublished(backend, 'Io.ipynb', { code: 'folded', byline: '', copy: true }),
    ).rejects.toThrow('notebook copy');
  });

  it('gives up on a server that doesn’t answer', async () => {
    const { services, contents } = fakeServices();
    // Through makeRequest's own catch, which rewraps what fetch rejects with.
    const fetch = vi.fn((_u: RequestInfo, init?: RequestInit) =>
      Promise.reject(init!.signal!.reason as Error),
    );
    Object.assign(contents, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://h/', fetch }),
    });
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort(new DOMException('signal timed out', 'TimeoutError')));
    await expect(
      fetchPublished(fakeBackend(services), 'Io.ipynb', defaultOptions()),
    ).rejects.toThrow('didn’t answer in time');
    expect(timeout).toHaveBeenCalledWith(PUBLISH_TIMEOUT_MS);
    expect(fetch).toHaveBeenCalledOnce();
    timeout.mockRestore();
  });
});
