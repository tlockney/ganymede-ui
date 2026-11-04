import { describe, expect, it, vi } from 'vitest';
import type { Contents, Session } from '@jupyterlab/services';
import type { NotebookController } from '../components/NotebookPane';
import { deletePrompt, fileActions, within } from './file-actions';

function contents(existing: string[] = []) {
  return {
    get: vi.fn(async (path: string) => {
      if (!existing.includes(path)) throw new Error('Not found');
      return { path };
    }),
    rename: vi.fn(async () => ({})),
    copy: vi.fn(async () => ({})),
    delete: vi.fn(async () => {}),
    newUntitled: vi.fn(async () => ({ path: 'moons/Untitled Folder' })),
  };
}

const undo = vi.fn();

/** Running sessions at `paths`; each move is recorded as [from, to]. */
function sessions(paths: string[] = []) {
  const moves: [string, string][] = [];
  const disposed: string[] = [];
  return {
    moves,
    disposed,
    running: () =>
      paths.map(path => ({ id: path, path, name: '', type: 'notebook' }))[Symbol.iterator](),
    connectTo: vi.fn(({ model }: { model: { path: string } }) => ({
      setPath: vi.fn(async (to: string) => void moves.push([model.path, to])),
      setName: vi.fn(async () => {}),
      dispose: () => disposed.push(model.path),
    })),
  };
}

function controller(path: string, over: Partial<NotebookController> = {}) {
  return {
    path,
    dirty: false,
    save: vi.fn(async () => true),
    rename: vi.fn(async () => true),
    discard: vi.fn(() => undo),
    moved: vi.fn(async (_next: string, move: () => Promise<unknown>) => void (await move())),
    ...over,
  } as unknown as NotebookController;
}

function setup(
  openPath?: string,
  c?: NotebookController,
  existing?: string[],
  running?: ReturnType<typeof sessions>,
) {
  const fake = contents(existing);
  let open = openPath;
  const setOpenPath = vi.fn((update: (p: string | undefined) => string | undefined) => {
    open = update(open);
  });
  const opened = () => open;
  const actions = fileActions({
    contents: fake as unknown as Contents.IManager,
    sessions: running as unknown as Session.IManager | undefined,
    openPath,
    controller: c,
    setOpenPath,
  });
  return { fake, setOpenPath, opened, actions };
}

const nb = (path: string) => ({ path, name: path.split('/').pop()!, type: 'notebook' as const });
const dir = (path: string) => ({ path, name: path.split('/').pop()!, type: 'directory' as const });
const file = (path: string) => ({ path, name: path.split('/').pop()!, type: 'file' as const });

