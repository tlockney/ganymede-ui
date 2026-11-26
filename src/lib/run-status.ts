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
 *
 * It is the one place that knows the queue (#852): the margin's Run button
 * asks it which phase the cell is in and since when, and the meta line under
 * the outputs takes the time a run took from here.
 */
import type { Cell, ICellModel, ICodeCellModel } from '@jupyterlab/cells';
import { type Notebook, NotebookActions } from '@jupyterlab/notebook';
import type { IDisposable } from '@lumino/disposable';
import { type ISignal, Signal } from '@lumino/signaling';

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

/** How long a cell's run has been going, in seconds, as the gutter shows it. */
export function runSeconds(state: RunState, now: number): number {
  if (state.phase !== 'running') return 0;
  return Math.max(0, Math.floor((now - state.since) / 1000));
}

/**
 * What the margin's Run button says to a screen reader: what it does, what
 * the cell runs for, or what it waits behind (#852).
 */
export function runLabel(state: RunState | undefined, now: number): string {
  if (!state) return 'Run cell';
  // Queued says so in one word: the margin has no room for the queue's count,
  // and the line in the cell says how many runs are ahead.
  if (state.phase === 'queued') return 'Queued';
  return `Running, ${runSeconds(state, now)} s`;
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
  /**
   * Whether a run this page started is unfinished: a cell it scheduled
   * (JupyterLab's `executionScheduled`, for this notebook) that is still
   * marked running. A cell already running when the notebook was attached,
   * or marked running by another client in a room, doesn't count.
   */
  readonly busy: boolean;
  /** Emitted when {@link busy} changes. */
  readonly busyChanged: ISignal<Notebook, boolean>;
  /** Which run a cell waits on, and since when; nothing when it isn't in the queue. */
  stateOf(model: ICellModel): RunState | undefined;
  /**
   * How many milliseconds a cell's last run took, as its outputs were made
   * (the meta line under them says so): nothing before it runs here.
   */
  lastRun(model: ICellModel): number | undefined;
  /**
   * Whether this page ran the cell: false for a cell whose outputs are
   * only what the file held, which say so ("saved output").
   */
  hasRun(model: ICellModel): boolean;
  /** Emitted on every change to the queue, and once a second while a cell runs. */
  readonly changed: ISignal<Notebook, void>;
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
  let busy = false;
  /**
   * Ids of the cells this page scheduled and that haven't finished. By id,
   * not model: moving a cell recreates its model with the same id.
   */
  const mine = new Set<string>();
  const busyChanged = new Signal<Notebook, boolean>(notebook);
  const changed = new Signal<Notebook, void>(notebook);
  /** Seconds each cell's last run took, and which cells this page has run. */
  const lastRuns = new WeakMap<ICellModel, number>();
  const ran = new WeakSet<ICellModel>();

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

  /** Emits synchronously: a listener may call `clear`, which comes back here. */
  const updateBusy = () => {
    const nowBusy = queue.keys.some(model => mine.has(model.id));
    if (nowBusy === busy) return;
    busy = nowBusy;
    busyChanged.emit(busy);
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
    updateBusy();
    changed.emit();
    // Tick only while something runs.
    if (queue.keys.length && !timer) timer = setInterval(render, 1000);
    if (!queue.keys.length && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const onState = (model: ICellModel, args: { name: string; newValue: unknown }) => {
    if (args.name !== 'executionState') return;
    if (args.newValue === 'running') {
      ran.add(model);
      queue.schedule(model, now());
    } else {
      mine.delete(model.id);
      // How long the run took: the cell's outputs were made between the
      // kernel starting it and now.
      const state = queue.state(model);
      if (state?.phase === 'running') lastRuns.set(model, Math.max(0, now() - state.since));
      queue.finish(model, now());
    }
    render();
  };
  const watch = (model: ICellModel) => {
    if (model.type !== 'code' || watched.has(model)) return;
    watched.add(model);
    model.stateChanged.connect(onState);
    if ((model as ICodeCellModel).executionState === 'running') {
      // Running when the pane attached: its outputs aren't only the file's.
      ran.add(model);
      queue.schedule(model, now());
    }
  };
  const unwatch = (model: ICellModel) => {
    if (!watched.delete(model)) return;
    model.stateChanged.disconnect(onState);
    queue.finish(model, now());
  };

  // The runs this page starts, as JupyterLab reports them for this notebook.
  // `executed` is not sent when a run is cancelled (a restart, a disposed
  // cell): then the cell's state leaving `running`, or `clear`, ends it. An
  // `aborted` reply leaves the cell `running` but does send `executed`.
  const onScheduled = (_: unknown, args: { notebook: Notebook; cell: Cell }) => {
    if (disposed || args.notebook !== notebook) return;
    mine.add(args.cell.model.id);
    updateBusy();
  };
  const onExecuted = (_: unknown, args: { notebook: Notebook; cell: Cell }) => {
    if (disposed || args.notebook !== notebook) return;
    mine.delete(args.cell.model.id);
    updateBusy();
  };
  NotebookActions.executionScheduled.connect(onScheduled);
  NotebookActions.executed.connect(onExecuted);

  const cells = notebook.model?.cells;
  const onCells = () => {
    // Reconcile with the list: a removal's oldValues are undefined (and a
    // move is a removal plus an insert of a copy), so a removed cell is
    // found by its absence.
    const present = new Set<ICellModel>();
    if (cells) for (let i = 0; i < cells.length; i++) present.add(cells.get(i));
    // Removing the running cell doesn't stop the kernel running it, so the
    // next one shows as running early: queue timing is an estimate.
    [...watched].filter(m => !present.has(m)).forEach(unwatch);
    present.forEach(watch);
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
    get busy() {
      return busy;
    },
    busyChanged,
    changed,
    stateOf: model => queue.state(model),
    lastRun: model => lastRuns.get(model),
    hasRun: model => ran.has(model),
    clear() {
      queue.clear();
      render();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (timer) clearInterval(timer);
      NotebookActions.executionScheduled.disconnect(onScheduled);
      NotebookActions.executed.disconnect(onExecuted);
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
