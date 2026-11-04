/**
 * Which cell is running and which are queued, shown on the cells (#213).
 *
 * JupyterLab marks every cell sent to the kernel as `running` (its prompt
 * shows `[*]`), whether the kernel has started it or not: "in future we
 * would like to distinguish running from scheduled" (`CodeCell.execute`).
 * A kernel runs execute requests one at a time, in the order they came,
 * so the first cell still marked is the one running and the rest wait
 * behind it. {@link RunQueue} keeps that order; the running cell's time
 * counts from when the one before it finished (or from when it was sent,
 * if nothing was ahead of it).
 *
 * Each busy cell gets a line under its input: "Running 0:12" with an
 * Interrupt button, or "Queued". It is plain DOM in the cell's node, as
 * the touch cell controls are (cell-controls.ts).
 */
import type { Cell, ICellModel, ICodeCellModel } from '@jupyterlab/cells';
import type { Notebook } from '@jupyterlab/notebook';
import type { IObservableList } from '@jupyterlab/observables';
import type { IDisposable } from '@lumino/disposable';

export type RunState =
  | { phase: 'running'; since: number }
  /** `ahead`: how many cells run before this one. */
  | { phase: 'queued'; ahead: number };

/** Cells sent to the kernel, in the order it runs them. */
export class RunQueue<K = string> {
  private order: K[] = [];
  private started = new Map<K, number>();

  /** `key` was sent to the kernel at `now`. Already queued: no change. */
  schedule(key: K, now: number): void {
    if (this.order.includes(key)) return;
    this.order.push(key);
    if (this.order.length === 1) this.started.set(key, now);
  }

  /** `key` finished (or was dropped) at `now`; the next one starts then. */
  finish(key: K, now: number): void {
    const i = this.order.indexOf(key);
    if (i < 0) return;
    this.order.splice(i, 1);
    this.started.delete(key);
    const next = this.order[0];
    if (i === 0 && next !== undefined && !this.started.has(next)) this.started.set(next, now);
  }

  /** Forget everything: the kernel restarted or died. */
  clear(): void {
    this.order = [];
    this.started.clear();
  }

  state(key: K): RunState | undefined {
    const i = this.order.indexOf(key);
    if (i < 0) return undefined;
    if (i === 0) return { phase: 'running', since: this.started.get(key) ?? 0 };
    return { phase: 'queued', ahead: i };
  }

  get keys(): readonly K[] {
    return this.order;
  }
}

/** Elapsed time as a clock: `0:07`, `12:03`, `1:02:03`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** What the line on a busy cell says. */
export function describeRun(state: RunState, now: number): string {
  if (state.phase === 'running') return `Running ${formatElapsed(now - state.since)}`;
  return state.ahead === 1 ? 'Queued, 1 cell ahead' : `Queued, ${state.ahead} cells ahead`;
}

const LINE = 'gn-run-status';
const RUNNING = 'gn-mod-running';
const QUEUED = 'gn-mod-queued';

type Options = {
  /** Interrupt the kernel: the running cell's button. */
  interrupt(): void;
  /** The clock, for tests. */
  now?: () => number;
};

export type RunStatus = IDisposable & {
  /** Forget the queue: the kernel was restarted or died. */
  clear(): void;
};

/**
 * Track which of `notebook`'s cells run and wait, and show it on them,
 * with the running time ticking each second while any run.
 */
export function attachRunStatus(notebook: Notebook, { interrupt, now = Date.now }: Options) {
  const queue = new RunQueue<ICellModel>();
  const watched = new Set<ICellModel>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let disposed = false;

  const lineOf = (cell: Cell, create: boolean): HTMLElement | null => {
    let line = cell.node.querySelector<HTMLElement>(`:scope > .${LINE}`);
    if (!line && create) {
      line = document.createElement('div');
      line.className = LINE;
      line.setAttribute('role', 'status');
      const text = document.createElement('span');
      text.className = 'gn-run-text';
      const stop = document.createElement('button');
      stop.type = 'button';
      stop.className = 'gn-run-interrupt';
      stop.textContent = 'Interrupt';
      stop.title = 'Interrupt the Kernel';
      stop.dataset.gnRun = 'interrupt';
      line.append(text, stop);
      // Under the input, above the outputs.
      const input = cell.node.querySelector(':scope > .jp-Cell-inputWrapper');
      cell.node.insertBefore(line, input?.nextSibling ?? null);
    }
    return line;
  };

  const render = () => {
    if (disposed || notebook.isDisposed) return;
    const t = now();
    for (const cell of notebook.widgets) {
      const state = queue.state(cell.model);
      cell.toggleClass(RUNNING, state?.phase === 'running');
      cell.toggleClass(QUEUED, state?.phase === 'queued');
      if (!state) {
        lineOf(cell, false)?.remove();
        continue;
      }
      const line = lineOf(cell, true)!;
      line.dataset.phase = state.phase;
      line.querySelector('.gn-run-text')!.textContent = describeRun(state, t);
      line.querySelector<HTMLElement>('.gn-run-interrupt')!.hidden = state.phase !== 'running';
    }
    // Tick only while something runs.
    if (queue.keys.length && !timer) timer = setInterval(render, 1000);
    if (!queue.keys.length && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const onState = (model: ICellModel, args: { name: string; newValue: unknown }) => {
    if (args.name !== 'executionState') return;
    if (args.newValue === 'running') queue.schedule(model, now());
    else queue.finish(model, now());
    render();
  };
  const watch = (model: ICellModel) => {
    if (model.type !== 'code' || watched.has(model)) return;
    watched.add(model);
    model.stateChanged.connect(onState);
    if ((model as ICodeCellModel).executionState === 'running') queue.schedule(model, now());
  };
  const unwatch = (model: ICellModel) => {
    if (!watched.delete(model)) return;
    model.stateChanged.disconnect(onState);
    queue.finish(model, now());
  };

  const cells = notebook.model?.cells;
  const onCells = (_: unknown, change: IObservableList.IChangedArgs<ICellModel>) => {
    change.oldValues.forEach(unwatch);
    change.newValues.forEach(watch);
    // The notebook makes the new cells' widgets in its own handler, which
    // may run after this one.
    queueMicrotask(render);
  };
  if (cells) for (let i = 0; i < cells.length; i++) watch(cells.get(i));
  cells?.changed.connect(onCells);

  const onClick = (e: MouseEvent) => {
    const target = (e.target as Element | null)?.closest('[data-gn-run]');
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    interrupt();
  };
  // The notebook takes a mousedown in a cell to select or drag it.
  const onDown = (e: Event) => {
    if ((e.target as Element | null)?.closest('[data-gn-run]')) e.stopPropagation();
  };
  const node = notebook.node;
  node.addEventListener('click', onClick);
  node.addEventListener('mousedown', onDown, true);
  node.addEventListener('pointerdown', onDown, true);
  render();

  const status: RunStatus = {
    get isDisposed() {
      return disposed;
    },
    clear() {
      queue.clear();
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer) clearInterval(timer);
      cells?.changed.disconnect(onCells);
      watched.forEach(m => m.stateChanged.disconnect(onState));
      watched.clear();
      node.removeEventListener('click', onClick);
      node.removeEventListener('mousedown', onDown, true);
      node.removeEventListener('pointerdown', onDown, true);
    },
  };
  return status;
}
