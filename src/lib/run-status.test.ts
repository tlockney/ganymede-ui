import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICodeCellModel } from '@jupyterlab/cells';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';

// The queue on its own, and the lines on JupyterLab's real Notebook in
// jsdom, with cells marked running as `CodeCell.execute` marks them.

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { RunQueue, attachRunStatus, describeRun, formatElapsed } = await import('./run-status');
const { NotebookModel } = await import('@jupyterlab/notebook');
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
