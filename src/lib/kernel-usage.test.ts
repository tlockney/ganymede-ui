import { ServerConnection } from '@jupyterlab/services';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASK_SLACK_MS,
  MEMORY_POLL_MS,
  diedOutOfMemory,
  formatMemory,
  kernelMemory,
  kernelUsage,
  nearMemoryLimit,
  useKernelMemory,
  useLastKernelReading,
} from './kernel-usage';

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

const GB = 1024 ** 3;
const hostUsage = (kernel_memory: number, total: number, available: number) =>
  new Response(
    JSON.stringify({
      kernel_id: 'k',
      content: { kernel_memory, host_virtual_memory: { total, available, percent: 0 } },
    }),
  );

describe('kernelUsage', () => {
  it("reads the kernel's memory and the host's", async () => {
    const { settings } = server(() => hostUsage(GB, 16 * GB, 8 * GB));
    expect(await kernelUsage(settings, 'k')).toEqual({
      memory: GB,
      host: { total: 16 * GB, available: 8 * GB },
    });
  });

  it("leaves the host out when the server doesn't give it", async () => {
    expect(await kernelUsage(server(() => usage(GB)).settings, 'k')).toEqual({ memory: GB });
    expect(await kernelUsage(server(() => hostUsage(GB, 0, 0)).settings, 'k')).toEqual({
      memory: GB,
    });
  });
});

describe('nearMemoryLimit', () => {
  it('is near when the host has under 5% available or the kernel holds over 90%', () => {
    const host = (available: number) => ({ total: 100 * GB, available });
    expect(nearMemoryLimit({ memory: GB, host: host(4 * GB) })).toBe(true);
    expect(nearMemoryLimit({ memory: GB, host: host(5 * GB) })).toBe(false);
    expect(nearMemoryLimit({ memory: 91 * GB, host: host(50 * GB) })).toBe(true);
    expect(nearMemoryLimit({ memory: 90 * GB, host: host(50 * GB) })).toBe(false);
    expect(nearMemoryLimit({ memory: 99 * GB })).toBe(false);
  });
});

describe('diedOutOfMemory', () => {
  const near = { memory: GB, host: { total: 16 * GB, available: 0 } };
  const far = { memory: GB, host: { total: 16 * GB, available: 8 * GB } };
  const at = 1_000_000;
  it('is true for a recent reading of that kernel near the limit', () => {
    expect(diedOutOfMemory({ kernelId: 'k', at, reading: near }, 'k', at + MEMORY_POLL_MS)).toBe(
      true,
    );
  });
  it('is false when the reading was far, stale, of another kernel, or missing', () => {
    expect(diedOutOfMemory({ kernelId: 'k', at, reading: far }, 'k', at)).toBe(false);
    const late = at + MEMORY_POLL_MS + ASK_SLACK_MS + 1;
    expect(diedOutOfMemory({ kernelId: 'k', at, reading: near }, 'k', late)).toBe(false);
    expect(diedOutOfMemory({ kernelId: 'j', at, reading: near }, 'k', at)).toBe(false);
    expect(diedOutOfMemory(undefined, 'k', at)).toBe(false);
  });
});

describe('useLastKernelReading', () => {
  it('keeps the last reading while active, and the one before a kernel goes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer: () => Response = () => hostUsage(GB, 16 * GB, 8 * GB);
    const { settings, asked } = server(() => answer());
    const { result, rerender } = renderHook(
      ({ active }) => useLastKernelReading(settings, 'k', active),
      { initialProps: { active: true } },
    );
    await waitFor(() => expect(result.current.current?.reading.memory).toBe(GB));
    answer = () => new Response('', { status: 404 });
    await act(() => vi.advanceTimersByTimeAsync(MEMORY_POLL_MS));
    expect(asked).toHaveLength(2);
    expect(result.current.current?.reading.memory).toBe(GB);
    rerender({ active: false });
    await act(() => vi.advanceTimersByTimeAsync(3 * MEMORY_POLL_MS));
    expect(asked).toHaveLength(2);
  });
});
