import '../test/notebook-env';
import { describe, expect, it, vi } from 'vitest';
import { NotebookModel } from '@jupyterlab/notebook';
import { ServerConnection } from '@jupyterlab/services';
import { NotebookRoom, RoomSaver, trustFromFile } from './room';

function settingsAnswering(status: number, body: unknown) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  const settings = ServerConnection.makeSettings({
    baseUrl: 'http://127.0.0.1:1/',
    wsUrl: 'ws://127.0.0.1:1/',
    token: 't',
    fetch: fetch as unknown as typeof globalThis.fetch,
  });
  return { settings, fetch };
}

describe('NotebookRoom.join', () => {
  it('asks the server for the file’s room session', async () => {
    const { settings, fetch } = settingsAnswering(404, { message: 'nope' });
    await NotebookRoom.join({ settings, path: 'moons/Io one.ipynb' });
    const [request] = fetch.mock.calls[0] as unknown as [Request];
    // makeRequest adds a cache-busting query.
    expect(request.url.split('?')[0]).toBe(
      'http://127.0.0.1:1/api/collaboration/session/moons/Io%20one.ipynb',
    );
    expect(request.method).toBe('PUT');
    expect(await request.json()).toEqual({ format: 'json', type: 'notebook' });
  });

  it('is undefined when the server has no rooms, so the pane uses the contents API', async () => {
    const { settings } = settingsAnswering(404, { message: 'Not Found' });
    expect(await NotebookRoom.join({ settings, path: 'Io.ipynb' })).toBeUndefined();
  });

  it('is undefined when the answer has no file id', async () => {
    const { settings } = settingsAnswering(200, { format: 'json' });
    expect(await NotebookRoom.join({ settings, path: 'Io.ipynb' })).toBeUndefined();
  });
});

function roomSaver(status: 'success' | 'failed' | 'skipped' = 'success') {
  const model = new NotebookModel();
  const room = { save: vi.fn(async () => status) };
  const beforeSave = vi.fn();
  const saver = new RoomSaver({
    room: room as unknown as NotebookRoom,
    path: 'Io.ipynb',
    model,
    beforeSave,
  });
  return { model, room, saver, beforeSave };
}

describe('RoomSaver', () => {
  it('asks the room to save, with widget state in first', async () => {
    const { room, saver, beforeSave } = roomSaver();
    await saver.save();
    expect(beforeSave).toHaveBeenCalledOnce();
    expect(room.save).toHaveBeenCalledOnce();
  });

  it('skips a clean notebook when asked to save only if dirty', async () => {
    const { room, saver } = roomSaver();
    await saver.save({ ifDirty: true });
    expect(room.save).not.toHaveBeenCalled();
  });

  it('fails when the server says the file won part of the merge', async () => {
    const { saver } = roomSaver('failed');
    await expect(saver.save()).rejects.toThrow('changed on disk at the same time');
  });

  it('never reports a change on disk: the room takes it in', async () => {
    const { saver } = roomSaver();
    expect(saver.live).toBe(true);
    expect(await saver.changedOnDisk()).toBeUndefined();
    expect(await saver.pull()).toBe(false);
  });

  it('follows a move', async () => {
    const { saver } = roomSaver();
    await saver.move(async () => ({ path: 'moons/Io.ipynb' }));
    expect(saver.path).toBe('moons/Io.ipynb');
  });
});

describe('trustFromFile', () => {
  function modelWith(ids: string[]) {
    const model = new NotebookModel();
    model.sharedModel.insertCells(
      0,
      ids.map(id => ({ cell_type: 'code' as const, id, source: '', metadata: {} })),
    );
    return model;
  }
  const contents = (cells: { id: string; trusted?: boolean }[]) =>
    ({
      get: vi.fn(async () => ({
        content: {
          cells: cells.map(c => ({
            cell_type: 'code',
            id: c.id,
            metadata: c.trusted === undefined ? {} : { trusted: c.trusted },
          })),
        },
      })),
    }) as never;

  it('trusts the cells the server marks trusted, by id', async () => {
    const model = modelWith(['a', 'b']);
    await trustFromFile(
      contents([
        { id: 'a', trusted: true },
        { id: 'b', trusted: false },
      ]),
      'Io.ipynb',
      model,
    );
    expect(model.cells.get(0).trusted).toBe(true);
    expect(model.cells.get(1).trusted).toBe(false);
  });

  it('never takes trust away', async () => {
    const model = modelWith(['a']);
    model.cells.get(0).trusted = true;
    await trustFromFile(contents([{ id: 'a', trusted: false }]), 'Io.ipynb', model);
    expect(model.cells.get(0).trusted).toBe(true);
  });
});
