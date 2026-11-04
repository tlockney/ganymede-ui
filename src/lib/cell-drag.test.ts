import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';

// Dragging a cell by its handle (#216) on JupyterLab's real Notebook in
// jsdom, with each cell laid out 100px tall. How it looks under a finger is
// left to a device.

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { attachCellControls } = await import('./cell-controls');
const { dropIndex, moveCellTo } = await import('./cell-drag');
const { NotebookActions, NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');

const code = (id: string, source: string): nbformat.ICodeCell => ({
  cell_type: 'code',
  id,
  source,
  metadata: {},
  outputs: [],
  execution_count: null,
});

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [code('a', 'io'), code('b', 'europa'), code('c', 'ganymede'), code('d', 'callisto')],
};

const HEIGHT = 100;

let notebook: Notebook;
let holder: HTMLDivElement;
let controls: IDisposable;

const sources = () => notebook.widgets.map(w => w.model.sharedModel.getSource());
const cell = (i: number) => notebook.widgets[i]!;
const handle = (i: number) => cell(i).node.querySelector<HTMLElement>('.gn-cell-drag')!;

/** Lays the cells out top to bottom, HEIGHT each, wherever they are now. */
function layOut() {
  notebook.widgets.forEach((w, i) => {
    w.node.getBoundingClientRect = () => new DOMRect(0, i * HEIGHT, 600, HEIGHT);
  });
}

const pointer = (type: string, clientY: number, pointerId = 1) =>
  new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId, clientY });

/** Press the handle of cell `i`, move through `ys`, and let go at the last. */
function drag(i: number, ys: number[], end: 'pointerup' | 'pointercancel' = 'pointerup') {
  const h = handle(i);
  const start = i * HEIGHT + 60;
  h.dispatchEvent(pointer('pointerdown', start));
  for (const y of ys) h.dispatchEvent(pointer('pointermove', y));
  h.dispatchEvent(pointer(end, ys.at(-1) ?? start));
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  // As NotebookPane makes it.
  const model = new NotebookModel({ disableDocumentWideUndoRedo: true });
  model.fromJSON(CONTENT);
  model.dirty = false;
  model.sharedModel.clearUndoHistory();
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  controls = attachCellControls(notebook, () => {});
  layOut();
});

afterEach(() => {
  controls.dispose();
  const model = notebook.model;
  notebook.dispose();
  model?.dispose();
  holder.remove();
});

describe('dropIndex', () => {
  const mids = [50, 150, 250, 350];

  it('lands after every other cell whose middle is above the pointer', () => {
    expect(dropIndex(mids, 0, 10)).toBe(0);
    expect(dropIndex(mids, 0, 160)).toBe(1);
    expect(dropIndex(mids, 0, 400)).toBe(3);
    expect(dropIndex(mids, 3, 10)).toBe(0);
    expect(dropIndex(mids, 3, 200)).toBe(2);
  });

  it('stays put near where it started', () => {
    expect(dropIndex(mids, 1, 140)).toBe(1);
    expect(dropIndex(mids, 1, 240)).toBe(1);
  });
});

describe('moveCellTo', () => {
  it('moves the cell through the model, which can undo it', () => {
    expect(moveCellTo(notebook, cell(0), 2)).toBe(true);
    expect(sources()).toEqual(['europa', 'ganymede', 'io', 'callisto']);
    expect(notebook.model!.dirty).toBe(true);
    expect(notebook.activeCellIndex).toBe(2);
    NotebookActions.undo(notebook);
    expect(sources()).toEqual(['io', 'europa', 'ganymede', 'callisto']);
    NotebookActions.redo(notebook);
    expect(sources()).toEqual(['europa', 'ganymede', 'io', 'callisto']);
  });

  it('does nothing when the cell is already there', () => {
    expect(moveCellTo(notebook, cell(1), 1)).toBe(false);
    expect(moveCellTo(notebook, cell(3), 9)).toBe(false);
    expect(notebook.model!.dirty).toBe(false);
  });
});

