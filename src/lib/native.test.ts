import { afterEach, describe, expect, it, vi } from 'vitest';
import { exposeHooks, postDocument } from './native';

afterEach(() => vi.unstubAllGlobals());

describe('native', () => {
  it('posts to the app’s document handler, and does nothing in a browser', () => {
    postDocument({ path: 'a.ipynb', dirty: false });
    const postMessage = vi.fn();
    vi.stubGlobal('webkit', { messageHandlers: { document: { postMessage } } });
    postDocument({ path: 'moons/Io.ipynb', dirty: true });
    expect(postMessage).toHaveBeenCalledWith({ path: 'moons/Io.ipynb', dirty: true });
  });

  it('exposes the hooks until they are taken back', async () => {
    const save = vi.fn(async () => true);
    const remove = exposeHooks({ save });
    expect(await window.ganymede!.save()).toBe(true);
    remove();
    expect(window.ganymede).toBeUndefined();
  });
});
