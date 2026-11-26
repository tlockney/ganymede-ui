import { ServerConnection } from '@jupyterlab/services';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PLACES_POLL_MS,
  fetchKernelPlaces,
  kernelPlaces,
  notAnsweringLine,
  placeLabel,
  useKernelPlaces,
  type KernelsRemote,
} from './kernel-place';

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

const answer = (body: unknown) => new Response(JSON.stringify(body));

const down: KernelsRemote = {
  name: 'workmbp',
  reachable: false,
  error: 'gateway: error sending request',
};

describe('kernelPlaces', () => {
  it('reads the remote and the specs that run on it', () => {
    expect(
      kernelPlaces({
        default: 'python3',
        kernelspecs: {
          python3: { name: 'python3', gateway: true },
          cdp: { name: 'cdp' },
          julia: { name: 'julia', gateway: false },
        },
        gateway: { name: 'workmbp', reachable: false, error: 'gateway: error sending request' },
      }),
    ).toEqual({ remote: down, gateway: ['python3'] });
  });

  it('is no places without the keys, as a released server sends', () => {
    const plain = { default: 'python3', kernelspecs: { python3: { name: 'python3' } } };
    expect(kernelPlaces(plain)).toEqual({ remote: null, gateway: [] });
    expect(kernelPlaces(null)).toEqual({ remote: null, gateway: [] });
    expect(kernelPlaces('not a body')).toEqual({ remote: null, gateway: [] });
    expect(kernelPlaces({})).toEqual({ remote: null, gateway: [] });
  });

  it('is no remote before the first check, and no error for an empty one', () => {
    const remote = (gateway: unknown) => kernelPlaces({ kernelspecs: {}, gateway }).remote;
    expect(remote({ name: 'workmbp', reachable: false, error: null })).toEqual({
      name: 'workmbp',
      reachable: false,
      error: null,
    });
    expect(remote({ name: 'workmbp', reachable: true, error: '' })).toEqual({
      name: 'workmbp',
      reachable: true,
      error: null,
    });
    for (const bad of [
      null,
      {},
      { name: '' },
      { name: 'w', reachable: 'yes' },
      { reachable: true },
    ]) {
      expect(remote(bad)).toBeNull();
    }
  });
});

describe('fetchKernelPlaces', () => {
  it('asks the server for the kernelspecs', async () => {
    const { settings, asked } = server(() =>
      answer({
        kernelspecs: { python3: { gateway: true } },
        gateway: { name: 'workmbp', reachable: true, error: null },
      }),
    );
    expect(await fetchKernelPlaces(settings)).toEqual({
      remote: { name: 'workmbp', reachable: true, error: null },
      gateway: ['python3'],
    });
    expect(asked).toEqual(['http://server/api/kernelspecs']);
  });

  it('is null when the server cannot say', async () => {
    expect(await fetchKernelPlaces(server(() => new Response('', { status: 404 })).settings)).toBe(
      null,
    );
    expect(await fetchKernelPlaces(server(() => new Response('not json')).settings)).toBe(null);
    const offline = server(() => Promise.reject(new TypeError('offline')));
    expect(await fetchKernelPlaces(offline.settings)).toBe(null);
  });
});

describe('placeLabel', () => {
  it('marks a spec that runs on a remote with its name', () => {
    const spec = { display_name: 'TypeScript (cdp-kernel, node)' };
    expect(placeLabel(spec, 'workmbp')).toBe('TypeScript (cdp-kernel, node) · workmbp');
    expect(placeLabel(spec, null)).toBe('TypeScript (cdp-kernel, node)');
    expect(placeLabel(spec)).toBe('TypeScript (cdp-kernel, node)');
  });
});

describe('notAnsweringLine', () => {
  it('says the remote is not answering, with why', () => {
    expect(notAnsweringLine(down)).toBe('workmbp isn’t answering: gateway: error sending request');
  });

  it('says nothing while it answers, before the first check, or without a remote', () => {
    expect(notAnsweringLine({ ...down, reachable: true })).toBeNull();
    expect(notAnsweringLine({ ...down, error: null })).toBeNull();
    expect(notAnsweringLine(null)).toBeNull();
    expect(notAnsweringLine(undefined)).toBeNull();
  });

  it("names the machine whose kernels the remote runs, in a machine's window", () => {
    expect(notAnsweringLine(down, 'm5air')).toBe(
      'm5air runs kernels on workmbp, which isn’t answering',
    );
    expect(notAnsweringLine({ ...down, reachable: true }, 'm5air')).toBeNull();
  });
});

