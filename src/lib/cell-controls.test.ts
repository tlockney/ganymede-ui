import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';

// The cell menu's actions and the add-cell bar on JupyterLab's real
// Notebook in jsdom. How they look at phone sizes is left to e2e.

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { attachCellControls, applyCellAction, addCellAfter, cellRunState, describeCell, CELL_MENU } =
  await import('./cell-controls');
const { NotebookModel } = await import('@jupyterlab/notebook');
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
  cells: [code('a', 'io'), code('b', 'europa'), code('c', 'ganymede')],
};

let notebook: Notebook;
let holder: HTMLDivElement;
let controls: IDisposable;
let onMenu: ReturnType<typeof vi.fn<(cell: unknown, anchor: HTMLElement) => void>>;
const run = vi.fn(async () => {});

const sources = () => notebook.widgets.map(w => w.model.sharedModel.getSource());
const types = () => notebook.widgets.map(w => w.model.type);
const cell = (i: number) => notebook.widgets[i]!;

beforeEach(() => {
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  onMenu = vi.fn<(cell: unknown, anchor: HTMLElement) => void>();
  controls = attachCellControls(notebook, onMenu);
});

afterEach(() => {
  controls.dispose();
  const model = notebook.model;
  notebook.dispose();
  model?.dispose();
  holder.remove();
  run.mockClear();
});

describe('applyCellAction', () => {
  it('changes the cell’s type', async () => {
    await applyCellAction(notebook, cell(1), 'markdown', run);
    expect(types()).toEqual(['code', 'markdown', 'code']);
    await applyCellAction(notebook, cell(1), 'raw', run);
    expect(types()).toEqual(['code', 'raw', 'code']);
    await applyCellAction(notebook, cell(1), 'code', run);
    expect(types()).toEqual(['code', 'code', 'code']);
  });

  it('acts on that cell only, whatever was selected', async () => {
    notebook.activeCellIndex = 0;
    notebook.extendContiguousSelectionTo(2);
    await applyCellAction(notebook, cell(1), 'markdown', run);
    expect(types()).toEqual(['code', 'markdown', 'code']);
  });

  it('moves the cell up and down', async () => {
    await applyCellAction(notebook, cell(1), 'move-up', run);
    expect(sources()).toEqual(['europa', 'io', 'ganymede']);
    await applyCellAction(notebook, cell(0), 'move-down', run);
    await applyCellAction(notebook, cell(1), 'move-down', run);
    expect(sources()).toEqual(['io', 'ganymede', 'europa']);
  });

  it('duplicates the cell below itself', async () => {
    await applyCellAction(notebook, cell(0), 'duplicate', run);
    expect(sources()).toEqual(['io', 'io', 'europa', 'ganymede']);
  });

  it('deletes the cell', async () => {
    await applyCellAction(notebook, cell(1), 'delete', run);
    expect(sources()).toEqual(['io', 'ganymede']);
  });

  it('runs the cell through `run`, with it active', async () => {
    run.mockImplementationOnce(async () => {
      expect(notebook.activeCellIndex).toBe(2);
    });
    await applyCellAction(notebook, cell(2), 'run', run);
    expect(run).toHaveBeenCalledOnce();
  });

  it('offers every action the issue asks for', () => {
    expect(CELL_MENU.map(i => i.label)).toEqual([
      'Run',
      'Code',
      'Markdown',
      'Raw',
      'Move Up',
      'Move Down',
      'Duplicate',
      'Delete',
    ]);
  });
});

describe('addCellAfter', () => {
  it('adds a code cell after the cell and edits it', () => {
    addCellAfter(notebook, cell(0), 'code');
    expect(sources()).toEqual(['io', '', 'europa', 'ganymede']);
    expect(notebook.activeCellIndex).toBe(1);
    expect(notebook.mode).toBe('edit');
  });

  it('adds a text cell after the last cell', () => {
    addCellAfter(notebook, cell(2), 'markdown');
    expect(types()).toEqual(['code', 'code', 'code', 'markdown']);
    expect(notebook.activeCellIndex).toBe(3);
  });
});

