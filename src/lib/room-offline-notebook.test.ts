import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { YNotebook } from '@jupyter/ydoc';
import type { Contents } from '@jupyterlab/services';

// A real Notebook: its cells sync `readOnly` to `metadata.editable`, which
// is in the shared document, so going offline must not touch it (#701).

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');
const { watchOffline } = await import('./room-offline');

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    {
      cell_type: 'code',
      id: 'a',
      source: 'x = 1',
      metadata: { editable: false },
      outputs: [],
      execution_count: null,
    },
    { cell_type: 'markdown', id: 'b', source: 'Io', metadata: {} },
  ],
};

let notebook: Notebook;
let model: InstanceType<typeof NotebookModel>;
let holder: HTMLDivElement;
let updates: number;

beforeEach(() => {
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  updates = 0;
  (model.sharedModel as YNotebook).ydoc.on('update', () => updates++);
});

afterEach(() => {
  notebook.dispose();
  model.dispose();
  holder.remove();
});

function room(connected: boolean) {
  const state = { connected };
  const listeners = new Set<(c: boolean) => void>();
  return {
    get connected() {
      return state.connected;
    },
    onConnection(l: (c: boolean) => void) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    set(c: boolean) {
      state.connected = c;
      listeners.forEach(l => l(c));
    },
  };
}

const editable = () =>
  notebook.widgets.map(c => c.model.sharedModel.getMetadata('editable') as boolean | undefined);

describe('watchOffline on a real notebook', () => {
  it('writes nothing to the shared notebook: not on open, not offline, not back', () => {
    expect(editable()).toEqual([false, undefined]);
    const r = room(true);
    const stop = watchOffline(r, notebook, model, () => {});
    expect(updates).toBe(0);
    expect(editable()).toEqual([false, undefined]);

    r.set(false);
    expect(notebook.widgets.every(c => c.readOnly)).toBe(true);
    expect(model.readOnly).toBe(true);
    expect(updates).toBe(0);
    expect(editable()).toEqual([false, undefined]);

    r.set(true);
    // Each cell is as its metadata says: the locked one stays locked.
    expect(notebook.widgets.map(c => c.readOnly)).toEqual([true, false]);
    expect(model.readOnly).toBe(false);
    expect(updates).toBe(0);
    expect(editable()).toEqual([false, undefined]);
    stop();
  });

  it('starts locked for a room that is already down, and writes nothing', () => {
    const r = room(false);
    const stop = watchOffline(r, notebook, model, () => {});
    expect(notebook.widgets.every(c => c.readOnly)).toBe(true);
    r.set(true);
    expect(notebook.widgets.map(c => c.readOnly)).toEqual([true, false]);
    expect(updates).toBe(0);
    stop();
  });
});
