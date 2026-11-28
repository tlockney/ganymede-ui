import type * as nbformat from '@jupyterlab/nbformat';
import { ServerConnection } from '@jupyterlab/services';
import { YNotebook } from '@jupyter/ydoc';
import { describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  computeLineDiff,
  describeSaveAttention,
  diffRecoveryNotebook,
  discardRecoveryCopy,
  fetchRecoveryCopyOrRefresh,
  getRecoveryCopy,
  listRecoveryCopies,
  parseRoomRecoverySummary,
  readRoomSaveState,
  recoveryReasonLabel,
  restoreRecoveryCopy,
  watchRoomSaveState,
  type RecoveryCopy,
} from './room-recovery';

function makeSettings(fetch: typeof globalThis.fetch): ServerConnection.ISettings {
  return ServerConnection.makeSettings({
    baseUrl: 'http://127.0.0.1:8888/',
    token: 'tok',
    fetch,
  });
}

function notebookJson(
  cells: Array<{
    id?: string;
    cell_type: 'code' | 'markdown';
    source: string;
    outputs?: unknown[];
  }>,
  metadata: nbformat.INotebookMetadata = {},
): nbformat.INotebookContent {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata,
    cells: cells.map(c => ({
      ...(c.id ? { id: c.id } : {}),
      cell_type: c.cell_type,
      source: c.source,
      metadata: {},
      ...(c.cell_type === 'code'
        ? { execution_count: null, outputs: (c.outputs ?? []) as nbformat.IOutput[] }
        : {}),
    })),
  };
}

describe('room save & recovery state (#831)', () => {
  it('returns an empty state when the server sets no save/recovery keys', () => {
    const doc = new YNotebook();
    expect(readRoomSaveState(doc)).toEqual({});
    doc.dispose();
  });

  it('reads save, save_error, and recovery summary from YNotebook state', () => {
    const doc = new YNotebook();
    doc.ystate.set('save', 'failed');
    doc.ystate.set('save_error', 'disk full');
    doc.ystate.set('recovery', {
      id: 'rec-1',
      at: '2026-11-28T10:00:00Z',
      reason: 'save_failed',
      cells: [],
    });

    expect(readRoomSaveState(doc)).toEqual({
      save: 'failed',
      saveError: 'disk full',
      recovery: {
        id: 'rec-1',
        at: '2026-11-28T10:00:00Z',
        reason: 'save_failed',
        cells: [],
      },
    });
    doc.dispose();
  });

  it('parses a Y.Map recovery summary when received via Yjs updates', () => {
    const ydoc = new Y.Doc();
    const map = ydoc.getMap('summary');
    map.set('id', 'rec-2');
    map.set('at', '2026-11-28T10:05:00Z');
    map.set('reason', 'merge_conflict');
    const arr = new Y.Array<string>();
    arr.push(['cell-a', 'cell-b']);
    map.set('cells', arr);

    expect(parseRoomRecoverySummary(map)).toEqual({
      id: 'rec-2',
      at: '2026-11-28T10:05:00Z',
      reason: 'merge_conflict',
      cells: ['cell-a', 'cell-b'],
    });
    ydoc.destroy();
  });

  it('watches state transitions including clearing save_error and recovery', () => {
    const doc = new YNotebook();
    const seen: ReturnType<typeof readRoomSaveState>[] = [];
    const stop = watchRoomSaveState(doc, s => seen.push(s));

    doc.ystate.set('save', 'failed');
    doc.ystate.set('save_error', 'EACCES: read-only');
    doc.ystate.set('recovery', {
      id: 'rec-3',
      at: '2026-11-28T10:06:00Z',
      reason: 'read_only',
      cells: [],
    });
    doc.ystate.set('dirty', true); // unrelated key does not emit

    expect(seen).toHaveLength(4);
    expect(seen[3]).toEqual({
      save: 'failed',
      saveError: 'EACCES: read-only',
      recovery: {
        id: 'rec-3',
        at: '2026-11-28T10:06:00Z',
        reason: 'read_only',
        cells: [],
      },
    });

    doc.ystate.delete('save_error');
    doc.setState('save', 'saved');
    doc.ystate.delete('recovery');

    expect(seen.at(-1)).toEqual({ save: 'saved' });
    stop();
    doc.setState('save', 'failed');
    expect(seen.at(-1)).toEqual({ save: 'saved' });
    doc.dispose();
  });
});

