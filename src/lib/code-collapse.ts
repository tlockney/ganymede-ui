/**
 * Collapsing code cells (#564). JupyterLab hides a cell's input when its
 * collapser (the thin bar at the cell's left) is clicked, shows the first
 * line in its place, and saves that in the cell's
 * `metadata.jupyter.source_hidden`. The bar is hard to find and can't be
 * tapped, so each code cell gets a disclosure button in its prompt column:
 * shown on hover and on the active cell, and always while the cell is
 * collapsed (jupyter.css, "Code collapse"). The commands (`collapse-code` and
 * the rest, `createCommands`) and the cell menu do the same from the
 * keyboard, the palette, the apps' menus and touch.
 */
import type { Cell } from '@jupyterlab/cells';
import type { Notebook } from '@jupyterlab/notebook';
import { DisposableDelegate, type IDisposable } from '@lumino/disposable';

const TOGGLE = 'gn-code-toggle';

/** A chevron; CSS turns it to point right while the code is collapsed. */
const CHEVRON =
  '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" fill="none" ' +
  'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 4.5 6 7.5 9 4.5"/></svg>';

/** Whether a cell's code can collapse: only code cells hide their input. */
export function canCollapse(cell: Cell): boolean {
  return cell.model.type === 'code';
}

/**
 * Whether a cell gets the button: a code cell, or any cell left collapsed,
 * such as a collapsed code cell changed to Markdown (JupyterLab keeps
 * `source_hidden` on every type), which must still expand.
 */
function wantsToggle(cell: Cell): boolean {
  return canCollapse(cell) || cell.inputHidden;
}

/**
 * Collapse or expand one cell's code; the cell saves it in its metadata.
 * Only a code cell collapses; any collapsed cell expands. Collapsing the
 * cell being edited takes `notebook` back to command mode, since its
 * editor is gone.
 */
export function setCollapsed(cell: Cell, collapsed: boolean, notebook?: Notebook): void {
  if (cell.inputHidden === collapsed || (collapsed && !canCollapse(cell))) return;
  if (collapsed && notebook?.mode === 'edit' && notebook.activeCell === cell) {
    notebook.mode = 'command';
  }
  cell.inputHidden = collapsed;
  refresh(cell);
}

/** Expand every collapsed cell in `cells`, whatever its type. */
export function expandAll(cells: readonly Cell[]): void {
  for (const cell of cells) setCollapsed(cell, false);
}

function refresh(cell: Cell): void {
  const toggle = cell.node.querySelector<HTMLButtonElement>(`:scope > .${TOGGLE}`);
  if (!toggle) return;
  if (!wantsToggle(cell)) {
    // Removing the focused button would drop focus to the page, and the
    // notebook's keys with it.
    if (toggle.contains(document.activeElement)) cell.node.focus();
    toggle.remove();
    return;
  }
  const collapsed = cell.inputHidden;
  toggle.setAttribute('aria-expanded', String(!collapsed));
  toggle.setAttribute('aria-label', collapsed ? 'Expand Code' : 'Collapse Code');
  toggle.title = collapsed ? 'Expand Code' : 'Collapse Code';
}

/** Cells whose model this module already watches. */
const watched = new WeakSet<Cell>();

/** Add the button if the cell wants one and has none, and keep it current. */
function decorate(cell: Cell): void {
  if (wantsToggle(cell) && !cell.node.querySelector(`:scope > .${TOGGLE}`)) {
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = TOGGLE;
    toggle.innerHTML = CHEVRON;
    toggle.dataset.gnCollapse = '';
    cell.node.append(toggle);
  }
  refresh(cell);
  if (watched.has(cell)) return;
  watched.add(cell);
  // Undo, another window or the agent can change `source_hidden`, also on
  // a Markdown cell whose button has gone, which then needs it back.
  const onMetadata = () => decorate(cell);
  const model = cell.model;
  model.metadataChanged.connect(onMetadata);
  cell.disposed.connect(() => model.metadataChanged.disconnect(onMetadata));
}

/** Give every code cell of `notebook` its disclosure button, and cells added later. */
export function attachCodeCollapse(notebook: Notebook): IDisposable {
  let disposed = false;
  const sync = () => {
    if (disposed || notebook.isDisposed) return;
    notebook.widgets.forEach(decorate);
  };
  // As in `attachCellControls`: the notebook makes new cells' widgets in
  // its own handler for the same signal, which may run after this one.
  const onCells = () => {
    sync();
    queueMicrotask(sync);
  };
  sync();
  const cells = notebook.model?.cells;
  cells?.changed.connect(onCells);

  const toggleOf = (e: Event) =>
    (e.target as Element | null)?.closest<HTMLElement>('[data-gn-collapse]') ?? null;
  const onClick = (e: MouseEvent) => {
    const toggle = toggleOf(e);
    if (!toggle) return;
    const cell = notebook.widgets.find(w => w.node === toggle.closest('.jp-Cell'));
    if (!cell) return;
    e.preventDefault();
    e.stopPropagation();
    setCollapsed(cell, !cell.inputHidden, notebook);
    // A clicked button keeps focus in Chrome and Firefox, where Enter would
    // then press it again instead of editing the cell: hand focus back to
    // the active cell, as the notebook's command-mode keys expect.
    if (toggle.isConnected && toggle.contains(document.activeElement)) {
      (notebook.activeCell ?? cell).node.focus();
    }
  };
  // A press on the button isn't the notebook's: no selecting or dragging
  // the cell, no focusing its editor.
  const onDown = (e: Event) => {
    if (toggleOf(e)) e.stopPropagation();
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
