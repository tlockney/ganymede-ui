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
 * too ("Running, 3 s"), and is not pressed again by accident.
 */
import { type Cell, CodeCell } from '@jupyterlab/cells';
import { type Notebook } from '@jupyterlab/notebook';
import { DisposableDelegate, type IDisposable } from '@lumino/disposable';

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
  /** A machine that is away: the button does nothing (#701). */
  away?(): boolean;
  /** The clock, for tests. */
  now?(): number;
};

export type CellGutter = IDisposable;

/**
 * Give every code cell of `notebook` its run gutter, and cells added later
 * one too. Removing a cell removes its gutter with its node.
 */
export function attachCellGutter(
  notebook: Notebook,
  { run, away = () => false, now = Date.now }: Options,
): CellGutter {
  let disposed = false;
  /** Per-cell teardown: its timers and listeners. */
  const teardowns = new Map<Cell, () => void>();

  const decorate = (cell: Cell) => {
    if (!(cell instanceof CodeCell) || teardowns.has(cell)) return;
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

    let started: number | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    const stopTimer = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    };

    const render = () => {
      if (cell.isDisposed) return;
      const running = cell.model.executionState === 'running';
      if (running && started === undefined) started = now();
      if (!running && started !== undefined) {
        started = undefined;
        stopTimer();
      }
      const seconds = running ? Math.max(0, Math.floor((now() - started!) / 1000)) : undefined;
      const label = seconds === undefined ? 'Run cell' : `Running, ${seconds} s`;
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label);
        button.title = label;
      }
      button.disabled = running;
      button.dataset.state = running ? 'running' : 'idle';
      elapsed.textContent = seconds === undefined ? '' : `${seconds} s`;
      // The slot stays, so nothing shifts as the time appears.
      elapsed.style.visibility = seconds === undefined ? 'hidden' : 'visible';
      const exec = cell.model.executionCount;
      count.textContent = exec == null ? '–' : String(exec);
      if (running && timer === undefined) timer = setInterval(render, 1000);
    };

    const onClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (away() || cell.model.executionState === 'running') return;
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
      if (args.name === 'executionState' || args.name === 'executionCount') render();
    };
    cell.model.stateChanged.connect(onState);
    render();

    teardowns.set(cell, () => {
      stopTimer();
      button.removeEventListener('click', onClick);
      gutter.removeEventListener('mousedown', stop, true);
      gutter.removeEventListener('focusin', stop, true);
      cell.model.stateChanged.disconnect(onState);
      gutter.remove();
    });
    cell.disposed.connect(() => teardowns.get(cell)?.());
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

  return new DisposableDelegate(() => {
    disposed = true;
    cells?.changed.disconnect(onCells);
    for (const teardown of [...teardowns.values()]) teardown();
    teardowns.clear();
  });
}