describe('recovery HTTP API (#831)', () => {
  it('treats 404 on list endpoint as unsupported without error', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response('Not Found', { status: 404 }),
    );
    const res = await listRecoveryCopies(makeSettings(fetch), 'sub/a notebook.ipynb');
    expect(res).toEqual({ kind: 'unsupported' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const firstArg = fetch.mock.calls[0]?.[0];
    const reqUrl = firstArg instanceof Request ? firstArg.url : String(firstArg);
    expect(reqUrl).toContain('/api/collaboration/recovery?path=sub%2Fa+notebook.ipynb');
  });

  it('lists and parses valid recovery copies while dropping traversal paths', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            copies: [
              {
                id: 'rec-10',
                path: 'notes/demo.ipynb',
                at: '2026-11-28T10:00:00Z',
                reason: 'merge_conflict',
                detail: 'cell c2',
                cells: ['c2'],
                notebook: 'Demo',
              },
              {
                id: 'bad',
                path: '../secret.ipynb',
                at: '2026-11-28T10:00:00Z',
                reason: 'save_failed',
                cells: [],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const res = await listRecoveryCopies(makeSettings(fetch), 'notes/demo.ipynb');
    expect(res).toEqual({
      kind: 'copies',
      copies: [
        {
          id: 'rec-10',
          path: 'notes/demo.ipynb',
          at: '2026-11-28T10:00:00Z',
          reason: 'merge_conflict',
          detail: 'cell c2',
          cells: ['c2'],
          notebook: 'Demo',
        },
      ],
    });
  });

  it('fetches a copy with content, and re-reads the list when GET /{id} returns 404', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Not found' }), { status: 404 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            copies: [
              {
                id: 'rec-older',
                path: 'a.ipynb',
                at: '2026-11-28T09:00:00Z',
                reason: 'save_failed',
                cells: [],
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const resolved = await fetchRecoveryCopyOrRefresh(makeSettings(fetch), 'a.ipynb', 'rec-gone');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch.mock.calls[0][0] as Request).url).toContain(
      '/api/collaboration/recovery/rec-gone',
    );
    expect((fetch.mock.calls[1][0] as Request).url).toContain(
      '/api/collaboration/recovery?path=a.ipynb',
    );
    expect(resolved).toEqual({
      kind: 'gone',
      list: {
        kind: 'copies',
        copies: [
          {
            id: 'rec-older',
            path: 'a.ipynb',
            at: '2026-11-28T09:00:00Z',
            reason: 'save_failed',
            cells: [],
          },
        ],
      },
    });
  });

  it('returns an error when GET /{id} delivers malformed notebook content', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: 'rec-bad',
            path: 'a.ipynb',
            at: '2026-11-28T10:00:00Z',
            reason: 'save_failed',
            cells: [],
            content: { broken: true },
          }),
          { status: 200 },
        ),
    );
    const res = await getRecoveryCopy(makeSettings(fetch), 'rec-bad');
    expect(res).toEqual({
      kind: 'error',
      message: 'The recovery copy is not a valid notebook.',
    });
  });

  it('discards a copy with DELETE and handles 204/404/error', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 }),
      );
    const settings = makeSettings(fetch);

    expect(await discardRecoveryCopy(settings, 'rec-1')).toEqual({ kind: 'deleted' });
    expect(await discardRecoveryCopy(settings, 'rec-2')).toEqual({ kind: 'not-found' });
    expect(await discardRecoveryCopy(settings, 'rec-3')).toEqual({
      kind: 'error',
      message: 'Forbidden',
    });
  });

  it('restores via Contents save and then deletes the copy, keeping the copy if save fails', async () => {
    const copy: RecoveryCopy = {
      id: 'rec-restore',
      path: 'a.ipynb',
      at: '2026-11-28T10:00:00Z',
      reason: 'save_failed',
      cells: [],
      content: notebookJson([{ id: 'c1', cell_type: 'code', source: '1 + 1' }]),
    };

    const failingSave = vi.fn(async () => {
      throw new Error('Disk read-only');
    });
    const fetchOnFail = vi.fn();
    const failRes = await restoreRecoveryCopy({
      settings: makeSettings(fetchOnFail),
      contents: { save: failingSave },
      path: 'a.ipynb',
      copy,
    });
    expect(failRes).toEqual({ kind: 'error', message: 'Disk read-only' });
    expect(fetchOnFail).not.toHaveBeenCalled();

    const okSave = vi.fn(async () => ({}) as never);
    const fetchOnOk = vi.fn(async () => new Response(null, { status: 204 }));
    const okRes = await restoreRecoveryCopy({
      settings: makeSettings(fetchOnOk),
      contents: { save: okSave },
      path: 'a.ipynb',
      copy,
    });
    expect(okSave).toHaveBeenCalledWith('a.ipynb', {
      type: 'notebook',
      format: 'json',
      content: copy.content,
    });
    expect(fetchOnOk).toHaveBeenCalledTimes(1);
    expect(okRes).toEqual({ kind: 'restored', discarded: true });
  });
});

