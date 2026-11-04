import type { Session } from '@jupyterlab/services';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canOpenFiles,
  exposeHooks,
  nativeChrome,
  openFile,
  postDocument,
  fileMove,
  pageSearch,
  postState,
  runningSessions,
  searchRequest,
} from './native';

afterEach(() => vi.unstubAllGlobals());

describe('native', () => {
  it('posts to the app’s document handler, and does nothing in a browser', () => {
    postDocument({ path: 'a.ipynb', dirty: false });
    const postMessage = vi.fn();
    vi.stubGlobal('webkit', { messageHandlers: { document: { postMessage } } });
    postDocument({ path: 'moons/Io.ipynb', dirty: true });
    expect(postMessage).toHaveBeenCalledWith({ path: 'moons/Io.ipynb', dirty: true });
  });

  it('opens files in the app’s editor only when the app has one', () => {
    expect(canOpenFiles()).toBe(false);
    openFile('notes.txt');
    const postMessage = vi.fn();
    vi.stubGlobal('webkit', { messageHandlers: { openFile: { postMessage } } });
    expect(canOpenFiles()).toBe(true);
    openFile('moons/Io.md');
    expect(postMessage).toHaveBeenCalledWith({ path: 'moons/Io.md' });
  });

  it('exposes the hooks until they are taken back', async () => {
    const save = vi.fn(async () => true);
    const remove = exposeHooks({ save, command: async () => false });
    expect(await window.ganymede!.save()).toBe(true);
    remove();
    expect(window.ganymede).toBeUndefined();
  });

  it('posts the page state to the app’s state handler', () => {
    const state = {
      path: 'Io.ipynb',
      dirty: true,
      status: 'idle',
      kernel: 'cdp',
      kernelDisplayName: 'TypeScript',
      kernelMissing: false,
      trusted: true,
      cellType: 'code',
      kernels: [{ name: 'cdp', displayName: 'TypeScript' }],
      backend: { label: 'Ganymede', detail: 'local server' },
      running: [{ id: 's1', path: 'Io.ipynb', kernel: 'TypeScript', state: 'idle' }],
      recents: ['Io.ipynb'],
      search: null,
    };
    postState(state);
    const postMessage = vi.fn();
    vi.stubGlobal('webkit', { messageHandlers: { state: { postMessage } } });
    postState(state);
    expect(postMessage).toHaveBeenCalledWith(state);
  });

  it('lists running sessions by display name, with the kernel’s state', () => {
    const specs = {
      default: 'cdp',
      kernelspecs: {
        cdp: { name: 'cdp', display_name: 'TypeScript', language: 'ts', argv: [], resources: {} },
      },
    };
    const sessions = [
      {
        id: 's1',
        path: 'Io.ipynb',
        name: '',
        type: 'notebook',
        kernel: { id: 'k1', name: 'cdp', execution_state: 'busy' },
      },
      {
        id: 's2',
        path: 'moons/Europa.ipynb',
        name: '',
        type: 'notebook',
        kernel: { id: 'k2', name: 'gone' },
      },
      { id: 's3', path: 'Ganymede.ipynb', name: '', type: 'notebook', kernel: null },
    ] as unknown as Session.IModel[];
    expect(runningSessions(sessions, specs)).toEqual([
      { id: 's1', path: 'Io.ipynb', kernel: 'TypeScript', state: 'busy' },
      { id: 's2', path: 'moons/Europa.ipynb', kernel: 'gone', state: null },
      { id: 's3', path: 'Ganymede.ipynb', kernel: null, state: null },
    ]);
  });

  it('reads chrome=native from the URL', () => {
    expect(nativeChrome('?chrome=native&open=a.ipynb')).toBe(true);
    expect(nativeChrome('?chrome=web')).toBe(false);
    expect(nativeChrome('')).toBe(false);
  });

  it('reads the app’s search requests (#240)', () => {
    expect(searchRequest(JSON.stringify({ query: 'io', dir: '/moons/', contents: true }))).toEqual({
      query: 'io',
      dir: 'moons',
      contents: true,
    });
    expect(searchRequest(JSON.stringify({ query: '' }))).toEqual({
      query: '',
      dir: '',
      contents: false,
    });
    expect(searchRequest('io')).toBeNull();
    expect(searchRequest(JSON.stringify({ dir: 'x' }))).toBeNull();
    expect(searchRequest(undefined)).toBeNull();
  });

  it('turns search results into page state (#240)', () => {
    const item = { path: 'moons/Io.ipynb', name: 'Io.ipynb', type: 'notebook' };
    expect(
      pageSearch('  ', { matches: [{ item }], searching: false, truncated: false }),
    ).toBeNull();
    expect(
      pageSearch('io', {
        matches: [{ item }, { item, snippet: 'io = 1' }],
        searching: true,
        truncated: true,
      }),
    ).toEqual({
      query: 'io',
      matches: [
        { ...item, snippet: null },
        { ...item, snippet: 'io = 1' },
      ],
      searching: true,
      truncated: true,
      error: null,
      opensFiles: false,
    });
    expect(
      pageSearch('io', { matches: [], searching: false, truncated: false }, true)?.opensFiles,
    ).toBe(true);
  });

  it('reads the files the app moved or deleted itself (#240)', () => {
    expect(fileMove(JSON.stringify({ from: 'Io.ipynb', to: 'moons/Io.ipynb' }))).toEqual({
      from: 'Io.ipynb',
      to: 'moons/Io.ipynb',
    });
    expect(fileMove(JSON.stringify({ from: 'moons', to: null }))).toEqual({
      from: 'moons',
      to: null,
    });
    expect(fileMove(JSON.stringify({ from: '', to: null }))).toBeNull();
    expect(fileMove(JSON.stringify({ from: 'a' }))).toBeNull();
    expect(fileMove(JSON.stringify({ from: 'a', to: '' }))).toBeNull();
    expect(fileMove('a')).toBeNull();
    expect(fileMove(undefined)).toBeNull();
  });
});
