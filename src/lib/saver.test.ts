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
