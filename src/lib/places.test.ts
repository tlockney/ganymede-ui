import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FIRST_RETRY_MS,
  MAX_BACKOFF_MS,
  REACHABLE_POLL_MS,
  nextCheckDelay,
  pagePlaces,
  usePlaces,
  watchReachable,
} from './places';

describe('pagePlaces', () => {
  it('reads the places the app gave the page, dropping the malformed', () => {
    expect(
      pagePlaces({
        ganymedePlaces: [
          { id: null, name: 'This Mac' },
          { id: 'mini-1', name: 'm4mini' },
          { id: '../x', name: 'bad id' },
          { id: 'ok', name: '' },
          'nope',
        ],
      }),
    ).toEqual([
      { id: null, name: 'This Mac' },
      { id: 'mini-1', name: 'm4mini' },
    ]);
    expect(pagePlaces({})).toEqual([]);
    expect(pagePlaces(null)).toEqual([]);
  });
});

describe('reachability backoff', () => {
  it('polls steadily while reachable, then backs off 1s, 2s, 4s… up to 30s', () => {
    expect(nextCheckDelay(0)).toBe(REACHABLE_POLL_MS);
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(nextCheckDelay)).toEqual([
      FIRST_RETRY_MS,
      2_000,
      4_000,
      8_000,
      16_000,
      MAX_BACKOFF_MS,
      MAX_BACKOFF_MS,
      MAX_BACKOFF_MS,
    ]);
  });

  describe('watchReachable', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('reports each answer, backs off while down, and recovers to the usual poll', async () => {
      const answers = [true, false, false, false, true, true];
      const check = vi.fn(async () => answers.shift() ?? true);
      const seen: boolean[] = [];
      const stop = watchReachable(check, r => seen.push(r));
      await vi.advanceTimersByTimeAsync(0);
      expect(seen).toEqual([true]);
      // Up: the next check is a poll away, not sooner.
      await vi.advanceTimersByTimeAsync(REACHABLE_POLL_MS - 1);
      expect(check).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(seen).toEqual([true, false]);
      // Down once: retry in 1s, then 2s.
      await vi.advanceTimersByTimeAsync(FIRST_RETRY_MS);
      expect(check).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1_999);
      expect(check).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(check).toHaveBeenCalledTimes(4);
      // Back: the failure count resets.
      await vi.advanceTimersByTimeAsync(4_000);
      expect(seen).toEqual([true, false, false, false, true]);
      await vi.advanceTimersByTimeAsync(REACHABLE_POLL_MS);
      expect(check).toHaveBeenCalledTimes(6);
      stop();
    });

    it('stops asking once stopped, even with a check in flight', async () => {
      let resolve!: (v: boolean) => void;
      const check = vi.fn(() => new Promise<boolean>(r => (resolve = r)));
      const seen: boolean[] = [];
      const stop = watchReachable(check, r => seen.push(r));
      stop();
      resolve(true);
      await vi.advanceTimersByTimeAsync(REACHABLE_POLL_MS * 3);
      expect(seen).toEqual([]);
      expect(check).toHaveBeenCalledTimes(1);
    });
  });
});

describe('usePlaces', () => {
  afterEach(() => {
    delete (window as { ganymedePlaces?: unknown }).ganymedePlaces;
  });

  it('follows the list the app sets again, on its ganymede-places event', () => {
    window.ganymedePlaces = [{ id: null, name: 'This Mac' }];
    const { result, unmount } = renderHook(() => usePlaces());
    expect(result.current).toEqual([{ id: null, name: 'This Mac' }]);
    window.ganymedePlaces = [
      { id: null, name: 'This Mac' },
      { id: 'mini-1', name: 'm4mini' },
    ];
    // Not until the app says so.
    expect(result.current).toHaveLength(1);
    act(() => void window.dispatchEvent(new Event('ganymede-places')));
    expect(result.current.map(p => p.name)).toEqual(['This Mac', 'm4mini']);
    const remove = vi.spyOn(window, 'removeEventListener');
    unmount();
    expect(remove).toHaveBeenCalledWith('ganymede-places', expect.any(Function));
    remove.mockRestore();
  });

  it('catches a change made between its first render and its subscribe', () => {
    window.ganymedePlaces = [{ id: null, name: 'This Mac' }];
    let first = true;
    const { result } = renderHook(() => {
      const places = usePlaces();
      if (first) {
        first = false;
        window.ganymedePlaces = [
          { id: null, name: 'This Mac' },
          { id: 'mini-1', name: 'm4mini' },
        ];
      }
      return places;
    });
    expect(result.current.map(p => p.name)).toEqual(['This Mac', 'm4mini']);
  });
});
