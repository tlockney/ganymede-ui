import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Contents } from '@jupyterlab/services';
import { fakeServices } from '../test/fakes';
import {
  Cancelled,
  LIMITS,
  cellSources,
  findSnippet,
  listTree,
  matchNames,
  searchContents,
  useFileSearch,
} from './search';

const nb = (...sources: (string | string[])[]) => ({
  cells: sources.map(source => ({ cell_type: 'code', source, metadata: {}, outputs: [] })),
  metadata: {},
  nbformat: 4,
  nbformat_minor: 5,
});

const TREE = {
  '': [
    { name: 'Saturn.ipynb', type: 'notebook' as const, content: nb('titan = 1') },
    { name: 'moons', type: 'directory' as const },
    { name: '.secret', type: 'directory' as const },
    { name: 'notes.txt', type: 'file' as const },
  ],
  moons: [
    {
      name: 'Io.ipynb',
      type: 'notebook' as const,
      content: nb(['import volcano\n', 'volcano.erupt()']),
      last_modified: '1',
    },
    { name: 'inner', type: 'directory' as const },
  ],
  'moons/inner': [
    { name: 'Europa.ipynb', type: 'notebook' as const, content: nb('# Ice'), last_modified: '1' },
    { name: 'deep', type: 'directory' as const },
  ],
  'moons/inner/deep': [{ name: 'Callisto.ipynb', type: 'notebook' as const }],
  '.secret': [{ name: 'Hidden.ipynb', type: 'notebook' as const }],
};

const contentsOf = (tree = TREE) => {
  const fake = fakeServices(structuredClone(tree));
  return { fake, contents: fake.services.contents as Contents.IManager };
};

const paths = (items: { path: string }[]) => items.map(i => i.path).sort();

describe('listTree', () => {
  it('lists a folder and its subfolders, without hidden ones', async () => {
    const { contents } = contentsOf();
    const { items, truncated } = await listTree(contents, '');
    expect(paths(items)).toEqual([
      'Saturn.ipynb',
      'moons',
      'moons/Io.ipynb',
      'moons/inner',
      'moons/inner/Europa.ipynb',
      'moons/inner/deep',
      'moons/inner/deep/Callisto.ipynb',
      'notes.txt',
    ]);
    expect(truncated).toBe(false);
  });

  it('starts in the folder given', async () => {
    const { contents } = contentsOf();
    const { items } = await listTree(contents, 'moons/inner');
    expect(paths(items)).toEqual([
      'moons/inner/Europa.ipynb',
      'moons/inner/deep',
      'moons/inner/deep/Callisto.ipynb',
    ]);
  });

  it('stops at the depth, folder and entry limits, and says so', async () => {
    const { contents } = contentsOf();
    const shallow = await listTree(contents, '', { limits: { ...LIMITS, depth: 1 } });
    // One level of subfolders.
    expect(paths(shallow.items)).toContain('moons/Io.ipynb');
    expect(paths(shallow.items)).not.toContain('moons/inner/Europa.ipynb');
    expect(shallow.truncated).toBe(true);

    const few = await listTree(contents, '', { limits: { ...LIMITS, dirs: 2 } });
    expect(paths(few.items)).not.toContain('moons/inner/Europa.ipynb');
    expect(few.truncated).toBe(true);

    const small = await listTree(contents, '', { limits: { ...LIMITS, entries: 3 } });
    expect(small.items).toHaveLength(3);
    expect(small.truncated).toBe(true);
  });

  it('skips a subfolder it can’t list, but not the folder searched', async () => {
    const { contents, fake } = contentsOf();
    const get = fake.contents.get.getMockImplementation()!;
    fake.contents.get.mockImplementation(async (path: string) => {
      if (path === 'moons/inner') throw new Error('Permission denied');
      return get(path);
    });
    const { items } = await listTree(contents, '');
    expect(paths(items)).toContain('moons/Io.ipynb');
    expect(paths(items)).not.toContain('moons/inner/Europa.ipynb');
    await expect(listTree(contents, 'nowhere')).rejects.toThrow(/No such directory/);
  });

  it('stops when cancelled', async () => {
    const { contents } = contentsOf();
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(listTree(contents, '', { signal: ctrl.signal })).rejects.toBeInstanceOf(Cancelled);
  });
});

