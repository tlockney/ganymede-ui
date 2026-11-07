import '../test/notebook-env';
import { describe, expect, it, vi } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import { NotebookModel } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import { NotebookSaver, SaveConflict } from './saver';

const LOADED = '2026-10-20T10:00:00.000000Z';

const NOTEBOOK: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    { cell_type: 'code', id: 'a1', source: '1', metadata: {}, outputs: [], execution_count: null },
  ],
};

/** A promise and its resolver, to hold a save in flight. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

function setup(disk = LOADED) {
  const model = new NotebookModel();
  model.fromJSON(structuredClone(NOTEBOOK));
  model.dirty = false;
  const state = { disk };
  const contents = {
    get: vi.fn(async () => ({ last_modified: state.disk })),
    save: vi.fn<(path: string, model: Partial<Contents.IModel>) => Promise<Contents.IModel>>(
      async () => {
        state.disk = new Date(Date.parse(state.disk) + 60_000).toISOString();
        return { last_modified: state.disk } as Contents.IModel;
      },
    ),
  };
  const saver = new NotebookSaver({
    contents: contents as unknown as Contents.IManager,
    path: 'Io.ipynb',
    model,
    lastModified: LOADED,
  });
  const edit = (source: string) => model.cells.get(0).sharedModel.setSource(source);
  return { model, contents, saver, state, edit };
}

describe('NotebookSaver', () => {
  it('saves the model and clears the dirty flag', async () => {
    const { model, contents, saver, edit } = setup();
    edit('2');
    expect(model.dirty).toBe(true);
    await saver.save();
    expect(contents.save).toHaveBeenCalledWith('Io.ipynb', {
      type: 'notebook',
      format: 'json',
      content: expect.objectContaining({ cells: [expect.objectContaining({ source: '2' })] }),
      last_modified: LOADED,
    });
    expect(model.dirty).toBe(false);
  });

  it('holds saves while the file moves, then writes to the new path', async () => {
    const { contents, saver, edit } = setup();
    const move = deferred<{ path: string }>();
    const moving = saver.move(() => move.promise);
    edit('2');
    const saving = saver.save();
    await Promise.resolve();
    expect(contents.save).not.toHaveBeenCalled();
    move.resolve({ path: 'moons/Io.ipynb' });
    await moving;
    await saving;
    expect(contents.save).toHaveBeenCalledOnce();
    expect(contents.save.mock.calls[0]![0]).toBe('moons/Io.ipynb');
  });

  it('takes the moved file’s last_modified, so the next save isn’t a conflict', async () => {
    const { contents, saver, state, edit } = setup();
    // A backend whose rename bumps the file's time.
    state.disk = '2026-10-20T11:00:00.000000Z';
    await saver.move(async () => ({ path: 'moons/Io.ipynb', lastModified: state.disk }));
    edit('2');
    await saver.save();
    expect(contents.save).toHaveBeenCalledOnce();
  });

  it('keeps the path when the move fails', async () => {
    const { contents, saver, edit } = setup();
    await expect(saver.move(async () => Promise.reject(new Error('taken')))).rejects.toThrow(
      'taken',
    );
    edit('2');
    await saver.save();
    expect(contents.save.mock.calls[0]![0]).toBe('Io.ipynb');
  });

  it('keeps the notebook dirty for an edit made during the save', async () => {
    const { model, contents, saver, edit } = setup();
    const write = deferred<Contents.IModel>();
    contents.save.mockReturnValueOnce(write.promise);
    edit('2');
    const saving = saver.save();
    await vi.waitFor(() => expect(contents.save).toHaveBeenCalled());
    edit('3');
    write.resolve({ last_modified: LOADED } as Contents.IModel);
    await saving;
    expect(model.dirty).toBe(true);
  });

  it('runs one save at a time, and skips a queued one with nothing left to save', async () => {
    const { contents, saver, edit } = setup();
    const write = deferred<Contents.IModel>();
    contents.save.mockReturnValueOnce(write.promise);
    edit('2');
    const first = saver.save();
    const second = saver.save();
    await vi.waitFor(() => expect(contents.save).toHaveBeenCalledOnce());
    write.resolve({ last_modified: LOADED } as Contents.IModel);
    await Promise.all([first, second]);
    expect(contents.save).toHaveBeenCalledOnce();
  });

  it('writes a queued save that has edits from during the first', async () => {
    const { contents, saver, edit } = setup();
    const write = deferred<Contents.IModel>();
    contents.save.mockReturnValueOnce(write.promise);
    edit('2');
    const first = saver.save();
    await vi.waitFor(() => expect(contents.save).toHaveBeenCalledOnce());
    edit('3');
    const second = saver.save();
    write.resolve({ last_modified: LOADED } as Contents.IModel);
    await Promise.all([first, second]);
    expect(contents.save).toHaveBeenCalledTimes(2);
    const content = contents.save.mock.calls[1]![1].content as nbformat.INotebookContent;
    expect(content.cells[0]!.source).toBe('3');
  });

  it('sends the last_modified of its own last save next time', async () => {
    const { contents, saver, state, edit } = setup();
    edit('2');
    await saver.save();
    const after = state.disk;
    edit('3');
    await saver.save();
    expect(contents.save.mock.calls[1]![1]).toMatchObject({ last_modified: after });
  });

  it('refuses to save over a file that changed on disk, until told to overwrite', async () => {
    const { model, contents, saver, state, edit } = setup();
    state.disk = '2026-10-20T10:05:00Z';
    edit('2');
    await expect(saver.save()).rejects.toBeInstanceOf(SaveConflict);
    expect(contents.save).not.toHaveBeenCalled();
    expect(model.dirty).toBe(true);

    await saver.save({ overwrite: true });
    expect(contents.save).toHaveBeenCalledOnce();
    expect(contents.save.mock.calls[0]![1]).not.toHaveProperty('last_modified');
    expect(model.dirty).toBe(false);
  });

  it('says whether the file changed on disk, after the save in flight', async () => {
    const { saver, state, edit } = setup();
    expect(await saver.changedOnDisk()).toBeUndefined();
    // Our own save moves the mtime on; the check waits for it and isn't fooled.
    edit('2');
    const saving = saver.save();
    expect(await saver.changedOnDisk()).toBeUndefined();
    await saving;
    state.disk = new Date(Date.parse(state.disk) + 60_000).toISOString();
    expect(await saver.changedOnDisk()).toBe(state.disk);
  });

  it('accepts the version on disk as its base, and still stops at a newer one', async () => {
    const { contents, saver, state, edit } = setup();
    const theirs = '2026-10-20T10:05:00.000Z';
    state.disk = theirs;
    edit('2');
    await expect(saver.save()).rejects.toBeInstanceOf(SaveConflict);
    await saver.accept(theirs);
    expect(await saver.changedOnDisk()).toBeUndefined();
    state.disk = '2026-10-20T10:10:00.000Z';
    expect(await saver.changedOnDisk()).toBe(state.disk);
    // Without a time, it reads the file's.
    await saver.accept();
    await saver.save();
    expect(contents.save).toHaveBeenCalledOnce();
    expect(contents.save.mock.calls[0]![1]).toMatchObject({
      last_modified: '2026-10-20T10:10:00.000Z',
    });
  });

  it('doesn’t call a file it can’t check changed', async () => {
    const { contents, saver } = setup();
    contents.get.mockRejectedValueOnce(new Error('Not found'));
    expect(await saver.changedOnDisk()).toBeUndefined();
  });

  it('allows a file within half a second of its copy, for rounded mtimes', async () => {
    const { contents, saver, state, edit } = setup();
    state.disk = '2026-10-20T10:00:00.400Z';
    edit('2');
    await saver.save();
    expect(contents.save).toHaveBeenCalledOnce();
  });

  it('turns the server’s 409 into a conflict', async () => {
    const { contents, saver, edit } = setup();
    contents.save.mockRejectedValueOnce(
      Object.assign(new Error('changed on disk'), { response: { status: 409 } }),
    );
    edit('2');
    await expect(saver.save()).rejects.toBeInstanceOf(SaveConflict);
  });

  it('passes other failures through, and stays dirty', async () => {
    const { model, contents, saver, edit } = setup();
    contents.save.mockRejectedValueOnce(new Error('Disk full'));
    edit('2');
    await expect(saver.save()).rejects.toThrow('Disk full');
    expect(model.dirty).toBe(true);
    // The queue goes on after a failure.
    await saver.save();
    expect(model.dirty).toBe(false);
  });

  it('saves when the file cannot be checked, as for a deleted file', async () => {
    const { contents, saver, edit } = setup();
    contents.get.mockRejectedValueOnce(new Error('Not found'));
    edit('2');
    await saver.save();
    expect(contents.save).toHaveBeenCalledOnce();
  });

  it('skips a clean notebook when asked to save only if dirty', async () => {
    const { contents, saver } = setup();
    await saver.save({ ifDirty: true });
    expect(contents.save).not.toHaveBeenCalled();
  });
});
