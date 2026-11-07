import { afterEach, describe, expect, it, vi } from 'vitest';
import { UNSAVED_RELOAD, guardReload, reloadPage } from './reload';
import { handOff } from './rename';

const undo: (() => void)[] = [];
afterEach(() => undo.splice(0).forEach(f => f()));

describe('reloadPage (#375)', () => {
  it('saves every guarded notebook, then reloads without asking', async () => {
    const save = vi.fn(async () => true);
    undo.push(
      guardReload(() => save()),
      guardReload(() => save()),
    );
    const reload = vi.fn();
    const ask = vi.fn(() => false);
    expect(await reloadPage(reload, ask)).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(ask).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('asks when a notebook stays unsaved, and keeps the page on No', async () => {
    undo.push(
      guardReload(async () => true),
      guardReload(async () => {
        throw new Error('disk full');
      }),
    );
    const reload = vi.fn();
    const ask = vi.fn(() => false);
    expect(await reloadPage(reload, ask)).toBe(false);
    expect(ask).toHaveBeenCalledWith(UNSAVED_RELOAD);
    expect(reload).not.toHaveBeenCalled();
    expect(await reloadPage(reload, () => true)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('forgets a guard once it is removed', async () => {
    const save = vi.fn(async () => false);
    guardReload(save)();
    const reload = vi.fn();
    expect(await reloadPage(reload, () => false)).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});

describe('reloadPage and a closed notebook’s last save (#375)', () => {
  it('waits for the save, and asks with why it failed', async () => {
    let finish!: (why?: string) => void;
    handOff('moons/Io.ipynb', new Promise(r => (finish = r)));
    const reload = vi.fn();
    const ask = vi.fn(() => false);
    const reloading = reloadPage(reload, ask);
    await Promise.resolve();
    expect(reload).not.toHaveBeenCalled();
    finish('Couldn’t save the latest edits to Io.ipynb: Disk full');
    expect(await reloading).toBe(false);
    expect(ask).toHaveBeenCalledWith(
      `Couldn’t save the latest edits to Io.ipynb: Disk full\n\n${UNSAVED_RELOAD}`,
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads without asking once the save is done', async () => {
    handOff('moons/Io.ipynb', Promise.resolve(undefined));
    const reload = vi.fn();
    const ask = vi.fn(() => false);
    expect(await reloadPage(reload, ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();
  });
});
