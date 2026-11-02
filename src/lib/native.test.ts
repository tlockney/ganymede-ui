import { afterEach, describe, expect, it, vi } from 'vitest';
import { canOpenFiles, exposeHooks, openFile, postDocument } from './native';

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
    const remove = exposeHooks({ save });
    expect(await window.ganymede!.save()).toBe(true);
    remove();
    expect(window.ganymede).toBeUndefined();
  });
});
