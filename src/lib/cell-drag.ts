/**
 * Moving a cell by dragging its handle (#216), with a finger, a pencil or a
 * mouse. JupyterLab's own drag (from a cell's prompt) is mouse-only, and an
 * iPhone or an iPad without a trackpad has none.
 *
 * Pointer events, captured by the handle, so a drag that leaves it keeps
 * coming to it. The handle has `touch-action: none` (jupyter.css), so a
 * finger on it moves the cell instead of scrolling the notebook. The move
 * itself goes through `NotebookActions.moveCells`, as JupyterLab's drag
 * does: one change to the notebook's model, so it is saved and undone like
 * any other edit, and a cell that is running keeps its output.
 */
import type { Cell } from '@jupyterlab/cells';
import { type Notebook, NotebookActions } from '@jupyterlab/notebook';

/** How far the pointer moves (px) before a press on the handle is a drag. */
const SLOP = 4;
/** How near the scroller's top or bottom edge (px) the notebook scrolls. */
const EDGE = 64;
/** The fastest scroll while dragging, in px per frame. */
const MAX_SCROLL = 18;

const DRAGGING = 'gn-dragging';
const LINE = 'gn-drop-line';

/**
 * The index a cell dragged from `from` lands at, with the pointer at `y`:
 * after every other cell whose middle is above `y`. `mids` are the cells'
 * middles, in order, from where they sit (the dragged one's is ignored).
 */
export function dropIndex(mids: readonly number[], from: number, y: number): number {
  let to = 0;
  mids.forEach((mid, i) => {
    if (i !== from && mid < y) to++;
  });
  return to;
}

/**
 * Move `cell` to index `to`, through the notebook model, leaving it the
 * active cell and the only one selected. False when it is already there.
 */
export function moveCellTo(notebook: Notebook, cell: Cell, to: number): boolean {
  const from = notebook.widgets.indexOf(cell);
  const count = notebook.widgets.length;
  const bounded = Math.min(count - 1, Math.max(0, to));
  if (from < 0 || bounded === from) return false;
  notebook.mode = 'command';
  notebook.activeCellIndex = from;
  notebook.deselectAll();
  NotebookActions.moveCells(notebook, from, bounded, 1);
  return true;
}

/** What scrolls the notebook: its windowed list's outer node. */
const scrollerOf = (notebook: Notebook): HTMLElement =>
  (notebook as unknown as { outerNode?: HTMLElement }).outerNode ?? notebook.node;

const middle = (node: HTMLElement) => {
  const r = node.getBoundingClientRect();
  return r.top + r.height / 2;
};

/**
 * Follow a press on `handle`, the drag handle of `cell`, until it is
 * released. Past a few pixels it is a drag: the cell follows the pointer, a
 * line shows where it will land, the notebook scrolls near its edges, and
 * the release moves it there. Escape, a cancelled pointer, or any other
 * change to the cells (an undo, another window) leaves it where it was.
 */
export function dragCell(
  notebook: Notebook,
  cell: Cell,
  handle: HTMLElement,
  down: PointerEvent,
): void {
  if (down.button !== 0 || !notebook.model) return;
  // No text selection, focus change or emulated mouse events.
  down.preventDefault();
  const pointer = down.pointerId;
  try {
    handle.setPointerCapture(pointer);
  } catch {
    // Not in jsdom, nor for a pointer that is already up.
  }
  const scroller = scrollerOf(notebook);
  const startY = down.clientY;
  const startScroll = scroller.scrollTop;
  let y = startY;
  let dragging = false;
  let ended = false;
  let frame = 0;
  let to = -1;
  const line = document.createElement('div');
  line.className = LINE;
  line.setAttribute('aria-hidden', 'true');

  const from = () => notebook.widgets.indexOf(cell);

  /** Where the cell is drawn and where the line is, for the pointer at `y`. */
  const update = () => {
    const offset = y - startY + (scroller.scrollTop - startScroll);
    cell.node.style.transform = `translateY(${offset}px)`;
    const index = from();
    to = dropIndex(
      notebook.widgets.map(w => middle(w.node)),
      index,
      y,
    );
    const others = notebook.widgets.filter(w => w !== cell);
    if (to === index || !others.length) {
      line.remove();
      return;
    }
    // Before the cell it lands in front of, or after the last one.
    const before = others[to];
    line.classList.toggle('after', !before);
    (before ?? others[others.length - 1]!).node.append(line);
  };

  /** Scrolls while the pointer is near the scroller's top or bottom edge. */
  const tick = () => {
    frame = 0;
    if (!dragging || ended) return;
    const r = scroller.getBoundingClientRect();
    const over =
      y < r.top + EDGE ? y - (r.top + EDGE) : y > r.bottom - EDGE ? y - (r.bottom - EDGE) : 0;
    if (over) {
      const step = Math.max(-MAX_SCROLL, Math.min(MAX_SCROLL, over / 3));
      const before = scroller.scrollTop;
      scroller.scrollTop += step;
      if (scroller.scrollTop !== before) update();
    }
    frame = requestAnimationFrame(tick);
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    y = e.clientY;
    if (!dragging) {
      if (Math.abs(y - startY) < SLOP) return;
      dragging = true;
      cell.node.classList.add(DRAGGING);
      document.documentElement.classList.add('gn-cell-dragging');
      frame = requestAnimationFrame(tick);
    }
    e.preventDefault();
    update();
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointer) return;
    y = e.clientY;
    if (dragging) update();
    end(dragging);
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === pointer) end(false);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    end(false);
  };
  const onCells = () => end(false);

  function end(move: boolean) {
    if (ended) return;
    ended = true;
    if (frame) cancelAnimationFrame(frame);
    handle.removeEventListener('pointermove', onMove);
    handle.removeEventListener('pointerup', onUp);
    handle.removeEventListener('pointercancel', onCancel);
    handle.removeEventListener('lostpointercapture', onCancel);
    window.removeEventListener('keydown', onKey, true);
    notebook.model?.cells.changed.disconnect(onCells);
    line.remove();
    cell.node.classList.remove(DRAGGING);
    cell.node.style.transform = '';
    document.documentElement.classList.remove('gn-cell-dragging');
    if (move && to >= 0 && !notebook.isDisposed) {
      moveCellTo(notebook, cell, to);
      notebook.activate();
    }
  }

  handle.addEventListener('pointermove', onMove);
  handle.addEventListener('pointerup', onUp);
  handle.addEventListener('pointercancel', onCancel);
  handle.addEventListener('lostpointercapture', onCancel);
  window.addEventListener('keydown', onKey, true);
  notebook.model.cells.changed.connect(onCells);
}
