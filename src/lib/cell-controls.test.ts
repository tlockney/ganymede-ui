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
const { attachCellControls, applyCellAction, addCellAfter, CELL_MENU } =
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
    expect(cell(2).node.querySelector(':scope > .gn-cell-more')).not.toBeNull();
  });

  it('keeps the notebook from seeing a double tap on a control', () => {
    const seen = vi.fn();
    notebook.node.addEventListener('dblclick', seen);
    buttons('Add Code Cell')[0]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(seen).not.toHaveBeenCalled();
    cell(0).node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(seen).toHaveBeenCalledOnce();
  });

  it('stops listening when disposed', () => {
    controls.dispose();
    buttons('Cell Actions')[0]!.click();
    expect(onMenu).not.toHaveBeenCalled();
  });
});
