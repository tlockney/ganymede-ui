/**
 * The active cell's rail on a long Markdown cell (#814): rendered prose can
 * run for screens, and an accent bar down all of it reads as a selection of
 * everything. A Markdown cell taller than RAIL_LINES of its own line height
 * gets the class `gn-mod-tall`, and jupyter.css draws a short marker at its
 * top instead of the full-height rail. A shorter cell keeps the rail, and a
 * code cell keeps it always: its editor box already bounds it.
 *
 * A cell's height changes as its Markdown renders and unrenders, as its
 * content is edited (the live preview, #672) and as the window resizes, so
 * a ResizeObserver watches each Markdown cell. The notebook keeps every
 * cell in the DOM (`windowingMode: 'none'`, src/lib/jupyterlab.ts), so
 * nothing scrolls out from under the observer.
 */
import { Cell, MarkdownCell } from '@jupyterlab/cells';
import type { Notebook } from '@jupyterlab/notebook';
import type { IDisposable } from '@lumino/disposable';

/** The class of a Markdown cell taller than the rail's line budget. */
export const TALL = 'gn-mod-tall';

/** A Markdown cell taller than this many of its lines gets the short marker. */
export const RAIL_LINES = 12;

/** A fallback line height, the rendered Markdown's: 15px × 1.6 (jupyter.css). */
const LINE_HEIGHT = 24;

/** True when a cell of `height` px at `lineHeight` px a line is past the rail. */
export function railIsShort(height: number, lineHeight: number): boolean {
  return height > RAIL_LINES * lineHeight;
}

/** The line height of the cell's own content: its rendered Markdown, or its
 * editor while it is being edited. Zero is nothing to measure with. */
function lineHeightOf(cell: MarkdownCell): number {
  const content = cell.node.querySelector('.jp-MarkdownOutput, .cm-content');
  const px = content ? parseFloat(getComputedStyle(content).lineHeight) : 0;
  return px > 0 ? px : LINE_HEIGHT;
}

/**
 * Watch the height of every Markdown cell of `notebook`, and mark the tall
 * ones. The observer reports a cell's first size too, so a cell rendered
 * before or while it is watched is marked without waiting for a change.
 */
export function attachMarkdownRail(notebook: Notebook): IDisposable {
  let disposed = false;
  const seen = new WeakSet<MarkdownCell>();
  const mark = (cell: MarkdownCell, height: number) => {
    if (!cell.isDisposed) cell.toggleClass(TALL, railIsShort(height, lineHeightOf(cell)));
  };
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) {
      const cell = notebook.widgets.find(w => w.node === entry.target);
      if (cell instanceof MarkdownCell) mark(cell, entry.contentRect.height);
    }
  });
  const watch = (cell: Cell) => {
    if (!(cell instanceof MarkdownCell) || seen.has(cell) || cell.isDisposed) return;
    seen.add(cell);
    observer.observe(cell.node);
    cell.disposed.connect(() => observer.unobserve(cell.node));
  };
  const sync = () => {
    if (disposed || notebook.isDisposed) return;
    notebook.widgets.forEach(watch);
  };
  // The notebook makes the widgets for new cells in its own handler for the
  // same signal, which may run after this one: sync again after it.
  const onCells = () => {
    sync();
    queueMicrotask(sync);
  };
  sync();
  const cells = notebook.model?.cells;
  cells?.changed.connect(onCells);
  return {
    get isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      cells?.changed.disconnect(onCells);
    },
  };
}