describe('fileActions', () => {
  it('renames a notebook, adding .ipynb', async () => {
    const { fake, actions } = setup();
    expect(await actions.rename(nb('moons/Io.ipynb'), 'Europa')).toBe(true);
    expect(fake.rename).toHaveBeenCalledWith('moons/Io.ipynb', 'moons/Europa.ipynb');
  });

  it('renames other files and folders as typed', async () => {
    const { fake, actions } = setup();
    await actions.rename(file('notes.txt'), 'notes.md');
    expect(fake.rename).toHaveBeenCalledWith('notes.txt', 'notes.md');
    await actions.rename(dir('moons'), 'satellites');
    expect(fake.rename).toHaveBeenLastCalledWith('moons', 'satellites');
  });

  it('refuses a name that is taken', async () => {
    const { fake, actions } = setup(undefined, undefined, ['Europa.ipynb']);
    await expect(actions.rename(nb('Io.ipynb'), 'Europa')).rejects.toThrow(/already exists/);
    expect(fake.rename).not.toHaveBeenCalled();
  });

  it('renames the open notebook through its controller, which keeps it open', async () => {
    const c = controller('Io.ipynb');
    const { fake, actions } = setup('Io.ipynb', c);
    await actions.rename(nb('Io.ipynb'), 'Europa');
    expect(c.rename).toHaveBeenCalledWith('Europa', { throws: true });
    expect(fake.rename).not.toHaveBeenCalled();
  });

  it('says in the sidebar why the open notebook’s own rename failed', async () => {
    // The pane shows it too; on a phone, under the sidebar.
    const c = controller('Io.ipynb', {
      rename: vi.fn(async (_input: string, options?: { throws?: boolean }) => {
        if (options?.throws) throw new Error('“Europa.ipynb” already exists.');
        return false;
      }),
    });
    const { actions } = setup('Io.ipynb', c);
    await expect(actions.rename(nb('Io.ipynb'), 'Europa')).rejects.toThrow(/already exists/);
  });

  it('moves the session of a notebook that isn’t open with it', async () => {
    const running = sessions(['moons/Io.ipynb', 'moons/Europa.ipynb']);
    const { actions } = setup(undefined, undefined, [], running);
    await actions.rename(nb('moons/Io.ipynb'), 'Ganymede');
    expect(running.moves).toEqual([['moons/Io.ipynb', 'moons/Ganymede.ipynb']]);
    expect(running.disposed).toEqual(['moons/Io.ipynb']);
  });

  it('moves the sessions in a folder, but the open notebook’s through its pane', async () => {
    const running = sessions(['moons/Io.ipynb', 'moons/inner/Europa.ipynb', 'Callisto.ipynb']);
    const c = controller('moons/Io.ipynb');
    const { actions } = setup('moons/Io.ipynb', c, [], running);
    await actions.rename(dir('moons'), 'satellites');
    expect(c.moved).toHaveBeenCalledWith('satellites/Io.ipynb', expect.any(Function));
    expect(running.moves).toEqual([['moons/inner/Europa.ipynb', 'satellites/inner/Europa.ipynb']]);
  });

  it('moves no session when the rename fails', async () => {
    const running = sessions(['Io.ipynb']);
    const { actions } = setup(undefined, undefined, ['Europa.ipynb'], running);
    await expect(actions.rename(nb('Io.ipynb'), 'Europa')).rejects.toThrow(/already exists/);
    expect(running.connectTo).not.toHaveBeenCalled();
  });

  it('saves the open notebook before moving its folder, and follows it', async () => {
    const c = controller('moons/Io.ipynb', { dirty: true });
    const { fake, setOpenPath, opened, actions } = setup('moons/Io.ipynb', c);
    await actions.rename(dir('moons'), 'satellites');
    expect(c.save).toHaveBeenCalled();
    expect(fake.rename).toHaveBeenCalledWith('moons', 'satellites');
    // Its later edits and its kernel go to the new path before it reopens.
    expect(c.moved).toHaveBeenCalledWith('satellites/Io.ipynb', expect.any(Function));
    expect(opened()).toBe('satellites/Io.ipynb');
    expect(vi.mocked(c.moved).mock.invocationCallOrder[0]).toBeLessThan(
      setOpenPath.mock.invocationCallOrder[0],
    );
  });

  it('leaves another notebook open if one was opened while the folder moved', async () => {
    let finish!: () => void;
    const c = controller('moons/Io.ipynb', {
      moved: vi.fn(async (_next: string, move: () => Promise<unknown>) => {
        await move();
        await new Promise<void>(r => (finish = r));
      }),
    });
    const { setOpenPath, opened, actions } = setup('moons/Io.ipynb', c);
    const renaming = actions.rename(dir('moons'), 'satellites');
    await vi.waitFor(() => expect(finish).toBeDefined());
    // The rename field committed on blur: a click on Europa.
    setOpenPath(() => 'Europa.ipynb');
    finish();
    await renaming;
    expect(opened()).toBe('Europa.ipynb');
  });

  it('won’t move a folder whose open notebook is still loading', async () => {
    // The controller reported is the last notebook's, not the one opening.
    const { fake, setOpenPath, actions } = setup('moons/Io.ipynb', controller('Europa.ipynb'));
    await expect(actions.rename(dir('moons'), 'satellites')).rejects.toThrow(/still loading/);
    expect(fake.rename).not.toHaveBeenCalled();
    expect(setOpenPath).not.toHaveBeenCalled();
  });

  it('won’t rename or delete the open notebook while it is still loading', async () => {
    const { fake, actions } = setup('moons/Io.ipynb', controller('Europa.ipynb'));
    await expect(actions.rename(nb('moons/Io.ipynb'), 'Ganymede')).rejects.toThrow(/still loading/);
    await expect(actions.remove(nb('moons/Io.ipynb'))).rejects.toThrow(/still loading/);
    expect(fake.rename).not.toHaveBeenCalled();
    expect(fake.delete).not.toHaveBeenCalled();
  });

  it('saves the open notebook before duplicating it', async () => {
    const c = controller('moons/Io.ipynb', { dirty: true });
    const { fake, actions } = setup('moons/Io.ipynb', c);
    await actions.duplicate(nb('moons/Io.ipynb'));
    expect(c.save).toHaveBeenCalled();
    expect(vi.mocked(c.save).mock.invocationCallOrder[0]).toBeLessThan(
      fake.copy.mock.invocationCallOrder[0]!,
    );
  });

  it('won’t move a folder whose open notebook didn’t save', async () => {
    const c = controller('moons/Io.ipynb', { dirty: true, save: vi.fn(async () => false) });
    const { fake, actions } = setup('moons/Io.ipynb', c);
    await expect(actions.rename(dir('moons'), 'satellites')).rejects.toThrow(/couldn’t be saved/);
    expect(fake.rename).not.toHaveBeenCalled();
  });

  it('duplicates beside the file', async () => {
    const { fake, actions } = setup();
    await actions.duplicate(nb('moons/Io.ipynb'));
    expect(fake.copy).toHaveBeenCalledWith('moons/Io.ipynb', 'moons');
  });

  it('closes the open notebook, unsaved, before deleting it or its folder', async () => {
    const c = controller('moons/Io.ipynb', { dirty: true });
    const { fake, setOpenPath, opened, actions } = setup('moons/Io.ipynb', c);
    await actions.remove(nb('Europa.ipynb'));
    expect(setOpenPath).not.toHaveBeenCalled();
    await actions.remove(dir('moons'));
    expect(c.discard).toHaveBeenCalled();
    expect(c.save).not.toHaveBeenCalled();
    expect(opened()).toBeUndefined();
    expect(fake.delete).toHaveBeenLastCalledWith('moons');
  });

  it('leaves another notebook open if one was opened while the delete ran', async () => {
    let finish!: () => void;
    const c = controller('moons/Io.ipynb');
    const { fake, setOpenPath, opened, actions } = setup('moons/Io.ipynb', c);
    fake.delete.mockImplementationOnce(() => new Promise<void>(r => (finish = r)));
    const removing = actions.remove(dir('moons'));
    await vi.waitFor(() => expect(finish).toBeDefined());
    setOpenPath(() => 'Europa.ipynb');
    finish();
    await removing;
    expect(opened()).toBe('Europa.ipynb');
  });

  it('keeps the open notebook, and saving, when the delete fails', async () => {
    undo.mockClear();
    const c = controller('moons/Io.ipynb', { dirty: true });
    const { fake, setOpenPath, actions } = setup('moons/Io.ipynb', c);
    fake.delete.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(actions.remove(dir('moons'))).rejects.toThrow('Forbidden');
    expect(c.discard).toHaveBeenCalled();
    expect(undo).toHaveBeenCalled();
    expect(setOpenPath).not.toHaveBeenCalled();
  });

  it('makes an untitled folder', async () => {
    const { fake, actions } = setup();
    expect(await actions.newFolder('moons')).toBe('moons/Untitled Folder');
    expect(fake.newUntitled).toHaveBeenCalledWith({ type: 'directory', path: 'moons' });
  });
});

describe('within', () => {
  it('matches the path and what is inside it', () => {
    expect(within('moons/Io.ipynb', 'moons')).toBe(true);
    expect(within('moons', 'moons')).toBe(true);
    expect(within('moonshine/Io.ipynb', 'moons')).toBe(false);
    expect(within(undefined, 'moons')).toBe(false);
  });
});

describe('deletePrompt', () => {
  it('names what goes', () => {
    expect(deletePrompt(nb('Io.ipynb'))).toMatch(/^Delete “Io”\?/);
    expect(deletePrompt(dir('moons'))).toMatch(/^Delete the folder “moons” and everything in it\?/);
  });
});
