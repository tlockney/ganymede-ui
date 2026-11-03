/**
 * Cell controls for touch (#200): a "…" button on each cell that opens the
 * cell menu, and an add-cell bar after each cell. With no hardware keyboard
 * (an iPhone, an iPad on its own) these are the only way to add a Markdown
 * cell, change a cell's type, move or delete one: the toolbar hides Insert
 * and Cell Type on narrow screens, and JupyterLab's cell toolbar hides
 * itself on narrow cells.
 *
 * The controls are plain DOM inside each cell's node, shown by CSS only on
 * touch screens and narrow windows (app.css, "Cell controls"); a desktop
 * window keeps the toolbar and JupyterLab's cell toolbar as they were.
 */
import type { Cell } from '@jupyterlab/cells';
import { type Notebook, NotebookActions } from '@jupyterlab/notebook';
import { DisposableDelegate, type IDisposable } from '@lumino/disposable';

export type CellMenuAction =
  'run' | 'code' | 'markdown' | 'raw' | 'move-up' | 'move-down' | 'duplicate' | 'delete';

/** The menu, in order; `type` items are the Cell Type group. */
export const CELL_MENU: readonly { action: CellMenuAction; label: string; type?: true }[] = [
  { action: 'run', label: 'Run' },
  { action: 'code', label: 'Code', type: true },
  { action: 'markdown', label: 'Markdown', type: true },
  { action: 'raw', label: 'Raw', type: true },
  { action: 'move-up', label: 'Move Up' },
  { action: 'move-down', label: 'Move Down' },
  { action: 'duplicate', label: 'Duplicate' },
  { action: 'delete', label: 'Delete' },
];

const MORE = 'gn-cell-more';
const ADD = 'gn-add-cell';

/** Make `cell` the active cell and the only one selected, in command mode. */
export function selectOnly(notebook: Notebook, cell: Cell): boolean {
  const index = notebook.widgets.indexOf(cell);
  if (index < 0) return false;
  notebook.mode = 'command';
  notebook.activeCellIndex = index;
  notebook.deselectAll();
  return true;
}

/**
 * Apply a menu action to `cell`. `run` runs the active cell (it starts the
 * kernel first when there is none, as the toolbar's Run does).
 */
export async function applyCellAction(
  notebook: Notebook,
  cell: Cell,
  action: CellMenuAction,
  run: () => Promise<void>,
): Promise<void> {
  if (!selectOnly(notebook, cell)) return;
  switch (action) {
    case 'run':
      return run();
    case 'code':
    case 'markdown':
    case 'raw':
      return NotebookActions.changeCellType(notebook, action);
    case 'move-up':
      return NotebookActions.moveUp(notebook);
    case 'move-down':
      return NotebookActions.moveDown(notebook);
    case 'duplicate':
      return NotebookActions.duplicate(notebook, 'belowSelected');
    case 'delete':
      return NotebookActions.deleteCells(notebook);
  }
}

/** Add a cell of `type` after `cell` and start editing it. */
export function addCellAfter(notebook: Notebook, cell: Cell, type: 'code' | 'markdown'): void {
  if (!selectOnly(notebook, cell)) return;
  NotebookActions.insertBelow(notebook);
  if (type !== 'code') NotebookActions.changeCellType(notebook, type);
  notebook.mode = 'edit';
}

function button(className: string, label: string, text: string, data: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.setAttribute('aria-label', label);
  b.title = label;
  b.textContent = text;
  b.dataset.gnControl = data;
  return b;
}

/**
 * Give a cell its controls, once, with the add-cell bar kept last: a cell
 * builds its input and output areas when it is first attached, after them.
 */
function decorate(cell: Cell): void {
  const node = cell.node;
  const existing = node.querySelector<HTMLElement>(`:scope > .${ADD}`);
  if (existing) {
    if (node.lastElementChild !== existing) node.append(existing);
    return;
  }
  const more = button(MORE, 'Cell Actions', '…', 'menu');
  more.setAttribute('aria-haspopup', 'menu');
  const bar = document.createElement('div');
  bar.className = ADD;
  bar.append(
    button('gn-add-button', 'Add Code Cell', '+ Code', 'code'),
    button('gn-add-button', 'Add Text Cell', '+ Text', 'markdown'),
  );
  node.append(more, bar);
  void cell.ready.then(() => {
    if (!cell.isDisposed && node.lastElementChild !== bar) node.append(bar);
  });
}

/**
 * Add the controls to every cell of `notebook`, and to cells added later.
 * `onMenu` opens the cell menu for a cell, under its "…" button.
 */
export function attachCellControls(
  notebook: Notebook,
  onMenu: (cell: Cell, anchor: HTMLElement) => void,
): IDisposable {
  let disposed = false;
  const sync = () => {
    if (disposed || notebook.isDisposed) return;
    notebook.widgets.forEach(decorate);
  };
  // The notebook makes the widgets for new cells in its own handler for
  // the same signal, which may run after this one: sync again after it.
  const onCells = () => {
    sync();
    queueMicrotask(sync);
  };
  sync();
  const cells = notebook.model?.cells;
  cells?.changed.connect(onCells);

  const onClick = (e: MouseEvent) => {
    const target = (e.target as Element | null)?.closest<HTMLElement>('[data-gn-control]');
    if (!target) return;
    const cellNode = target.closest('.jp-Cell');
    const cell = notebook.widgets.find(w => w.node === cellNode);
    if (!cell) return;
    e.preventDefault();
    e.stopPropagation();
    const what = target.dataset.gnControl;
    if (what === 'menu') onMenu(cell, target);
    else if (what === 'code' || what === 'markdown') addCellAfter(notebook, cell, what);
  };
  // The notebook takes a mousedown in a cell to select it, drag it or
  // focus its editor, and a double click to edit Markdown; a tap on a
  // control is none of those.
  const onDown = (e: Event) => {
    if ((e.target as Element | null)?.closest('[data-gn-control]')) e.stopPropagation();
  };
  const node = notebook.node;
  node.addEventListener('click', onClick);
  node.addEventListener('mousedown', onDown, true);
  node.addEventListener('pointerdown', onDown, true);
  node.addEventListener('dblclick', onDown, true);

  return new DisposableDelegate(() => {
    disposed = true;
    cells?.changed.disconnect(onCells);
    node.removeEventListener('click', onClick);
    node.removeEventListener('mousedown', onDown, true);
    node.removeEventListener('pointerdown', onDown, true);
    node.removeEventListener('dblclick', onDown, true);
  });
}
