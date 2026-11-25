import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE, FILES, resetDuckdbFiles } from '../lib/duckdb-files';
import { OfflineSqlSection } from './OfflineSqlSection';

/** A Cache Storage with one cache, as a Map. */
function fakeCaches(store = new Map<string, Response>()) {
  const names = new Set<string>();
  const cache = {
    match: async (url: string) => store.get(url)?.clone(),
    // As Cache Storage does: reads the body to its end, or rejects.
    put: async (url: string, res: Response) =>
      void store.set(url, new Response(await res.arrayBuffer())),
  };
  vi.stubGlobal('caches', {
    open: async (name: string) => (names.add(name), cache),
    keys: async () => [...names],
    has: async (name: string) => names.has(name),
    delete: async (name: string) => names.delete(name),
  });
  return { store, names, cache };
}

describe('Offline SQL in Settings (#794)', () => {
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

  it('is hidden without Cache Storage', () => {
    vi.stubGlobal('caches', undefined);
    const { container } = render(<OfflineSqlSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it('downloads DuckDB on a click, showing the bytes, and fetches nothing before', async () => {
    fakeCaches();
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const fetch = vi.fn(async (_url: string) => {
      const body = new ReadableStream<Uint8Array>({
        async start(c) {
          c.enqueue(new Uint8Array(2 * 1024 * 1024));
          await gate;
          c.close();
        },
      });
      return new Response(body, { headers: { 'content-length': String(4 * 1024 * 1024) } });
    });
    vi.stubGlobal('fetch', fetch);
    render(<OfflineSqlSection />);
    const button = await screen.findByRole('button', { name: 'Download DuckDB' });
    expect(fetch).not.toHaveBeenCalled();

    await userEvent.click(button);
    expect(await screen.findByRole('status')).toHaveTextContent(/MB of 8\.0 MB/);
    expect(screen.getByRole('button', { name: 'Download DuckDB' })).toBeDisabled();
    expect(screen.getByRole('progressbar', { name: 'DuckDB download' })).toBeInTheDocument();
    release();
    expect(await screen.findByText(/SQL works offline/)).toBeInTheDocument();
    expect(fetch.mock.calls.map(c => c[0])).toEqual(FILES.map(f => f.url));
    expect(screen.queryByRole('button', { name: 'Download DuckDB' })).toBeNull();
  });

  it('says why a download failed, and tries again', async () => {
    fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let status = 503;
    vi.stubGlobal('fetch', async (url: string) => new Response(url, { status }));
    render(<OfflineSqlSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Download DuckDB' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'DuckDB didn’t download: cdn.jsdelivr.net answered 503.',
    );

    status = 200;
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText(/SQL works offline/)).toBeInTheDocument();
  });

  it('tries again after the browser had no room, when asked', async () => {
    const { cache } = fakeCaches();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const put = cache.put;
    cache.put = async () => {
      throw new DOMException('q', 'QuotaExceededError');
    };
    vi.stubGlobal('fetch', async (url: string) => new Response(url));
    render(<OfflineSqlSection />);
    await userEvent.click(await screen.findByRole('button', { name: 'Download DuckDB' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'DuckDB didn’t download: This browser has no room to keep DuckDB.',
    );

    cache.put = put;
    await userEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(await screen.findByText(/SQL works offline/)).toBeInTheDocument();
  });

  it('shows the files an earlier visit kept as downloaded', async () => {
    const { store, names } = fakeCaches();
    names.add(CACHE);
    for (const f of FILES) store.set(f.url, new Response(f.url));
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    render(<OfflineSqlSection />);
    expect(await screen.findByText(/SQL works offline/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
