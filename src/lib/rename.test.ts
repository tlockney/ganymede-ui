import { describe, expect, it, vi } from 'vitest';
import type { Contents } from '@jupyterlab/services';
import { renameFile, renamedPath, titleName } from './rename';

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

  it('gives the title without .ipynb', () => {
    expect(titleName('moons/Io.ipynb')).toBe('Io');
  });
});

describe('renameFile', () => {
  function contents(existing: string[]) {
    return {
      get: vi.fn(async (path: string) => {
        if (!existing.includes(path)) throw new Error('Not found');
        return { path };
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

  it('lets a change of case through', async () => {
    // On a case-insensitive disk, `io.ipynb` is found: it is this file.
    const c = contents(['Io.ipynb', 'io.ipynb']);
    await renameFile(c as unknown as Contents.IManager, 'Io.ipynb', 'io.ipynb');
    expect(c.rename).toHaveBeenCalled();
  });
});
