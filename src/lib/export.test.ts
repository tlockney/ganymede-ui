import { ServerConnection } from '@jupyterlab/services';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PUBLISH_TIMEOUT_MS } from './publish';
import { attachmentName, exportUrl, fetchExport } from './export';

const settings = (fetch?: typeof globalThis.fetch) =>
  ServerConnection.makeSettings({ baseUrl: 'http://h/', ...(fetch ? { fetch } : {}) });

describe('export', () => {
  afterEach(() => vi.restoreAllMocks());

  it('asks for the export as a download', () => {
    expect(exportUrl('http://h/', 'moons/Io moon.ipynb', 'markdown')).toBe(
      'http://h/nbconvert/markdown/moons/Io%20moon.ipynb?download=true',
    );
    expect(exportUrl('http://h/base/', 'Io.ipynb', 'script')).toBe(
      'http://h/base/nbconvert/script/Io.ipynb?download=true',
    );
  });

  it('names the file as the server does', () => {
    expect(attachmentName("attachment; filename*=utf-8''Io%20moon.py", 'x')).toBe('Io moon.py');
    expect(attachmentName('attachment; filename="Io.md"', 'x')).toBe('Io.md');
    expect(attachmentName('attachment; filename=Io.zip', 'x')).toBe('Io.zip');
    // A name only, never a path.
    expect(attachmentName('attachment; filename="../../etc/Io.md"', 'x')).toBe('Io.md');
    expect(attachmentName(null, 'Io.md')).toBe('Io.md');
    expect(attachmentName('inline', 'Io.md')).toBe('Io.md');
  });

  it('downloads what the server sends, by its name', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('print(1)\n', {
          headers: {
            'content-type': 'text/x-python; charset=utf-8',
            'content-disposition': "attachment; filename*=utf-8''Io.py",
          },
        }),
    );
    const { name, data } = await fetchExport(settings(fetch), 'moons/Io.ipynb', 'script');
    // makeRequest adds a cache buster.
    expect(((fetch.mock.calls[0] as unknown[])[0] as Request).url).toMatch(
      /^http:\/\/h\/nbconvert\/script\/moons\/Io\.ipynb\?download=true(&\d+)?$/,
    );
    expect(name).toBe('Io.py');
    expect(await data.text()).toBe('print(1)\n');
    // No name from the server: the notebook's, with the format's extension.
    fetch.mockResolvedValueOnce(new Response('# Io'));
    expect((await fetchExport(settings(fetch), 'moons/Io.ipynb', 'markdown')).name).toBe('Io.md');
  });

  it('says what the server said when it fails', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ message: 'No exporter for format: script' }), {
          status: 404,
        }),
    );
    await expect(fetchExport(settings(fetch), 'Io.ipynb', 'script')).rejects.toThrow(
      'No exporter for format: script',
    );
    fetch.mockResolvedValueOnce(new Response('oops', { status: 500 }));
    await expect(fetchExport(settings(fetch), 'Io.ipynb', 'script')).rejects.toThrow(
      'The server answered 500.',
    );
  });

  it('gives up on a server that doesn’t answer', async () => {
    const fetch = vi.fn((_u: RequestInfo, init?: RequestInit) =>
      Promise.reject(init!.signal!.reason as Error),
    );
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort(new DOMException('signal timed out', 'TimeoutError')));
    await expect(
      fetchExport(settings(fetch as typeof globalThis.fetch), 'Io.ipynb', 'markdown'),
    ).rejects.toThrow('didn’t answer in time');
    expect(timeout).toHaveBeenCalledWith(PUBLISH_TIMEOUT_MS);
  });
});
