import '../test/notebook-env';
import { describe, expect, it, vi } from 'vitest';
import { NotebookModel } from '@jupyterlab/notebook';
import { ServerConnection } from '@jupyterlab/services';
import * as encoding from 'lib0/encoding';
import type { ICodeCellModel } from '@jupyterlab/cells';
import * as Y from 'yjs';
import {
  awarenessUser,
  NotebookRoom,
  RoomSaver,
  trustFromFile,
  trustHere,
  watchRemoteOutputs,
} from './room';

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

/** A websocket the test drives, standing in for the server's room. */
class FakeSocket {
  static all: FakeSocket[] = [];
  static readonly OPEN = 1;
  readonly OPEN = 1;
  readyState = 0;
  binaryType = '';
  sent: Uint8Array[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: ((e: { code: number; reason: string }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(data: Uint8Array) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  /** The server's sync step 2 for an empty document: the join's first sync. */
  sync() {
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, 0); // sync
    encoding.writeVarUint(enc, 1); // step 2
    encoding.writeVarUint8Array(enc, new Uint8Array([0, 0])); // empty update
    this.onmessage?.({ data: encoding.toUint8Array(enc).buffer as ArrayBuffer });
  }
  serverClose(code: number, reason = '') {
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
}

describe('NotebookRoom connection', () => {
  const session = { format: 'json', type: 'notebook', fileId: 'f1', sessionId: 's1' };
  function joining(onClosed = vi.fn(), person?: string) {
    FakeSocket.all = [];
    const { settings } = settingsAnswering(200, session);
    const join = NotebookRoom.join({
      settings,
      path: 'Io.ipynb',
      onClosed,
      WebSocket: FakeSocket as unknown as typeof WebSocket,
      person,
    });
    return { join, onClosed };
  }

  it('names the person in its awareness, when it has a name', async () => {
    for (const [person, user] of [
      ['Thomas  Lockney', awarenessUser('Thomas Lockney')],
      [undefined, undefined],
    ] as const) {
      const { join } = joining(vi.fn(), person);
      const ws = await socket();
      ws.open();
      ws.sync();
      const room = (await join)!;
      expect(room.notebook.awareness.getLocalState()?.user).toEqual(user);
      room.dispose();
    }
    expect(awarenessUser(' Thomas  Lockney ')).toMatchObject({
      name: 'Thomas Lockney',
      display_name: 'Thomas Lockney',
      initials: 'TL',
    });
    expect(awarenessUser('  ')).toBeUndefined();
  });
  const socket = () => vi.waitFor(() => FakeSocket.all.at(-1) ?? Promise.reject(new Error('none')));

  it('joins the file’s room once it syncs', async () => {
    const { join } = joining();
    const ws = await socket();
    expect(ws.url).toContain('/api/collaboration/room/json:notebook:f1?');
    expect(ws.url).toContain('sessionId=s1');
    expect(ws.url).toContain('token=t');
    ws.open();
    ws.sync();
    const room = await join;
    expect(room).toBeDefined();
    room!.dispose();
  });

  it('fails the join at once when the server closes the room, and says nothing else', async () => {
    const { join, onClosed } = joining();
    const ws = await socket();
    ws.open();
    const started = Date.now();
    ws.serverClose(4404, 'deleted');
    await expect(join).rejects.toThrow('closed the notebook’s room');
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('stops and asks to reopen after a server restart, rather than reconnecting', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { join, onClosed } = joining();
      const ws = await socket();
      ws.open();
      ws.sync();
      const room = (await join)!;
      ws.serverClose(1003, JSON.stringify({ reason: 'unknown_session', reloadable: true }));
      expect(onClosed).toHaveBeenCalledWith({ kind: 'restarted' });
      // No new connection with this document's history.
      await vi.advanceTimersByTimeAsync(10_000);
      expect(FakeSocket.all).toHaveLength(1);
      room.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('fails a save whose connection drops before the answer', async () => {
    const { join } = joining();
    const ws = await socket();
    ws.open();
    ws.sync();
    const room = (await join)!;
    const saving = room.save();
    await vi.waitFor(() => expect(ws.sent.some(isSave)).toBe(true));
    ws.serverClose(1006);
    await expect(saving).rejects.toThrow('dropped before the save was confirmed');
    room.dispose();
  });

  it('answers a save from the server’s reply', async () => {
    const { join } = joining();
    const ws = await socket();
    ws.open();
    ws.sync();
    const room = (await join)!;
    const saving = room.save();
    await vi.waitFor(() => expect(ws.sent.some(isSave)).toBe(true));
    answerSave(ws, 1, 'failed');
    expect(await saving).toBe('failed');
    room.dispose();
  });

  it('holds a save while the connection is down, and sends it once synced again', async () => {
    const { join } = joining();
    const ws = await socket();
    ws.open();
    ws.sync();
    const room = (await join)!;
    ws.serverClose(1006);
    const saving = room.save();
    // y-websocket reconnects on its own.
    const again = await vi.waitFor(() =>
      FakeSocket.all.length === 2 ? FakeSocket.all[1]! : Promise.reject(new Error('not yet')),
    );
    again.open();
    expect(again.sent.some(isSave)).toBe(false);
    again.sync();
    await vi.waitFor(() => expect(again.sent.some(isSave)).toBe(true));
    answerSave(again, 1, 'success');
    expect(await saving).toBe('success');
    room.dispose();
  });
});

/** Whether `data` is the raw `save` message. */
function isSave(data: Uint8Array) {
  return data[0] === 2 && new TextDecoder().decode(data).includes('save');
}

function answerSave(ws: FakeSocket, id: number, status: string) {
  const enc = encoding.createEncoder();
  encoding.writeVarUint(enc, 2);
  encoding.writeVarString(enc, JSON.stringify({ type: 'save', responseTo: id, status }));
  ws.onmessage?.({ data: encoding.toUint8Array(enc).buffer as ArrayBuffer });
}

describe('trust in a room', () => {
  /** A collaborative model on a shared notebook, as the pane builds it. */
  function shared() {
    const model = new NotebookModel({ collaborationEnabled: true });
    model.sharedModel.insertCells(0, [
      {
        cell_type: 'code',
        id: 'a',
        source: 'show()',
        metadata: {},
        outputs: [
          { output_type: 'display_data', data: { 'text/html': '<b>Io</b>' }, metadata: {} },
        ],
      },
    ]);
    model.dirty = false;
    const ydoc = (model.sharedModel as unknown as { ydoc: Y.Doc }).ydoc;
    return { model, ydoc, cell: model.cells.get(0) as ICodeCellModel };
  }

  it('trusts a cell here without editing the shared notebook', () => {
    const { model, ydoc, cell } = shared();
    const updates = vi.fn();
    ydoc.on('update', updates);
    expect(trustHere(cell, true)).toBe(true);
    expect(cell.trusted).toBe(true);
    expect(cell.outputs.get(0).trusted).toBe(true);
    expect(cell.sharedModel.getMetadata('trusted')).toBeUndefined();
    expect(updates).not.toHaveBeenCalled();
    expect(model.dirty).toBe(false);
    expect(trustHere(cell, true)).toBe(false);
  });

  it('takes trust away when another client changes the outputs', () => {
    const { model, ydoc, cell } = shared();
    trustHere(cell, true);
    const changed = vi.fn();
    const stop = watchRemoteOutputs(model, changed);
    // What the output area would render, as each output arrives.
    const shown: boolean[] = [];
    cell.outputs.changed.connect((_, e) => {
      for (const o of e.newValues) shown.push(o.trusted);
    });
    // A second client, as the server relays it.
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(ydoc));
    const sendBack = (u: Uint8Array) => Y.applyUpdate(ydoc, u, 'remote');
    other.on('update', sendBack);
    const ycells = other.getArray<Y.Map<unknown>>('cells');
    const youtputs = ycells.get(0).get('outputs') as Y.Array<unknown>;
    other.transact(() => {
      youtputs.delete(0, youtputs.length);
      youtputs.push([
        { output_type: 'display_data', data: { 'text/html': '<script></script>' }, metadata: {} },
      ]);
    });
    expect(changed).toHaveBeenCalledOnce();
    expect(cell.trusted).toBe(false);
    expect(cell.outputs.get(0).trusted).toBe(false);
    // Never shown trusted, not even for a moment.
    expect(shown.length).toBeGreaterThan(0);
    expect(shown).not.toContain(true);
    // Edits here don't count.
    cell.sharedModel.setSource('show(2)');
    expect(changed).toHaveBeenCalledOnce();
    stop();
  });

  it('drops a read the outputs changed during', async () => {
    const { model, cell } = shared();
    const file = {
      get: vi.fn(async () => ({
        content: { cells: [{ cell_type: 'code', id: 'a', metadata: { trusted: true } }] },
      })),
    } as never;
    expect(await trustFromFile(file, 'Io.ipynb', model, () => true)).toBe(false);
    expect(cell.trusted).toBe(false);
    expect(await trustFromFile(file, 'Io.ipynb', model)).toBe(true);
    expect(cell.trusted).toBe(true);
  });
});
