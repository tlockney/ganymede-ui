import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICodeCellModel } from '@jupyterlab/cells';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import type { Signal } from '@lumino/signaling';

// The queue on its own, and the lines on JupyterLab's real Notebook in
// jsdom, with cells marked running as `CodeCell.execute` marks them.

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { RunQueue, attachRunStatus, describeRun, formatElapsed } = await import('./run-status');
const { NotebookModel, NotebookActions } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');

describe('RunQueue', () => {
  it('runs the first cell sent and queues the rest behind it', () => {
    const q = new RunQueue();
    q.schedule('a', 1000);
    q.schedule('b', 1100);
    q.schedule('c', 1200);
    expect(q.state('a')).toEqual({ phase: 'running', since: 1000 });
    expect(q.state('b')).toEqual({ phase: 'queued', ahead: 1 });
    expect(q.state('c')).toEqual({ phase: 'queued', ahead: 2 });
    expect(q.state('d')).toBeUndefined();
  });

  it('starts the next cell’s clock when the one ahead finishes', () => {
    const q = new RunQueue();
    q.schedule('a', 1000);
    q.schedule('b', 1100);
    q.schedule('a', 1500); // Already queued: no change.
    q.finish('a', 4000);
    expect(q.state('a')).toBeUndefined();
    expect(q.state('b')).toEqual({ phase: 'running', since: 4000 });
  });

  it('drops a queued cell without touching the running one, and clears', () => {
    const q = new RunQueue();
    q.schedule('a', 1000);
    q.schedule('b', 1100);
    q.schedule('c', 1200);
    q.finish('b', 2000);
    expect(q.state('a')).toEqual({ phase: 'running', since: 1000 });
    expect(q.state('c')).toEqual({ phase: 'queued', ahead: 1 });
    q.clear();
    expect(q.keys).toEqual([]);
  });
});

describe('formatElapsed and describeRun', () => {
  it('reads as a clock', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(7_400)).toBe('0:07');
    expect(formatElapsed(12 * 60_000 + 3_000)).toBe('12:03');
    expect(formatElapsed(3_723_000)).toBe('1:02:03');
    expect(formatElapsed(-5)).toBe('0:00');
  });

  it('says how long a cell has run, and how many are ahead of a queued one', () => {
    expect(describeRun({ phase: 'running', since: 1000 }, 13_000)).toBe('Running 0:12');
    expect(describeRun({ phase: 'queued', ahead: 1 }, 0)).toBe('Queued, 1 cell ahead');
    expect(describeRun({ phase: 'queued', ahead: 3 }, 0)).toBe('Queued, 3 cells ahead');
  });
});

const code = (id: string): nbformat.ICodeCell => ({
  cell_type: 'code',
  id,
  source: id,
  metadata: {},
  outputs: [],
  execution_count: null,
});

/** JupyterLab's static signals, which tests emit as its actions would. */
const scheduled = (args: object) =>
  (NotebookActions.executionScheduled as unknown as Signal<unknown, object>).emit(args);
const finished = (args: object) =>
  (NotebookActions.executed as unknown as Signal<unknown, object>).emit(args);

