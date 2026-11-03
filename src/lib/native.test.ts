import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canOpenFiles,
  exposeHooks,
  nativeChrome,
  openFile,
  postDocument,
  postState,
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
    };
    postState(state);
    const postMessage = vi.fn();
    vi.stubGlobal('webkit', { messageHandlers: { state: { postMessage } } });
    postState(state);
    expect(postMessage).toHaveBeenCalledWith(state);
  });

  it('reads chrome=native from the URL', () => {
    expect(nativeChrome('?chrome=native&open=a.ipynb')).toBe(true);
    expect(nativeChrome('?chrome=web')).toBe(false);
    expect(nativeChrome('')).toBe(false);
  });
});
