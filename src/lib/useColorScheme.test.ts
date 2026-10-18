import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useColorScheme } from './useColorScheme';

/** A `matchMedia` whose dark-mode answer the test can flip. */
function fakeMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const mq = {
    get matches() {
      return dark;
    },
    media: '(prefers-color-scheme: dark)',
    addEventListener: vi.fn((_: string, l: () => void) => listeners.add(l)),
    removeEventListener: vi.fn((_: string, l: () => void) => listeners.delete(l)),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq),
  );
  return {
    mq,
    listeners,
    set(next: boolean) {
      dark = next;
      listeners.forEach(l => l());
    },
  };
}

describe('useColorScheme', () => {
  it('starts from the system setting', () => {
    fakeMatchMedia(true);
    expect(renderHook(() => useColorScheme()).result.current).toBe('dark');
  });

  it('follows changes and stops listening on unmount', () => {
    const media = fakeMatchMedia(false);
    const { result, unmount } = renderHook(() => useColorScheme());
    expect(result.current).toBe('light');

    act(() => media.set(true));
    expect(result.current).toBe('dark');
    act(() => media.set(false));
    expect(result.current).toBe('light');

    unmount();
    expect(media.listeners.size).toBe(0);
    expect(media.mq.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