describe('dragging the handle', () => {
  it('gives every cell a handle', () => {
    expect(notebook.widgets.every(w => w.node.querySelector('.gn-cell-drag'))).toBe(true);
    expect(handle(0).getAttribute('aria-label')).toBe('Drag to Move Cell');
    // Keyboard and VoiceOver users move cells from the … menu instead.
    expect(handle(0).tabIndex).toBe(-1);
    expect(handle(0).getAttribute('aria-hidden')).toBe('true');
  });

  it('moves a cell down', () => {
    drag(0, [80, 200, 270]);
    expect(sources()).toEqual(['europa', 'ganymede', 'io', 'callisto']);
  });

  it('moves a cell up, to the top', () => {
    drag(3, [300, 100, 10]);
    expect(sources()).toEqual(['callisto', 'io', 'europa', 'ganymede']);
  });

  it('moves a cell to the end', () => {
    drag(1, [200, 390]);
    expect(sources()).toEqual(['io', 'ganymede', 'callisto', 'europa']);
  });

  it('works for a mouse as well as a finger', () => {
    const h = handle(0);
    const as = (type: string, clientY: number) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 7,
        pointerType: 'mouse',
        clientY,
      });
    h.dispatchEvent(as('pointerdown', 60));
    h.dispatchEvent(as('pointermove', 170));
    h.dispatchEvent(as('pointerup', 170));
    expect(sources()).toEqual(['europa', 'io', 'ganymede', 'callisto']);
  });

  it('shows the cell following the pointer and where it will land', () => {
    const h = handle(0);
    h.dispatchEvent(pointer('pointerdown', 60));
    h.dispatchEvent(pointer('pointermove', 270));
    expect(cell(0).node).toHaveClass('gn-dragging');
    expect(cell(0).node.style.transform).toBe('translateY(210px)');
    // Before callisto: after ganymede.
    expect(cell(3).node.querySelector('.gn-drop-line')).not.toBeNull();
    h.dispatchEvent(pointer('pointerup', 270));
    expect(document.querySelector('.gn-drop-line')).toBeNull();
    expect(notebook.widgets.some(w => w.node.classList.contains('gn-dragging'))).toBe(false);
  });

  it('leaves a tap on the handle alone', () => {
    drag(1, [161]);
    expect(sources()).toEqual(['io', 'europa', 'ganymede', 'callisto']);
    expect(notebook.model!.dirty).toBe(false);
  });

  it('leaves the cell where it was when the pointer is cancelled', () => {
    drag(0, [200, 300], 'pointercancel');
    expect(sources()).toEqual(['io', 'europa', 'ganymede', 'callisto']);
    expect(cell(0).node.style.transform).toBe('');
  });

  it('leaves the cell where it was on Escape', () => {
    const h = handle(0);
    h.dispatchEvent(pointer('pointerdown', 60));
    h.dispatchEvent(pointer('pointermove', 300));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    h.dispatchEvent(pointer('pointerup', 300));
    expect(sources()).toEqual(['io', 'europa', 'ganymede', 'callisto']);
  });

  it('ignores another finger', () => {
    const h = handle(0);
    h.dispatchEvent(pointer('pointerdown', 60));
    h.dispatchEvent(pointer('pointermove', 300, 2));
    h.dispatchEvent(pointer('pointerup', 300, 2));
    h.dispatchEvent(pointer('pointerup', 60));
    expect(sources()).toEqual(['io', 'europa', 'ganymede', 'callisto']);
  });

  it('gives up when the cells change under it', () => {
    const h = handle(0);
    h.dispatchEvent(pointer('pointerdown', 60));
    h.dispatchEvent(pointer('pointermove', 300));
    notebook.model!.sharedModel.deleteCell(3);
    h.dispatchEvent(pointer('pointerup', 300));
    expect(sources()).toEqual(['io', 'europa', 'ganymede']);
  });

  it('keeps the press from reaching the notebook', () => {
    const seen = vi.fn();
    notebook.node.addEventListener('pointerdown', seen);
    handle(2).dispatchEvent(pointer('pointerdown', 260));
    expect(seen).not.toHaveBeenCalled();
    handle(2).dispatchEvent(pointer('pointerup', 260));
  });

  it('puts the moved cell back under the handle’s controls', async () => {
    drag(0, [270]);
    await Promise.resolve();
    expect(notebook.widgets.every(w => w.node.querySelector('.gn-cell-drag'))).toBe(true);
  });
});
