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
  pageVariables,
  postState,
  runningSessions,
  searchRequest,
  showAppSettings,
  variablePath,
} from './native';
import { nodeAt, type VariableNode } from './useVariables';

afterEach(() => vi.unstubAllGlobals());

describe('native', () => {
  it('posts to the app’s document handler, and does nothing in a browser', () => {
    postDocument({ path: 'a.ipynb', dirty: false });
    const postMessage = vi.fn();
    vi.stubGlobal('webkit', { messageHandlers: { document: { postMessage } } });
    postDocument({ path: 'moons/Io.ipynb', dirty: true });
    expect(postMessage).toHaveBeenCalledWith({ path: 'moons/Io.ipynb', dirty: true });
  });

  it('asks the app for its Settings at a tab, and says when there is no app (#332)', () => {
    expect(showAppSettings('agent')).toBe(false);
    const postMessage = vi.fn();
    vi.stubGlobal('webkit', { messageHandlers: { settings: { postMessage } } });
    expect(showAppSettings('kernels')).toBe(true);
    expect(postMessage).toHaveBeenCalledWith('kernels');
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
    const remove = exposeHooks({ save, command: async () => false, call: async () => null });
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
      hostGrants: true,
      publish: true,
      accessWanted: [],
      cellType: 'code',
      kernels: [{ name: 'cdp', displayName: 'TypeScript' }],
      backend: { label: 'Ganymede', detail: 'local server' },
      running: [
        {
          id: 's1',
          path: 'Io.ipynb',
          kernel: 'TypeScript',
          state: 'idle',
          kernelId: 'k1',
          memory: null,
        },
      ],
      recents: ['Io.ipynb'],
      search: null,
      outline: [{ level: 1, text: 'Io', cell: 0 }],
      variables: null,
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
      {
        id: 's1',
        path: 'Io.ipynb',
        kernel: 'TypeScript',
        state: 'busy',
        kernelId: 'k1',
        memory: null,
      },
      {
        id: 's2',
        path: 'moons/Europa.ipynb',
        kernel: 'gone',
        state: null,
        kernelId: 'k2',
        memory: null,
      },
      { id: 's3', path: 'Ganymede.ipynb', kernel: null, state: null, kernelId: null, memory: null },
    ]);
    // With the memory the server reported (#241): a kernel without a value has none.
    expect(runningSessions(sessions, specs, new Map([['k1', 2048]])).map(s => s.memory)).toEqual([
      2048,
      null,
      null,
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

  it('flattens the variables for the app’s inspector, expanded rows under their parents', () => {
    const variables: VariableNode[] = [
      {
        name: 'a',
        value: '{…}',
        type: 'object',
        variablesReference: 4,
        path: ['a'],
        children: [
          { name: 'x', value: '1', type: 'number', variablesReference: 0, path: ['a', 'x'] },
        ],
      },
      { name: 'b', value: '[…]', type: 'Array', variablesReference: 5, path: ['b'] },
      { name: 'c', value: '2', type: 'number', variablesReference: 0, path: ['c'] },
    ];
    const open = new Set(['a']);
    const shown = pageVariables({ kind: 'ready', variables }, n => open.has(n.path.join('.')));
    expect(shown.state).toBe('ready');
    expect(shown.message).toBeNull();
    expect(shown.rows.map(r => [r.path.join('.'), r.depth, r.expandable, r.expanded])).toEqual([
      ['a', 0, true, true],
      ['a.x', 1, false, false],
      ['b', 0, true, false],
      ['c', 0, false, false],
    ]);
    // Collapsed, its members stay hidden even when they were read.
    open.clear();
    expect(pageVariables({ kind: 'ready', variables }, () => false).rows).toHaveLength(3);
    expect(pageVariables({ kind: 'error', message: 'gone' }, () => false)).toEqual({
      state: 'error',
      message: 'gone',
      rows: [],
    });
    expect(pageVariables({ kind: 'no-kernel' }, () => false).rows).toEqual([]);
    expect(nodeAt(variables, ['a', 'x'])?.value).toBe('1');
    expect(nodeAt(variables, ['a', 'y'])).toBeUndefined();
    expect(nodeAt(variables, ['z'])).toBeUndefined();
  });

  it('reads a variable’s path from the toggle-variable command', () => {
    expect(variablePath(JSON.stringify(['a', 'x']))).toEqual(['a', 'x']);
    expect(variablePath('[]')).toBeNull();
    expect(variablePath('[1]')).toBeNull();
    expect(variablePath('"a"')).toBeNull();
    expect(variablePath('a')).toBeNull();
    expect(variablePath(undefined)).toBeNull();
  });
});
