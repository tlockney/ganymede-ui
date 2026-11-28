/**
 * The left margin of a code cell (#852): a round run button, the cell's
 * execution count under it, and the seconds a run has taken beside them.
 * JupyterLab's own prompts (`[1]:`) go on desktop; the touch layout keeps
 * them and its Run in the cell menu, so no second Run is added there
 * (jupyter.css shows this gutter only without `.touch-ui`).
 *
 * The button never moves: it is in the same place whether the cell is idle,
 * running or done, and the elapsed time's slot is reserved while it is
 * empty (#812). While the cell runs the button says so, for a screen reader
 * too ("Running, 3 s"), and a queued one says what it waits behind: the
 * queue ({@link RunStatus}) is the one place that knows, so the button
 * never counts on a guess of its own.
 */
import { type Cell, CodeCell } from '@jupyterlab/cells';
import { type Notebook } from '@jupyterlab/notebook';
import { DisposableDelegate, type IDisposable } from '@lumino/disposable';
import { type RunStatus, runLabel, runSeconds } from './run-status';

export const GUTTER = 'gn-cell-gutter';
export const RUN_BUTTON = 'gn-run-button';
export const EXEC_COUNT = 'gn-exec-count';
export const RUN_ELAPSED = 'gn-run-elapsed';

/** A play triangle, centred in the round button. */
const PLAY =
  '<svg viewBox="0 0 10 12" width="10" height="12" aria-hidden="true" fill="currentColor">' +
  '<path d="M1 1.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L1.9.7A.6.6 0 0 0 1 1.2Z"/></svg>';

type Options = {
  /** Run `cell`: select it first, then run it. */
  run(cell: Cell): void;
  /** The run queue, which says whether the cell runs, waits, or is idle. */
  runs: RunStatus;
  /** A machine that is away: the button does nothing (#701). */
  away?(): boolean;
  /** The clock, for tests. */
  now?(): number;
};

export type CellGutter = IDisposable & {
  /** Re-evaluate each cell's run button state (e.g. when read-only changes). */
  refresh(): void;
};

/**
 * Give every code cell of `notebook` its run gutter, and cells added later
 * one too. Removing a cell removes its gutter with its node.
 */
export function attachCellGutter(
  notebook: Notebook,
  { run, runs, away = () => false, now = Date.now }: Options,
): CellGutter {
  let disposed = false;
  /** Per-cell teardown: its listeners. */
  const teardowns = new Map<Cell, () => void>();
  /** Per-cell render callbacks, for refreshing disabled state on lock changes. */
  const renders = new Map<Cell, () => void>();

  const decorate = (cell: Cell) => {
    if (!(cell instanceof CodeCell) || teardowns.has(cell)) return;
    // JupyterLab disposes a cell's model before the widget's `disposed`
    // fires, so keep it here rather than read it late.
    const model = cell.model;
    const gutter = document.createElement('div');
    gutter.className = GUTTER;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = RUN_BUTTON;
    button.innerHTML = PLAY;
    const count = document.createElement('span');
    count.className = EXEC_COUNT;
    count.title = 'Execution count';
    const elapsed = document.createElement('span');
    elapsed.className = RUN_ELAPSED;
    gutter.append(button, count, elapsed);
    cell.node.prepend(gutter);

    const render = () => {
      if (cell.isDisposed) return;
      const state = runs.stateOf(model);
      // Only a run underway has seconds; a queued cell waits, it doesn't count.
      const seconds = state?.phase === 'running' ? runSeconds(state, now()) : undefined;
      const label = runLabel(state, now());
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
        button.title = label;
      }
      // A run already in the queue isn't started again; read-only / away disables Run too.
      button.disabled = away() || state !== undefined;
      button.dataset.state = state?.phase ?? 'idle';
      elapsed.textContent = seconds === undefined ? '' : `${seconds} s`;
      // The slot stays, so nothing shifts as the time appears.
      elapsed.style.visibility = seconds === undefined ? 'hidden' : 'visible';
      const exec = model.executionCount;
      count.textContent = exec == null ? '–' : String(exec);
    };

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (away() || runs.stateOf(model)) return;
      run(cell);
    };
    // The cell takes a press to select it or focus its editor; a press on
    // its own control is neither, and a tap that focuses the button is not
    // a tap into the cell either.
    const stop = (e: Event) => e.stopPropagation();
    button.addEventListener('click', onClick);
    gutter.addEventListener('mousedown', stop, true);
    gutter.addEventListener('focusin', stop, true);
    const onState = (_model: unknown, args: { name: string }) => {
      if (args.name === 'executionCount') render();
    };
    model.stateChanged.connect(onState);
    // The queue ticks the seconds, and changes phase when a run starts or ends.
    runs.changed.connect(render);
    renders.set(cell, render);
    render();

    const teardown = () => {
      if (!teardowns.delete(cell)) return;
      renders.delete(cell);
      button.removeEventListener('click', onClick);
      gutter.removeEventListener('mousedown', stop, true);
      gutter.removeEventListener('focusin', stop, true);
      model.stateChanged.disconnect(onState);
      runs.changed.disconnect(render);
      gutter.remove();
    };
    teardowns.set(cell, teardown);
    cell.disposed.connect(teardown);
  };

  const sync = () => {
    if (disposed || notebook.isDisposed) return;
    notebook.widgets.forEach(decorate);
  };
  const onCells = () => {
    sync();
    // The notebook makes widgets for new cells in its own handler for the
    // same signal, which may run after this one.
    queueMicrotask(sync);
  };
  sync();
  const cells = notebook.model?.cells;
  cells?.changed.connect(onCells);

  const disposable = new DisposableDelegate(() => {
    disposed = true;
    cells?.changed.disconnect(onCells);
    for (const teardown of [...teardowns.values()]) teardown();
    teardowns.clear();
    renders.clear();
  });

  return {
    get isDisposed() {
      return disposable.isDisposed;
    },
    dispose: () => disposable.dispose(),
    refresh: () => {
      for (const render of renders.values()) render();
    },
  };
}