describe('save attention description and notebook diffing (#831)', () => {
  it('describes save errors and merge conflict cell names', () => {
    expect(describeSaveAttention({ saveState: { save: 'saved' } })).toBeUndefined();

    expect(
      describeSaveAttention({
        saveState: {
          save: 'failed',
          saveError: 'Permission denied',
        },
      }),
    ).toEqual({
      headline: 'Save needs attention',
      detail: 'Permission denied',
      copiesCount: 0,
    });

    expect(
      describeSaveAttention({
        saveState: {
          save: 'saved',
          recovery: {
            id: 'rec-mc',
            at: '2026-11-28T10:00:00Z',
            reason: 'merge_conflict',
            cells: ['cell-1', 'cell-2'],
          },
        },
      }),
    ).toEqual({
      headline: 'Save needs attention',
      detail: 'Merge conflict: cells cell-1, cell-2',
      summary: {
        id: 'rec-mc',
        at: '2026-11-28T10:00:00Z',
        reason: 'merge_conflict',
        cells: ['cell-1', 'cell-2'],
      },
      copiesCount: 1,
    });

    expect(recoveryReasonLabel('file_gone')).toBe('File deleted or moved');
  });

  it('diffs recovery copy cells against current notebook and flags conflict cells', () => {
    const copy = notebookJson([
      { id: 'c1', cell_type: 'code', source: 'const x = 1;' },
      { id: 'c2', cell_type: 'code', source: 'const y = 20;\nconst z = 3;' },
      { id: 'c-new', cell_type: 'markdown', source: 'From recovery' },
    ]);
    const current = notebookJson([
      { id: 'c1', cell_type: 'code', source: 'const x = 1;' },
      { id: 'c2', cell_type: 'code', source: 'const y = 2;\nconst z = 3;' },
      { id: 'c-old', cell_type: 'code', source: 'removedOnRecovery()' },
    ]);

    const diff = diffRecoveryNotebook(copy, current, ['c2']);
    expect(diff.unchangedCount).toBe(1);
    expect(diff.changedCount).toBe(1);
    expect(diff.addedCount).toBe(1);
    expect(diff.removedCount).toBe(1);
    expect(diff.conflictCells).toEqual(['c2']);

    const c2 = diff.cells.find(c => c.cellId === 'c2');
    expect(c2?.conflict).toBe(true);
    expect(c2?.status).toBe('changed');
    expect(computeLineDiff(c2!.currentSource!, c2!.copySource)).toEqual([
      { kind: 'removed', text: 'const y = 2;' },
      { kind: 'added', text: 'const y = 20;' },
      { kind: 'context', text: 'const z = 3;' },
    ]);
  });
});