describe('attachCellControls', () => {
  const buttons = (label: string) => [
    ...notebook.node.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`),
  ];

  it('gives each cell a menu button and an add-cell bar, last in the cell', () => {
    expect(buttons('Cell Actions')).toHaveLength(3);
    expect(buttons('Add Code Cell')).toHaveLength(3);
    expect(buttons('Add Text Cell')).toHaveLength(3);
    for (const w of notebook.widgets) {
      expect(w.node.lastElementChild?.className).toBe('gn-add-cell');
    }
  });

  it('keeps the add-cell bar last when the cell adds parts later', async () => {
    const late = document.createElement('div');
    cell(0).node.append(late);
    await new Promise(r => setTimeout(r, 0));
    expect(cell(0).node.lastElementChild?.className).toBe('gn-add-cell');
    expect(late.nextElementSibling?.className).toBe('gn-add-cell');
  });

  it('opens the menu for the cell its button is on', () => {
    buttons('Cell Actions')[1]!.click();
    expect(onMenu).toHaveBeenCalledWith(cell(1), buttons('Cell Actions')[1]);
  });

  it('adds cells from the bar, and controls on the new ones', async () => {
    buttons('Add Text Cell')[0]!.click();
    expect(types()).toEqual(['code', 'markdown', 'code', 'code']);
    await Promise.resolve();
    expect(buttons('Cell Actions')).toHaveLength(4);
  });

  it('keeps controls on a cell whose type changed', async () => {
    await applyCellAction(notebook, cell(2), 'markdown', run);
    await Promise.resolve();
    expect(cell(2).node.querySelector(':scope > .gn-cell-meta > .gn-cell-more')).not.toBeNull();
  });

  it('keeps the notebook from seeing a double tap on a control', () => {
    const seen = vi.fn();
    notebook.node.addEventListener('dblclick', seen);
    buttons('Add Code Cell')[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
    cell(0).node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(seen).toHaveBeenCalledOnce();
  });

  it('adds no cell and starts no drag while the notebook may not be edited', () => {
    controls.dispose();
    let away = true;
    controls = attachCellControls(notebook, onMenu, () => away);
    buttons('Add Text Cell')[0]!.click();
    buttons('Add Code Cell')[0]!.click();
    expect(types()).toEqual(['code', 'code', 'code']);
    // Its menu still opens: CellMenu says what it may do.
    buttons('Cell Actions')[0]!.click();
    expect(onMenu).toHaveBeenCalledOnce();
    // A press on the drag handle: the notebook's own handling of it is not
    // the drag's (which would prevent the default).
    const press = () => {
      const e = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
      cell(0).node.querySelector<HTMLElement>('.gn-cell-drag')!.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(press()).toBe(false);
    away = false;
    expect(press()).toBe(true);
    buttons('Add Text Cell')[0]!.click();
    expect(types()).toEqual(['code', 'markdown', 'code', 'code']);
  });

  it('stops listening when disposed', () => {
    controls.dispose();
    buttons('Cell Actions')[0]!.click();
    expect(onMenu).not.toHaveBeenCalled();
  });
});

describe('the compact layout (#813)', () => {
  const buttons = (label: string) => [
    ...notebook.node.querySelectorAll<HTMLButtonElement>(`button[aria-label="${label}"]`),
  ];
  const meta = (i: number) => cell(i).node.querySelector<HTMLElement>(':scope > .gn-cell-meta')!;

  it('puts a meta line first in each cell, with the count, type and the … button', () => {
    for (let i = 0; i < 3; i++) {
      expect(cell(i).node.firstElementChild).toBe(meta(i));
      expect(meta(i).querySelector('.gn-cell-more')).not.toBeNull();
    }
    expect(meta(0).querySelector('.gn-meta-count')!.textContent).toBe('Not run');
    expect(meta(0).querySelector('.gn-meta-type')!.textContent).toBe('Code');
  });

  it('keeps the meta line first when the cell adds parts later', async () => {
    const early = document.createElement('div');
    cell(0).node.prepend(early);
    await new Promise(r => setTimeout(r, 0));
    expect(cell(0).node.firstElementChild).toBe(meta(0));
  });

  it('shows the execution count, as the cell runs', () => {
    const model = cell(0).model as unknown as { executionCount: number | null };
    model.executionCount = 7;
    expect(describeCell(cell(0)).count).toBe('In [7]');
    expect(meta(0).querySelector('.gn-meta-count')!.textContent).toBe('In [7]');
  });

  it('names a Markdown cell’s type and has no count for it', async () => {
    await applyCellAction(notebook, cell(1), 'markdown', run);
    await Promise.resolve();
    expect(describeCell(cell(1))).toMatchObject({ count: '', type: 'Markdown' });
    expect(meta(1).querySelector<HTMLElement>('.gn-meta-count')!.hidden).toBe(true);
  });

  it('has one Add cell control per cell, named by where it adds', async () => {
    // The active cell and any cell but the last say Below; the last cell,
    // when it isn't the active one, says At End.
    expect(buttons('Add Cell Below')).toHaveLength(2);
    expect(buttons('Add Cell at End')).toHaveLength(1);
    buttons('Add Cell Below')[1]!.click();
    expect(types()).toEqual(['code', 'code', 'code', 'code']);
    expect(notebook.activeCellIndex).toBe(2);
    await Promise.resolve();
    expect(buttons('Add Cell Below')).toHaveLength(3);
    expect(buttons('Add Cell at End')).toHaveLength(1);
  });

  it('names the last cell’s control Add Cell Below when it is active', async () => {
    const main = (i: number) => cell(i).node.querySelector<HTMLElement>('.gn-add-main')!;
    expect(main(2).getAttribute('aria-label')).toBe('Add Cell at End');
    notebook.activeCellIndex = 2;
    await Promise.resolve();
    expect(main(2).getAttribute('aria-label')).toBe('Add Cell Below');
    expect(main(2).title).toBe('Add Cell Below');
  });

  it('adds nothing from Add cell while the notebook may not be edited', () => {
    controls.dispose();
    controls = attachCellControls(notebook, onMenu, () => true);
    buttons('Add Cell Below')[0]!.click();
    expect(types()).toEqual(['code', 'code', 'code']);
  });

  it('marks the last cell, so the end of the notebook has its control', async () => {
    const marked = () => notebook.widgets.map(w => w.hasClass('gn-last-cell'));
    expect(marked()).toEqual([false, false, true]);
    addCellAfter(notebook, cell(2), 'code');
    await Promise.resolve();
    expect(marked()).toEqual([false, false, false, true]);
  });

  it('says Queued, Running and Stopped in words, in the meta line', async () => {
    const state = () => meta(0).querySelector<HTMLElement>('.gn-meta-state')!;
    expect(cellRunState(cell(0))).toBeUndefined();

    cell(0).addClass('gn-mod-queued');
    await Promise.resolve();
    expect(cellRunState(cell(0))).toBe('Queued');
    // Text in the cell, not a colour: with touch-ui, jupyter.css keeps it in
    // the accessibility tree on a wide screen too, where the line doesn't
    // show (without touch-ui the line is display: none).
    expect(state().textContent).toBe('Queued');
    expect(state().hidden).toBe(false);

    cell(0).removeClass('gn-mod-queued');
    cell(0).addClass('gn-mod-running');
    await Promise.resolve();
    expect(state().textContent).toBe('Running');

    cell(0).removeClass('gn-mod-running');
    (cell(0).model as unknown as { outputs: { add(o: unknown): void } }).outputs.add({
      output_type: 'error',
      ename: 'KeyboardInterrupt',
      evalue: '',
      traceback: [],
    });
    await Promise.resolve();
    expect(cellRunState(cell(0))).toBe('Stopped');
    expect(state().textContent).toBe('Stopped');
  });

  it('says nothing for a cell whose last error was an ordinary one', () => {
    (cell(0).model as unknown as { outputs: { add(o: unknown): void } }).outputs.add({
      output_type: 'error',
      ename: 'ValueError',
      evalue: 'bad',
      traceback: [],
    });
    expect(cellRunState(cell(0))).toBeUndefined();
    expect(meta(0).querySelector<HTMLElement>('.gn-meta-state')!.hidden).toBe(true);
  });

  it('says Stopped for this app’s own interrupt name too', async () => {
    // cdp-kernel's kernels interrupt with `Interrupted: Execution
    // interrupted`, not `KeyboardInterrupt`.
    (cell(0).model as unknown as { outputs: { add(o: unknown): void } }).outputs.add({
      output_type: 'error',
      ename: 'Interrupted',
      evalue: 'Execution interrupted',
      traceback: [],
    });
    await Promise.resolve();
    expect(cellRunState(cell(0))).toBe('Stopped');
    expect(meta(0).querySelector('.gn-meta-state')!.textContent).toBe('Stopped');
  });

  it('clears Stopped when the outputs are cleared', async () => {
    const outputs = (
      cell(0).model as unknown as {
        outputs: { add(o: unknown): void; clear(): void };
      }
    ).outputs;
    outputs.add({ output_type: 'error', ename: 'KeyboardInterrupt', evalue: '', traceback: [] });
    await Promise.resolve();
    expect(cellRunState(cell(0))).toBe('Stopped');
    expect(meta(0).querySelector('.gn-meta-state')!.textContent).toBe('Stopped');
    // Clearing the outputs is the only change: no run-status class moves.
    outputs.clear();
    await Promise.resolve();
    expect(cellRunState(cell(0))).toBeUndefined();
    expect(meta(0).querySelector('.gn-meta-state')!.textContent).toBe('');
  });
  it('says Stopped when an interrupt follows output the cell already had', async () => {
    // The output list never goes empty, so jp-mod-noOutputs doesn't change.
    // JupyterLab still rewrites the class attribute (same value) here, so the
    // class observer refreshes too; outputs.changed is the direct route.
    const outputs = (cell(0).model as unknown as { outputs: { add(o: unknown): void } }).outputs;
    outputs.add({ output_type: 'stream', name: 'stdout', text: 'step 1\n' });
    await Promise.resolve();
    expect(cellRunState(cell(0))).toBeUndefined();
    const before = cell(0).node.className;
    outputs.add({ output_type: 'error', ename: 'KeyboardInterrupt', evalue: '', traceback: [] });
    await Promise.resolve();
    expect(cell(0).node.className).toBe(before);
    expect(cellRunState(cell(0))).toBe('Stopped');
    expect(meta(0).querySelector('.gn-meta-state')!.textContent).toBe('Stopped');
  });
});
