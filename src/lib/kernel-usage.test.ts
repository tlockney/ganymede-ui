import { ServerConnection } from '@jupyterlab/services';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MEMORY_POLL_MS, formatMemory, kernelMemory, useKernelMemory } from './kernel-usage';

/** Server settings whose fetch answers from `answer`, recording each URL asked. */
function server(answer: (url: string) => Response | Promise<Response>) {
  const asked: string[] = [];
  const settings = ServerConnection.makeSettings({
    baseUrl: 'http://server/',
    fetch: ((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : input.url;
      asked.push(url.replace(/\?.*$/, ''));
      return Promise.resolve(answer(url));
    }) as typeof fetch,
  });
  return { settings, asked };
}

const usage = (kernel_memory: unknown) =>
  new Response(JSON.stringify({ kernel_id: 'k', content: { kernel_memory, kernel_cpu: 0 } }));

afterEach(() => vi.useRealTimers());

describe('kernelMemory', () => {
  it("reads kernel_memory from the kernel's usage", async () => {
    const { settings, asked } = server(() => usage(61865984));
    expect(await kernelMemory(settings, 'a b')).toBe(61865984);
    expect(asked).toEqual(['http://server/api/metrics/v1/kernel_usage/get_usage/a%20b']);
  });

  it('is null without the endpoint, for an unmeasured kernel, or on a bad answer', async () => {
    expect(await kernelMemory(server(() => new Response('', { status: 404 })).settings, 'k')).toBe(
      null,
    );
    const noProcess = new Response(JSON.stringify({ content: { reason: 'no_process' } }));
    expect(await kernelMemory(server(() => noProcess).settings, 'k')).toBe(null);
    expect(await kernelMemory(server(() => usage(-1)).settings, 'k')).toBe(null);
    expect(await kernelMemory(server(() => new Response('not json')).settings, 'k')).toBe(null);
    const down = server(() => Promise.reject(new TypeError('offline')));
    expect(await kernelMemory(down.settings, 'k')).toBe(null);
  });
});

describe('formatMemory', () => {
  it('shows bytes as Activity Monitor does', () => {
    expect(formatMemory(512)).toBe('512 bytes');
    expect(formatMemory(812 * 1024)).toBe('812 KB');
    expect(formatMemory(61865984)).toBe('59.0 MB');
    expect(formatMemory(1.25 * 1024 ** 3)).toBe('1.25 GB');
  });
});

describe('useKernelMemory', () => {
  it('asks for each kernel while active, again each poll, and never while inactive', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let bytes = 1024;
    const { settings, asked } = server(url => (url.includes('/b') ? usage(null) : usage(bytes)));
    const { result, rerender } = renderHook(
      ({ active }) => useKernelMemory(settings, ['a', 'b'], active),
      { initialProps: { active: false } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEMORY_POLL_MS * 2);
    });
    expect(asked).toEqual([]);

    rerender({ active: true });
    await waitFor(() => expect(result.current.get('a')).toBe(1024));
    expect(result.current.has('b')).toBe(false);
    expect(asked).toHaveLength(2);

    bytes = 2048;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEMORY_POLL_MS);
    });
    await waitFor(() => expect(result.current.get('a')).toBe(2048));
    expect(asked).toHaveLength(4);

    rerender({ active: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEMORY_POLL_MS * 2);
    });
    expect(asked).toHaveLength(4);
  });

  it('waits for a slow answer before asking again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer: (r: Response) => void = () => {};
    const { settings, asked } = server(() => new Promise<Response>(resolve => (answer = resolve)));
    const { result } = renderHook(() => useKernelMemory(settings, ['a'], true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEMORY_POLL_MS * 3);
    });
    expect(asked).toHaveLength(1);
    await act(async () => {
      answer(usage(4096));
    });
    await waitFor(() => expect(result.current.get('a')).toBe(4096));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MEMORY_POLL_MS);
    });
    expect(asked).toHaveLength(2);
  });

  it('asks nothing without server settings or kernels', async () => {
    const { settings, asked } = server(() => usage(1));
    renderHook(() => useKernelMemory(undefined, ['a'], true));
    renderHook(() => useKernelMemory(settings, [], true));
    await act(async () => {
      await Promise.resolve();
    });
    expect(asked).toEqual([]);
  });
});
