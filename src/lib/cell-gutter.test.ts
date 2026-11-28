import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ICodeCellModel } from '@jupyterlab/cells';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import type { CellGutter } from './cell-gutter';

// The run gutter on JupyterLab's real Notebook in jsdom (#852): the button,
// the count and the elapsed slot. What it looks like is e2e's.

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { attachCellGutter, EXEC_COUNT, GUTTER, RUN_BUTTON, RUN_ELAPSED } =
  await import('./cell-gutter');
const { attachRunStatus } = await import('./run-status');
const { NotebookActions, NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');

const code = (id: string): nbformat.ICodeCell => ({
  cell_type: 'code',
  id,
  source: 'io',
  metadata: {},
  outputs: [],
  execution_count: null,
});

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [code('a'), { cell_type: 'markdown', id: 'b', metadata: {}, source: '# Io' }, code('c')],
};

let notebook: Notebook;
let holder: HTMLDivElement;
let gutter: CellGutter;
let runs: ReturnType<typeof attachRunStatus>;
let run: ReturnType<typeof vi.fn<(cell: unknown) => void>>;
let clock: number;

const cell = (i: number) => notebook.widgets[i]!;
const gutterOf = (i: number) => cell(i).node.querySelector<HTMLElement>(`.${GUTTER}`);
const buttonOf = (i: number) => gutterOf(i)!.querySelector<HTMLButtonElement>(`.${RUN_BUTTON}`)!;
const countOf = (i: number) => gutterOf(i)!.querySelector<HTMLElement>(`.${EXEC_COUNT}`)!;
const elapsedOf = (i: number) => gutterOf(i)!.querySelector<HTMLElement>(`.${RUN_ELAPSED}`)!;
const setState = (i: number, state: ICodeCellModel['executionState']) =>
  ((cell(i).model as ICodeCellModel).executionState = state);

beforeEach(() => {
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  run = vi.fn<(cell: unknown) => void>();
  clock = 0;
  // The gutter asks the run queue (#852), so the notebook's real one drives it.
  runs = attachRunStatus(notebook, { interrupt: vi.fn(), now: () => clock });
  gutter = attachCellGutter(notebook, { run, runs, now: () => clock });
});

afterEach(() => {
  gutter.dispose();
  runs.dispose();
  const model = notebook.model;
  notebook.dispose();
  model?.dispose();
  holder.remove();
});

describe('attachCellGutter (#852)', () => {
  it('puts a named Run cell button and a count in a code cell’s margin only', () => {
    expect(gutterOf(0)).not.toBeNull();
    expect(gutterOf(2)).not.toBeNull();
    expect(gutterOf(1)).toBeNull();
    expect(buttonOf(0).getAttribute('aria-label')).toBe('Run cell');
    expect(buttonOf(0).title).toBe('Run cell');
    expect(cell(0).node.contains(gutterOf(0))).toBe(true);
    // Never run: no count yet.
    expect(countOf(0).textContent).toBe('–');
  });

  it('runs that cell when pressed, and disables the button while read-only or away', () => {
    buttonOf(2).click();
    expect(run).toHaveBeenCalledWith(cell(2));
    gutter.dispose();
    run.mockClear();
    let locked = true;
    gutter = attachCellGutter(notebook, { run, runs, away: () => locked });
    expect(buttonOf(0).disabled).toBe(true);
    buttonOf(0).click();
    expect(run).not.toHaveBeenCalled();
    locked = false;
    gutter.refresh();
    expect(buttonOf(0).disabled).toBe(false);
    buttonOf(0).click();
    expect(run).toHaveBeenCalledWith(cell(0));
  });

  it('shows the execution count as the model has it', () => {
    (cell(0).model as ICodeCellModel).executionCount = 9;
    expect(countOf(0).textContent).toBe('9');
  });

  it('says Running, N s while the cell runs, with room kept for the time (#812)', () => {
    vi.useFakeTimers();
    try {
      setState(0, 'running');
      expect(buttonOf(0).getAttribute('aria-label')).toBe('Running, 0 s');
      expect(buttonOf(0).disabled).toBe(true);
      expect(elapsedOf(0).textContent).toBe('0 s');
      // The slot is invisible but there, so the button and count never move.
      expect(elapsedOf(0).style.visibility).toBe('visible');
      clock = 3000;
      vi.advanceTimersByTime(1000);
      expect(buttonOf(0).getAttribute('aria-label')).toBe('Running, 3 s');
      expect(elapsedOf(0).textContent).toBe('3 s');
      setState(0, 'idle');
      expect(buttonOf(0).getAttribute('aria-label')).toBe('Run cell');
      expect(buttonOf(0).disabled).toBe(false);
      expect(elapsedOf(0).style.visibility).toBe('hidden');
      expect(elapsedOf(0).textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('says what a queued cell waits behind, with no time of its own', () => {
    vi.useFakeTimers();
    try {
      setState(0, 'running');
      // A second cell started while the first runs waits in the queue.
      setState(2, 'running');
      expect(buttonOf(2).getAttribute('aria-label')).toBe('Queued');
      expect(buttonOf(2).disabled).toBe(true);
      // Queued has no seconds to count: only a running cell ticks.
      expect(elapsedOf(2).textContent).toBe('');
      expect(elapsedOf(2).style.visibility).toBe('hidden');
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes a removed cell’s gutter and listeners away', async () => {
    const gutterEl = gutterOf(0)!;
    // Deleting a cell disposes its widget, which is when its gutter goes.
    notebook.activeCellIndex = 0;
    NotebookActions.deleteCells(notebook);
    await new Promise(r => setTimeout(r, 0));
    expect(gutterEl.isConnected).toBe(false);
    // The cells that are still there still have theirs.
    expect(notebook.widgets.map(w => w.node.querySelectorAll(`.${GUTTER}`).length)).toEqual([0, 1]);
    // Disposing the gutter after that takes those too, and is not a second
    // teardown of the one already gone.
    expect(() => gutter.dispose()).not.toThrow();
    expect(notebook.widgets.every(w => !w.node.querySelector(`.${GUTTER}`))).toBe(true);
  });

  it('adds a gutter to cells added later, and takes it away when disposed', async () => {
    notebook.activeCellIndex = 0;
    NotebookActions.insertBelow(notebook);
    await new Promise(r => setTimeout(r, 0));
    expect(gutterOf(1)).not.toBeNull();
    gutter.dispose();
    expect(notebook.widgets.every(w => !w.node.querySelector(`.${GUTTER}`))).toBe(true);
  });
});