describe('matching', () => {
  const items = [
    { path: 'Saturn.ipynb', name: 'Saturn.ipynb', type: 'notebook' as const },
    { path: 'moons/Io.ipynb', name: 'Io.ipynb', type: 'notebook' as const },
    { path: 'moons', name: 'moons', type: 'directory' as const },
    { path: 'notes.txt', name: 'notes.txt', type: 'file' as const },
  ];

  it('matches names ignoring case, and notebooks without .ipynb', () => {
    expect(paths(matchNames(items, 'SAT').map(m => m.item))).toEqual(['Saturn.ipynb']);
    expect(paths(matchNames(items, ' o ').map(m => m.item))).toEqual([
      'moons',
      'moons/Io.ipynb',
      'notes.txt',
    ]);
    expect(matchNames(items, 'ipynb')).toEqual([]);
    expect(matchNames(items, '.txt').map(m => m.item.path)).toEqual(['notes.txt']);
    expect(matchNames(items, '   ')).toEqual([]);
  });

  it('reads cell sources in either form', () => {
    expect(cellSources(nb('a', ['b\n', 'c']))).toEqual(['a', 'b\nc']);
    expect(cellSources(null)).toEqual([]);
    expect(cellSources({ cells: 'nope' })).toEqual([]);
  });

  it('finds the line that matches, shortened around the match', () => {
    expect(findSnippet(['x = 1\n  Volcano.erupt()  \n'], 'volcano')).toBe('Volcano.erupt()');
    expect(findSnippet(['nothing here'], 'volcano')).toBeUndefined();
    const long = `${'a'.repeat(100)} needle ${'b'.repeat(100)}`;
    const snippet = findSnippet([long], 'needle', 40)!;
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThanOrEqual(42);
  });
});

describe('searchContents', () => {
  it('finds notebooks whose cells contain the query, and reuses unchanged ones', async () => {
    const { contents, fake } = contentsOf();
    const { items } = await listTree(contents, '');
    fake.contents.get.mockClear();
    const cache = new Map();
    const onMatch = vi.fn();
    const found = await searchContents(contents, items, 'VOLCANO', { cache, onMatch });
    expect(found.matches.map(m => [m.item.path, m.snippet])).toEqual([
      ['moons/Io.ipynb', 'import volcano'],
    ]);
    expect(onMatch).toHaveBeenCalledTimes(1);
    // Only notebooks are fetched.
    expect(fake.contents.get).toHaveBeenCalledTimes(4);
    expect(fake.contents.get).toHaveBeenCalledWith('moons/Io.ipynb', {
      content: true,
      type: 'notebook',
    });

    // Unchanged notebooks come from the cache; one without a modified time is fetched again.
    fake.contents.get.mockClear();
    const again = await searchContents(contents, items, 'ice', { cache });
    expect(again.matches.map(m => m.item.path)).toEqual(['moons/inner/Europa.ipynb']);
    expect(fake.contents.get.mock.calls.map(c => c[0]).sort()).toEqual([
      'Saturn.ipynb',
      'moons/inner/deep/Callisto.ipynb',
    ]);
  });

  it('fetches at most the notebook limit', async () => {
    const { contents } = contentsOf();
    const { items } = await listTree(contents, '');
    const found = await searchContents(contents, items, 'titan', {
      limits: { ...LIMITS, notebooks: 1 },
    });
    expect(found.truncated).toBe(true);
  });
});

