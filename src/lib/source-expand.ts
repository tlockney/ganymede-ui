/**
 * Expanded source prompt (#822): a long code cell (> 20 lines) shows a quiet
 * bar above its editor with its line count and an "Expand source" action that
 * opens the cell in a full-window editor dialog. Short cells keep no extra
 * chrome above their editor (their Expand Source action stays in the cell menu).
 */
import { type Cell, CodeCell } from '@jupyterlab/cells';
import type { Notebook } from '@jupyterlab/notebook';
import { DisposableDelegate, type IDisposable } from '@lumino/disposable';

/** Code cells longer than this many lines offer an inline "Expand source" bar. */
export const SOURCE_LINES = 20;

const BAR = 'gn-source-bar';
const HAS_BAR = 'gn-has-source-bar';

/** Number of lines in `source`; a trailing newline does not add an extra blank line. */
export function countSourceLines(source: string): number {
  if (source === '') return 0;
  const all = source.split(/\r\n|\r|\n/);
  if (all.length > 1 && all[all.length - 1] === '') all.pop();
  return all.length;
}

/** Whether a code cell's source exceeds `SOURCE_LINES`. */
export function isLongSource(source: string): boolean {
  return countSourceLines(source) > SOURCE_LINES;
}

/** Places or updates the source expand bar above `cell`'s input area. */
function decorate(cell: Cell, watched: WeakSet<Cell>): void {
  if (!watched.has(cell)) {
    watched.add(cell);
    const refresh = () => {
      if (!cell.isDisposed) decorate(cell, watched);
    };
    const model = cell.model;
    model.sharedModel.changed.connect(refresh);
    model.metadataChanged.connect(refresh);
    model.stateChanged.connect(refresh);
    void cell.ready.then(refresh);
    cell.disposed.connect(() => {
      model.sharedModel.changed.disconnect(refresh);
      model.metadataChanged.disconnect(refresh);
      model.stateChanged.disconnect(refresh);
    });
  }

  const existing = cell.node.querySelector<HTMLElement>(`:scope > .${BAR}`);
  const isCode = cell instanceof CodeCell;
  const lines = isCode ? countSourceLines(cell.model.sharedModel.getSource()) : 0;
  const show = isCode && !cell.inputHidden && lines > SOURCE_LINES;

  if (!show) {
    if (existing) {
      if (existing.contains(document.activeElement)) cell.node.focus();
      existing.remove();
    }
    cell.removeClass(HAS_BAR);
    return;
  }

  cell.addClass(HAS_BAR);
  const key = String(lines);
  let bar = existing;
  if (!bar || bar.dataset.key !== key) {
    const labelText = `${lines} lines`;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = BAR;
      const label = document.createElement('span');
      label.className = 'gn-source-label';
      label.textContent = labelText;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gn-source-toggle';
      button.dataset.gnSource = 'expand';
      button.textContent = 'Expand source';
      bar.append(label, button);
    } else {
      const label = bar.querySelector<HTMLElement>('.gn-source-label');
      if (label) label.textContent = labelText;
    }
    bar.dataset.key = key;
  }

  const inputWrapper = cell.node.querySelector<HTMLElement>(':scope > .jp-Cell-inputWrapper');
  if (inputWrapper) {
    if (bar.parentElement !== cell.node || bar.nextElementSibling !== inputWrapper) {
      inputWrapper.before(bar);
    }
  } else if (bar.parentElement !== cell.node) {
    const meta = cell.node.querySelector<HTMLElement>(':scope > .gn-cell-meta');
    if (meta) meta.after(bar);
    else cell.node.prepend(bar);
  }
}

/** Watches `notebook` cells and calls `onExpand` when a cell's Expand source button is clicked. */
export function attachSourceExpand(
  notebook: Notebook,
  onExpand: (cell: CodeCell, opener: HTMLElement) => void,
): IDisposable {
  let disposed = false;
  const watched = new WeakSet<Cell>();

  const sync = () => {
    if (disposed || notebook.isDisposed) return;
    notebook.widgets.forEach(cell => decorate(cell, watched));
  };
  const onCells = () => {
    sync();
    queueMicrotask(sync);
  };
  sync();
  const cells = notebook.model?.cells;
  cells?.changed.connect(onCells);

  const buttonOf = (e: Event) =>
    (e.target as Element | null)?.closest<HTMLElement>('[data-gn-source]') ?? null;

  const onClick = (e: MouseEvent) => {
    const button = buttonOf(e);
    if (!button) return;
    const cell = notebook.widgets.find(w => w.node === button.closest('.jp-Cell'));
    if (!(cell instanceof CodeCell)) return;
    e.preventDefault();
    e.stopPropagation();
    onExpand(cell, button);
  };

  // Stop presses and focus-in from telling the notebook to select/activate
  // the cell mid-tap (which would grow `.gn-cell-meta` and shift the bar).
  const onStop = (e: Event) => {
    if (buttonOf(e)) e.stopPropagation();
  };

  const node = notebook.node;
  // Also re-check cells when input collapse toggles (`_input` <-> placeholder
  // inside `.jp-Cell-inputWrapper`), even before/without `syncCollapse`.
  const dirty = new Set<Cell>();
  const flush = () => {
    if (disposed || notebook.isDisposed) {
      dirty.clear();
      return;
    }
    dirty.forEach(cell => {
      if (!cell.isDisposed) decorate(cell, watched);
    });
    dirty.clear();
  };
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (!target?.closest('.jp-Cell-inputWrapper')) continue;
      const cellNode = target.closest('.jp-Cell');
      const cell = notebook.widgets.find(w => w.node === cellNode);
      if (cell && !cell.isDisposed) dirty.add(cell);
    }
    if (dirty.size > 0) flush();
  });
  observer.observe(node, { childList: true, subtree: true });

  node.addEventListener('click', onClick);
  node.addEventListener('mousedown', onStop, true);
  node.addEventListener('pointerdown', onStop, true);
  node.addEventListener('dblclick', onStop, true);
  node.addEventListener('focusin', onStop, true);

  return new DisposableDelegate(() => {
    disposed = true;
    observer.disconnect();
    dirty.clear();
    cells?.changed.disconnect(onCells);
    node.removeEventListener('click', onClick);
    node.removeEventListener('mousedown', onStop, true);
    node.removeEventListener('pointerdown', onStop, true);
    node.removeEventListener('dblclick', onStop, true);
    node.removeEventListener('focusin', onStop, true);
  });
}
