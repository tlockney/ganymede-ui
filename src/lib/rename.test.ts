import { describe, expect, it, vi } from 'vitest';
import type { Contents } from '@jupyterlab/services';
import { handOff, handedOff, renameFile, renamedPath } from './rename';

describe('handOff', () => {
  it('leaves a save for every pane that opens the file until it is done', async () => {
    let finish!: (failed?: string) => void;
    handOff('moons/Io.ipynb', new Promise(r => (finish = r)));
    // Twice, as StrictMode runs the pane's effect.
    const first = handedOff('moons/Io.ipynb');
    expect(first).toBeDefined();
    expect(handedOff('moons/Io.ipynb')).toBe(first);
    expect(handedOff('moons/Europa.ipynb')).toBeUndefined();
    finish('Couldn’t save');
    expect(await first).toBe('Couldn’t save');
    expect(handedOff('moons/Io.ipynb')).toBeUndefined();
  });

  it('waits for every save left at the path, keeping a failure', async () => {
    let finish!: () => void;
    handOff('Io.ipynb', Promise.resolve('Couldn’t save'));
    handOff('Io.ipynb', new Promise<undefined>(r => (finish = () => r(undefined))));
    let settled = false;
    const handed = handedOff('Io.ipynb')!.then(f => ((settled = true), f));
    await new Promise(r => setTimeout(r, 0));
    expect(settled).toBe(false);
    finish();
    expect(await handed).toBe('Couldn’t save');
  });

  it('leaves one save at both paths when a pane closes mid-rename', async () => {
    let finish!: (failed?: string) => void;
    const save = new Promise<string | undefined>(r => (finish = r));
    handOff('Io.ipynb', save);
    handOff('moons/Io.ipynb', save);
    expect(handedOff('Io.ipynb')).toBe(save);
    expect(handedOff('moons/Io.ipynb')).toBe(save);
    finish();
    await save;
    await new Promise(r => setTimeout(r, 0));
    expect(handedOff('Io.ipynb')).toBeUndefined();
    expect(handedOff('moons/Io.ipynb')).toBeUndefined();
  });
});

describe('renamedPath', () => {
  it('renames in the same folder and adds .ipynb', () => {
    expect(renamedPath('moons/Untitled.ipynb', 'Io')).toBe('moons/Io.ipynb');
    expect(renamedPath('Untitled.ipynb', ' Io.ipynb ')).toBe('Io.ipynb');
  });

  it('is undefined for the same name or none', () => {
    expect(renamedPath('moons/Io.ipynb', 'Io')).toBeUndefined();
    expect(renamedPath('moons/Io.ipynb', 'Io.ipynb')).toBeUndefined();
    expect(renamedPath('moons/Io.ipynb', '   ')).toBeUndefined();
  });

  it('refuses names that leave the folder or hide the file', () => {
    expect(() => renamedPath('Io.ipynb', '../Io')).toThrow(/can’t contain/);
    expect(() => renamedPath('Io.ipynb', 'a\\b')).toThrow(/can’t contain/);
    expect(() => renamedPath('Io.ipynb', '.Io')).toThrow(/can’t start with/);
  });
});

describe('renameFile', () => {
  /** Files by path; two paths with the same id are one file (a case-insensitive disk). */
  function contents(existing: string[] | Record<string, string>) {
    const ids = Array.isArray(existing) ? Object.fromEntries(existing.map(p => [p, p])) : existing;
    return {
      get: vi.fn(async (path: string) => {
        const id = ids[path];
        if (!id) throw new Error(`Could not find file with path ${path}`);
        return { path, name: path, created: id, last_modified: id };
      }),
      rename: vi.fn(async () => ({})),
    };
  }

  it('renames through the contents API', async () => {
    const c = contents(['Io.ipynb']);
    await renameFile(c as unknown as Contents.IManager, 'Io.ipynb', 'Europa.ipynb');
    expect(c.rename).toHaveBeenCalledWith('Io.ipynb', 'Europa.ipynb');
  });

  it('refuses to replace a file that is there', async () => {
    const c = contents(['Io.ipynb', 'Europa.ipynb']);
    await expect(
      renameFile(c as unknown as Contents.IManager, 'Io.ipynb', 'Europa.ipynb'),
    ).rejects.toThrow('“Europa.ipynb” already exists. Choose another name.');
    expect(c.rename).not.toHaveBeenCalled();
  });

  it('lets a change of case through when the new name finds this file', async () => {
    // On a case-insensitive disk, `io.ipynb` is found: it is this file.
    const c = contents({ 'Io.ipynb': 'a', 'io.ipynb': 'a' });
    await renameFile(c as unknown as Contents.IManager, 'Io.ipynb', 'io.ipynb');
    expect(c.rename).toHaveBeenCalled();
  });

  it('refuses a change of case onto another file', async () => {
    // Case-sensitive storage (the browser's) can hold both.
    const c = contents({ 'Io.ipynb': 'a', 'io.ipynb': 'b' });
    await expect(
      renameFile(c as unknown as Contents.IManager, 'Io.ipynb', 'io.ipynb'),
    ).rejects.toThrow(/already exists/);
    expect(c.rename).not.toHaveBeenCalled();
  });

  it('stops when it can’t tell whether the name is taken', async () => {
    const c = contents(['Io.ipynb']);
    c.get.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { response: { status: 403 } }),
    );
    await expect(
      renameFile(c as unknown as Contents.IManager, 'Io.ipynb', 'Europa.ipynb'),
    ).rejects.toThrow('Forbidden');
    expect(c.rename).not.toHaveBeenCalled();
  });

  it('takes a 404 as nothing there', async () => {
    const c = contents(['Io.ipynb']);
    c.get.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { status: 404 } }));
    await renameFile(c as unknown as Contents.IManager, 'Io.ipynb', 'Europa.ipynb');
    expect(c.rename).toHaveBeenCalled();
  });
});