describe('useFileSearch', () => {
  it('waits for typing to pause, and lists the folder once', async () => {
    const { contents, fake } = contentsOf();
    const { result, rerender } = renderHook(({ q }) => useFileSearch(contents, '', q, false), {
      initialProps: { q: 's' },
    });
    rerender({ q: 'sa' });
    rerender({ q: 'sat' });
    expect(result.current.searching).toBe(true);
    await waitFor(() => expect(result.current.searching).toBe(false));
    expect(result.current.matches.map(m => m.item.path)).toEqual(['Saturn.ipynb']);
    // One walk of four folders, for the last query only.
    expect(fake.contents.get).toHaveBeenCalledTimes(4);

    rerender({ q: 'io' });
    await waitFor(() =>
      expect(result.current.matches.map(m => m.item.path)).toEqual(['moons/Io.ipynb']),
    );
    expect(fake.contents.get).toHaveBeenCalledTimes(4);

    // A change on disk lists again.
    act(() =>
      fake.contents.fileChanged.emit({ type: 'new', oldValue: null, newValue: { path: 'x' } }),
    );
    rerender({ q: 'europa' });
    await waitFor(() =>
      expect(result.current.matches.map(m => m.item.path)).toEqual(['moons/inner/Europa.ipynb']),
    );
    expect(fake.contents.get).toHaveBeenCalledTimes(8);

    rerender({ q: '' });
    expect(result.current.matches).toEqual([]);
  });

  it('searches again after a rename or delete, but not after a save', async () => {
    const { contents, fake } = contentsOf();
    const { result } = renderHook(() => useFileSearch(contents, '', 'sat', false));
    await waitFor(() =>
      expect(result.current.matches.map(m => m.item.path)).toEqual(['Saturn.ipynb']),
    );
    expect(fake.contents.get).toHaveBeenCalledTimes(4);

    // A save leaves the tree as it is.
    act(() =>
      fake.contents.fileChanged.emit({
        type: 'save',
        oldValue: null,
        newValue: { path: 'Saturn.ipynb' },
      }),
    );
    await new Promise(r => setTimeout(r, 400));
    expect(fake.contents.get).toHaveBeenCalledTimes(4);

    // A delete re-runs the same query on a fresh listing.
    act(() =>
      fake.contents.fileChanged.emit({
        type: 'delete',
        oldValue: { path: 'Saturn.ipynb' },
        newValue: null,
      }),
    );
    await waitFor(() => expect(fake.contents.get).toHaveBeenCalledTimes(8));
  });

  it('does not show the last query’s matches while the next one runs', async () => {
    const { contents } = contentsOf();
    const { result, rerender } = renderHook(({ q }) => useFileSearch(contents, '', q, false), {
      initialProps: { q: 'sat' },
    });
    await waitFor(() => expect(result.current.matches).toHaveLength(1));
    rerender({ q: 'satx' });
    expect(result.current.searching).toBe(true);
    expect(result.current.matches).toEqual([]);
  });

  it('drops a stale content search when the query changes', async () => {
    const { contents, fake } = contentsOf();
    const get = fake.contents.get.getMockImplementation()!;
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    fake.contents.get.mockImplementation(async (path: string) => {
      if (path === 'moons/Io.ipynb') await held;
      return get(path);
    });
    const { result, rerender } = renderHook(({ q }) => useFileSearch(contents, '', q, true), {
      initialProps: { q: 'volcano' },
    });
    // The content search is under way, waiting for Io.
    await waitFor(() =>
      expect(fake.contents.get).toHaveBeenCalledWith('moons/Io.ipynb', expect.anything()),
    );
    rerender({ q: 'ice' });
    await waitFor(() =>
      expect(result.current.matches.map(m => m.item.path)).toEqual(['moons/inner/Europa.ipynb']),
    );
    // The old search's match in Io comes after the new results show, and is dropped.
    await act(async () => {
      release();
      await new Promise(r => setTimeout(r, 20));
    });
    expect(result.current.matches.map(m => m.snippet)).toEqual(['# Ice']);
    expect(result.current.searching).toBe(false);
  });

  it('says when the folder can’t be searched', async () => {
    const { contents } = contentsOf();
    const { result } = renderHook(() => useFileSearch(contents, 'nowhere', 'x', false));
    await waitFor(() => expect(result.current.error).toMatch(/No such directory/));
    expect(result.current.searching).toBe(false);
  });
});