describe('attachRunStatus', () => {
  let notebook: Notebook;
  let holder: HTMLDivElement;
  let clock: number;
  const interrupt = vi.fn();

  const model = (i: number) => notebook.model!.cells.get(i) as ICodeCellModel;
  const line = (i: number) =>
    notebook.widgets[i]!.node.querySelector<HTMLElement>(':scope > .gn-run-status');

  beforeEach(() => {
    vi.useFakeTimers();
    clock = 1_000_000;
    notebook = createNotebook(createRendermime('', {} as Contents.IManager));
    const m = new NotebookModel();
    m.fromJSON({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        code('a'),
        code('b'),
        code('c'),
        { cell_type: 'markdown', id: 'm', source: '#', metadata: {} },
      ],
    });
    notebook.model = m;
    holder = document.createElement('div');
    document.body.append(holder);
    Widget.attach(notebook, holder);
  });

  afterEach(() => {
    const m = notebook.model;
    notebook.dispose();
    m?.dispose();
    holder.remove();
    interrupt.mockClear();
    vi.useRealTimers();
  });

  it('shows the running cell’s time with Interrupt, and the queued ones', () => {
    const status = attachRunStatus(notebook, { interrupt, now: () => clock });
    expect(line(0)).toBeNull();

    model(0).executionState = 'running';
    model(1).executionState = 'running';
    expect(line(0)).toHaveTextContent('Running 0:00');
    expect(line(0)!.dataset.phase).toBe('running');
    expect(notebook.widgets[0]!.hasClass('gn-mod-running')).toBe(true);
    expect(line(1)).toHaveTextContent('Queued, 1 cell ahead');
    expect(notebook.widgets[1]!.hasClass('gn-mod-queued')).toBe(true);
    expect(line(1)!.querySelector('button')!.hidden).toBe(true);
    expect(line(2)).toBeNull();
    // Under the input, above the outputs.
    expect(line(0)!.previousElementSibling).toHaveClass('jp-Cell-inputWrapper');

    // The clock ticks each second.
    clock += 65_000;
    vi.advanceTimersByTime(1000);
    expect(line(0)).toHaveTextContent('Running 1:05');

    // Interrupt is next to the running cell.
    const stop = line(0)!.querySelector('button')!;
    expect(stop).toHaveTextContent('Interrupt');
    expect(stop.hidden).toBe(false);
    stop.click();
    expect(interrupt).toHaveBeenCalledOnce();

    // The first finishes: the next one runs, from then.
    model(0).executionState = 'idle';
    expect(line(0)).toBeNull();
    expect(notebook.widgets[0]!.hasClass('gn-mod-running')).toBe(false);
    expect(line(1)).toHaveTextContent('Running 0:00');

    model(1).executionState = 'idle';
    expect(line(1)).toBeNull();
    status.dispose();
  });

  it('drops a running cell that is deleted, so the next one runs', async () => {
    const status = attachRunStatus(notebook, { interrupt, now: () => clock });
    model(0).executionState = 'running';
    model(1).executionState = 'running';
    // JupyterLab reports a removed cell as undefined in oldValues.
    notebook.model!.sharedModel.deleteCell(0);
    await Promise.resolve();
    // b was queued behind a; it now runs.
    expect(line(0)).toHaveTextContent('Running 0:00');
    model(1).executionState = 'running';
    expect(line(1)).toHaveTextContent('Queued, 1 cell ahead');
    model(0).executionState = 'idle';
    model(1).executionState = 'idle';
    expect(notebook.node.querySelectorAll('.gn-run-status')).toHaveLength(0);
    status.dispose();
  });

  it('forgets a running cell that is moved, so the next run is not queued behind it', async () => {
    const status = attachRunStatus(notebook, { interrupt, now: () => clock });
    model(0).executionState = 'running';
    // A move is a delete plus an insert of a copy, which is not running.
    notebook.model!.sharedModel.moveCell(0, 2);
    await Promise.resolve();
    expect(notebook.node.querySelectorAll('.gn-run-status')).toHaveLength(0);
    model(0).executionState = 'running';
    expect(line(0)).toHaveTextContent('Running 0:00');
    model(0).executionState = 'idle';
    status.dispose();
  });

  describe('busy (#655)', () => {
    const cellOf = (i: number) => notebook.widgets[i]!;
    /** JupyterLab reports a cell it is about to run, then marks it running. */
    const start = (i: number) => {
      scheduled({ notebook, cell: cellOf(i) });
      model(i).executionState = 'running';
    };
    const executed = (i: number, success = true) => {
      model(i).executionState = 'idle';
      finished({ notebook, cell: cellOf(i), success });
    };

    it('is true while a run this page started is unfinished, and says when it changes', () => {
      const status = attachRunStatus(notebook, { interrupt, now: () => clock });
      const seen: boolean[] = [];
      status.busyChanged.connect((_, busy) => void seen.push(busy));
      expect(status.busy).toBe(false);
      start(0);
      start(1);
      expect(status.busy).toBe(true);
      executed(0);
      // One still waits: no change to report.
      expect(status.busy).toBe(true);
      executed(1, false);
      expect(status.busy).toBe(false);
      expect(seen).toEqual([true, false]);
      status.dispose();
    });

    it('ends when a run is cancelled, which sends no executed, or the queue is cleared', () => {
      const status = attachRunStatus(notebook, { interrupt, now: () => clock });
      start(0);
      model(0).executionState = 'idle';
      expect(status.busy).toBe(false);
      // The run is over: a peer running the same cell later isn't this page's.
      model(0).executionState = 'running';
      expect(status.busy).toBe(false);
      model(0).executionState = 'idle';
      start(2);
      status.clear();
      expect(status.busy).toBe(false);
      status.dispose();
    });

    it('ends on executed even when the cell is still marked running, as after an aborted reply', () => {
      const status = attachRunStatus(notebook, { interrupt, now: () => clock });
      start(0);
      expect(status.busy).toBe(true);
      finished({ notebook, cell: cellOf(0), success: false });
      expect(model(0).executionState).toBe('running');
      expect(status.busy).toBe(false);
      status.dispose();
    });

    it('stays busy when a running cell this page started is moved', async () => {
      const status = attachRunStatus(notebook, { interrupt, now: () => clock });
      start(0);
      const id = model(0).id;
      // A move recreates the cell's model, same id, and marks it running again.
      notebook.model!.sharedModel.moveCell(0, 2);
      await Promise.resolve();
      const moved = notebook.model!.cells.get(2) as ICodeCellModel;
      expect(moved.id).toBe(id);
      moved.executionState = 'running';
      expect(status.busy).toBe(true);
      moved.executionState = 'idle';
      expect(status.busy).toBe(false);
      status.dispose();
    });

    it('ignores a cell that was already running, or that another client marks running', () => {
      model(0).executionState = 'running';
      const status = attachRunStatus(notebook, { interrupt, now: () => clock });
      // Running when attached: the line shows it, but the page didn't start it.
      expect(line(0)).toHaveTextContent('Running');
      expect(status.busy).toBe(false);
      // A peer in the room marks another cell running.
      model(1).executionState = 'running';
      expect(status.busy).toBe(false);
      // A run in another notebook doesn't count either.
      scheduled({ notebook: {}, cell: cellOf(2) });
      model(2).executionState = 'running';
      expect(status.busy).toBe(false);
      // A run this page starts on a cell that no one else is running does.
      model(1).executionState = 'idle';
      start(1);
      expect(status.busy).toBe(true);
      // Another notebook's cell finishing, with the same cell id, isn't ours.
      finished({ notebook: {}, cell: cellOf(1), success: true });
      expect(status.busy).toBe(true);
      executed(1);
      expect(status.busy).toBe(false);
      status.dispose();
    });

    it('follows a real NotebookActions.run until the kernel replies', async () => {
      const status = attachRunStatus(notebook, { interrupt, now: () => clock });
      let reply!: (r: unknown) => void;
      const done = new Promise(resolve => (reply = resolve));
      const future = {
        done,
        onIOPub: undefined,
        onReply: undefined,
        onStdin: undefined,
        dispose() {},
      };
      const session = {
        hasNoKernel: false,
        isTerminating: false,
        pendingInput: false,
        session: { kernel: { requestExecute: () => future, name: 'k' } },
        kernelDisplayName: 'K',
      };
      notebook.activeCellIndex = 0;
      const running = NotebookActions.run(notebook, session as never);
      await Promise.resolve();
      expect(model(0).executionState).toBe('running');
      expect(status.busy).toBe(true);
      reply({ content: { status: 'ok', execution_count: 1 } });
      await running;
      expect(status.busy).toBe(false);
      status.dispose();
    });

    it('stops listening to JupyterLab once disposed', () => {
      const status = attachRunStatus(notebook, { interrupt, now: () => clock });
      const seen: boolean[] = [];
      status.busyChanged.connect((_, busy) => void seen.push(busy));
      // Another client's run is in the queue when the pane goes.
      model(0).executionState = 'running';
      status.dispose();
      scheduled({ notebook, cell: cellOf(0) });
      expect(status.busy).toBe(false);
      expect(seen).toEqual([]);
    });
  });

  it('forgets the queue when cleared, as on a restart', () => {
    const status = attachRunStatus(notebook, { interrupt, now: () => clock });
    model(0).executionState = 'running';
    model(2).executionState = 'running';
    status.clear();
    expect(line(0)).toBeNull();
    expect(line(2)).toBeNull();
    status.dispose();
  });

  it('stops tracking once disposed', () => {
    const status = attachRunStatus(notebook, { interrupt, now: () => clock });
    status.dispose();
    model(0).executionState = 'running';
    expect(line(0)).toBeNull();
  });
});
