import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import {
  MAX_RECENTS,
  addRecent,
  clearRecents,
  forgetRecent,
  loadRecents,
  moveRecent,
  onRecentsChange,
  recentsKey,
  resetChecked,
  useRecents,
} from './recents';

const KEY = 'ganymede:';

beforeEach(() => {
  localStorage.clear();
  resetChecked();
});

describe('recents', () => {
  it('keeps notebooks newest first, once each, up to the cap', () => {
    addRecent(KEY, 'a.ipynb');
    addRecent(KEY, 'b.ipynb');
    addRecent(KEY, 'a.ipynb');
    expect(loadRecents(KEY)).toEqual(['a.ipynb', 'b.ipynb']);
    for (let i = 0; i < MAX_RECENTS + 3; i++) addRecent(KEY, `n${i}.ipynb`);
    const list = loadRecents(KEY);
    expect(list).toHaveLength(MAX_RECENTS);
    expect(list[0]).toBe(`n${MAX_RECENTS + 2}.ipynb`);
    expect(list).not.toContain('a.ipynb');
  });

  it('keeps each backend’s list apart', () => {
    const browser = recentsKey({ kind: 'browser' });
    const server = recentsKey({ kind: 'ganymede', url: 'http://h:8888', token: 't' });
    // The token and where kernels run don't change which files these are.
    expect(
      recentsKey({ kind: 'ganymede', url: 'http://h:8888', token: 'u', kernels: 'page' }),
    ).toBe(server);
    // Nor does a trailing slash, which connect() strips too.
    expect(recentsKey({ kind: 'ganymede', url: 'http://h:8888/', token: 't' })).toBe(server);
    addRecent(browser, 'x.ipynb');
    addRecent(server, 'y.ipynb');
    expect(loadRecents(browser)).toEqual(['x.ipynb']);
    expect(loadRecents(server)).toEqual(['y.ipynb']);
    clearRecents(server);
    expect(loadRecents(server)).toEqual([]);
    expect(loadRecents(browser)).toEqual(['x.ipynb']);
  });

  it('follows a rename of a notebook or its folder, and forgets a deleted one', () => {
    addRecent(KEY, 'moons/Io.ipynb');
    addRecent(KEY, 'moons/inner/Europa.ipynb');
    addRecent(KEY, 'moonshine.ipynb');
    moveRecent(KEY, 'moons', 'satellites');
    expect(loadRecents(KEY)).toEqual([
      'moonshine.ipynb',
      'satellites/inner/Europa.ipynb',
      'satellites/Io.ipynb',
    ]);
    moveRecent(KEY, 'moonshine.ipynb', 'sunshine.ipynb');
    expect(loadRecents(KEY)[0]).toBe('sunshine.ipynb');
    forgetRecent(KEY, 'satellites/inner');
    expect(loadRecents(KEY)).toEqual(['sunshine.ipynb', 'satellites/Io.ipynb']);
  });

  it('survives bad or unavailable storage', () => {
    localStorage.setItem('ganymede-ui:recents', '{not json');
    expect(loadRecents(KEY)).toEqual([]);
    localStorage.setItem('ganymede-ui:recents', JSON.stringify({ [KEY]: ['a', 3, null] }));
    expect(loadRecents(KEY)).toEqual(['a']);
    localStorage.setItem('ganymede-ui:recents', '[1,2]');
    expect(loadRecents(KEY)).toEqual([]);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => addRecent(KEY, 'b.ipynb')).not.toThrow();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(loadRecents(KEY)).toEqual([]);
  });

  it('tells listeners about changes', () => {
    const listener = vi.fn();
    const stop = onRecentsChange(listener);
    addRecent(KEY, 'a.ipynb');
    addRecent(KEY, 'a.ipynb'); // no change
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new StorageEvent('storage', { key: 'ganymede-ui:recents' }));
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
    addRecent(KEY, 'b.ipynb');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('useRecents', () => {
  const tree = {
    '': [
      { name: 'Saturn.ipynb', type: 'notebook' as const },
      { name: 'Jupiter.ipynb', type: 'notebook' as const },
      { name: 'moons', type: 'directory' as const },
    ],
    moons: [{ name: 'Io.ipynb', type: 'notebook' as const }],
  };

  it('records the open notebook and follows renames and deletes', async () => {
    const fake = fakeServices(structuredClone(tree));
    const backend = fakeBackend(fake.services);
    const key = recentsKey(backend.config);
    const { result, rerender } = renderHook(({ open }) => useRecents(backend, open), {
      initialProps: { open: 'Saturn.ipynb' as string | undefined },
    });
    expect(result.current).toEqual(['Saturn.ipynb']);
    rerender({ open: 'moons/Io.ipynb' });
    expect(result.current).toEqual(['moons/Io.ipynb', 'Saturn.ipynb']);
    rerender({ open: undefined });
    expect(loadRecents(key)).toEqual(['moons/Io.ipynb', 'Saturn.ipynb']);

    act(() =>
      fake.contents.fileChanged.emit({
        type: 'rename',
        oldValue: { path: 'moons' },
        newValue: { path: 'satellites' },
      }),
    );
    expect(result.current).toEqual(['satellites/Io.ipynb', 'Saturn.ipynb']);
    act(() =>
      fake.contents.fileChanged.emit({
        type: 'delete',
        oldValue: { path: 'Saturn.ipynb' },
        newValue: null,
      }),
    );
    expect(result.current).toEqual(['satellites/Io.ipynb']);
  });

  it('drops a notebook that is gone, and keeps one it couldn’t check', async () => {
    const fake = fakeServices(structuredClone(tree));
    const backend = fakeBackend(fake.services);
    const key = recentsKey(backend.config);
    addRecent(key, 'Jupiter.ipynb');
    addRecent(key, 'Gone.ipynb');
    addRecent(key, 'Offline.ipynb');
    const get = fake.contents.get.getMockImplementation()!;
    fake.contents.get.mockImplementation(async (path: string) => {
      if (path === 'Offline.ipynb') throw new TypeError('Failed to fetch');
      return get(path);
    });
    const { result } = renderHook(() => useRecents(backend, undefined));
    await waitFor(() => expect(result.current).toEqual(['Offline.ipynb', 'Jupiter.ipynb']));
    expect(fake.contents.get).toHaveBeenCalledWith('Gone.ipynb', { content: false });
  });

  it('shows nothing without a backend', () => {
    addRecent(KEY, 'a.ipynb');
    const { result } = renderHook(() => useRecents(undefined, 'a.ipynb'));
    expect(result.current).toEqual([]);
  });
});