describe('useKernelPlaces', () => {
  afterEach(() => vi.useRealTimers());

  it('asks at once, and again at the server’s pace while a remote is set', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let reachable = false;
    const { settings, asked } = server(() =>
      answer({
        kernelspecs: { python3: { gateway: true } },
        gateway: { name: 'workmbp', reachable, error: reachable ? null : down.error },
      }),
    );
    const { result } = renderHook(() => useKernelPlaces(settings));
    await waitFor(() => expect(result.current.remote).toEqual(down));
    expect(result.current.gateway).toEqual(['python3']);
    expect(asked).toHaveLength(1);

    reachable = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACES_POLL_MS);
    });
    await waitFor(() => expect(result.current.remote?.reachable).toBe(true));
    expect(asked).toHaveLength(2);
  });

  it("stops asking when the server's kernels run on it, or it can't say", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const plain = server(() => answer({ kernelspecs: { python3: {} } }));
    const { result } = renderHook(() => useKernelPlaces(plain.settings));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACES_POLL_MS * 2);
    });
    expect(result.current.remote).toBeNull();
    expect(plain.asked).toHaveLength(1);

    const none = server(() => new Response('', { status: 503 }));
    renderHook(() => useKernelPlaces(none.settings));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACES_POLL_MS * 2);
    });
    expect(none.asked).toHaveLength(1);
  });

  it('ignores an answer for a server the page has left', async () => {
    // The first server answers once, then holds its next answer.
    const held: Array<(response: Response) => void> = [];
    let hold = false;
    const first = server(() =>
      hold
        ? new Promise<Response>(resolve => held.push(resolve))
        : answer({ kernelspecs: { py: { gateway: true } }, gateway: down }),
    );
    const never = server(() => new Promise<Response>(() => {}));
    const { result, rerender } = renderHook(({ settings }) => useKernelPlaces(settings), {
      initialProps: { settings: first.settings },
    });
    await waitFor(() => expect(result.current.remote).toEqual(down));

    hold = true;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(held).toHaveLength(1));

    // The second server hasn't answered: the first's answer is gone.
    rerender({ settings: never.settings });
    expect(result.current.remote).toBeNull();
    expect(result.current.gateway).toEqual([]);

    // The first server's answer, arriving late, isn't the second's.
    await act(async () => {
      held[0](
        answer({
          kernelspecs: { py: { gateway: true } },
          gateway: { ...down, reachable: true, error: null },
        }),
      );
    });
    expect(result.current.remote).toBeNull();
    expect(result.current.gateway).toEqual([]);
  });

  it('asks again after a failed ask while a remote was named', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let failing = false;
    const { settings, asked } = server(() =>
      failing ? new Response('', { status: 503 }) : answer({ kernelspecs: {}, gateway: down }),
    );
    const { result } = renderHook(() => useKernelPlaces(settings));
    await waitFor(() => expect(result.current.remote).toEqual(down));
    expect(asked).toHaveLength(1);

    // The remote coming back is what the page waits for: a failed ask keeps
    // the last answer, and asks again on the next tick.
    failing = true;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACES_POLL_MS);
    });
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(result.current.remote).toEqual(down);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PLACES_POLL_MS);
    });
    await waitFor(() => expect(asked).toHaveLength(3));
  });

  it('asks nothing while the page is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      const { settings, asked } = server(() => answer({ kernelspecs: {} }));
      const { result } = renderHook(() => useKernelPlaces(settings));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(PLACES_POLL_MS * 2);
      });
      expect(asked).toHaveLength(0);
      expect(result.current.remote).toBeNull();
    } finally {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
    }
  });

  it('asks when the page comes to the front', async () => {
    const { settings, asked } = server(() => answer({ kernelspecs: {} }));
    renderHook(() => useKernelPlaces(settings));
    await waitFor(() => expect(asked).toHaveLength(1));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await waitFor(() => expect(asked).toHaveLength(2));

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(asked).toHaveLength(3));
  });

  it('asks nothing without a backend, and asks the next one afresh', async () => {
    const { result } = renderHook(() => useKernelPlaces(undefined));
    expect(result.current.remote).toBeNull();
    expect(result.current.gateway).toEqual([]);

    const first = server(() =>
      answer({ kernelspecs: {}, gateway: { name: 'workmbp', reachable: false, error: 'x' } }),
    );
    const { result: hook, rerender } = renderHook(({ settings }) => useKernelPlaces(settings), {
      initialProps: { settings: first.settings },
    });
    await waitFor(() => expect(hook.current.remote?.name).toBe('workmbp'));
    const second = server(() => answer({ kernelspecs: { python3: { gateway: true } } }));
    rerender({ settings: second.settings });
    // The first server's remote doesn't stand in for the second's.
    await waitFor(() => expect(hook.current.gateway).toEqual(['python3']));
    expect(hook.current.remote).toBeNull();
  });
});
