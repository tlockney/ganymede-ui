import '../test/notebook-env';
import { afterEach, describe, expect, it } from 'vitest';
import type { ICodeCellModel } from '@jupyterlab/cells';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';

// The labels on JupyterLab's real Notebook in jsdom; how they look is e2e's.

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const {
  attachOutputLabels,
  formatOutputTime,
  labelFor,
  isInterrupt,
  LOG_LINES,
  outputKinds,
  PANE_GUTTER,
  pastColumn,
  WIDE,
  WIDE_SLACK,
} = await import('./output-labels');
const { attachRunStatus } = await import('./run-status');
const { NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');

const cellWith = (id: string, outputs: nbformat.IOutput[]): nbformat.ICodeCell => ({
  cell_type: 'code',
  id,
  source: '',
  metadata: {},
  outputs,
  execution_count: 1,
});

const stream = (name: 'stdout' | 'stderr', text: string): nbformat.IStream => ({
  output_type: 'stream',
  name,
  text,
});
const error: nbformat.IError = {
  output_type: 'error',
  ename: 'ZeroDivisionError',
  evalue: 'division by zero',
  traceback: ['Traceback (most recent call last)', '  File "<cell>", line 1', 'ZeroDivisionError'],
};
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n') + '\n';

let notebook: Notebook;
let holder: HTMLDivElement;
let clock = 0;
let labels: ReturnType<typeof attachOutputLabels> | undefined;
let runs: ReturnType<typeof attachRunStatus> | undefined;

function open(cells: nbformat.ICodeCell[]) {
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells });
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  // The meta line's "saved output" and time come from the run queue (#852).
  runs = attachRunStatus(notebook, { interrupt: () => {}, now: () => clock });
  labels = attachOutputLabels(notebook, { runs });
}

afterEach(() => {
  if (!labels) return;
  labels.dispose();
  labels = undefined;
  runs?.dispose();
  runs = undefined;
  const model = notebook.model;
  notebook.dispose();
  model?.dispose();
  holder.remove();
});

const bars = () => [...notebook.node.querySelectorAll<HTMLElement>('.gn-output-bar')];
const settle = () => new Promise(r => setTimeout(r, 0));

describe('labelFor', () => {
  it('leads an error with its exception summary', () => {
    expect(labelFor(error)).toEqual({
      label: 'Execution failed',
      kind: 'error',
      summary: 'ZeroDivisionError: division by zero',
    });
  });

  it('calls an interrupt stopped, not failed', () => {
    expect(labelFor({ ...error, ename: 'KeyboardInterrupt', evalue: '' })).toMatchObject({
      label: 'Execution stopped',
      summary: 'KeyboardInterrupt:',
    });
  });

  it('calls this app’s own interrupts stopped too', () => {
    // cdp-kernel's kernels (this browser, the apps' in-app kernel) say
    // `Interrupted: Execution interrupted`, not `KeyboardInterrupt`.
    expect(labelFor({ ...error, ename: 'Interrupted', evalue: 'Execution interrupted' })).toEqual({
      label: 'Execution stopped',
      kind: 'stopped',
      summary: 'Interrupted: Execution interrupted',
    });
    expect(isInterrupt('KeyboardInterrupt')).toBe(true);
    expect(isInterrupt('Interrupted')).toBe(true);
    expect(isInterrupt('ValueError')).toBe(false);
    expect(isInterrupt(undefined)).toBe(false);
  });

  it('labels stderr a warning, and stdout nothing', () => {
    expect(labelFor(stream('stderr', 'careful\n'))).toMatchObject({ label: 'Warning' });
    expect(labelFor(stream('stdout', 'hi\n'))).toMatchObject({ label: '' });
    expect(labelFor({ output_type: 'display_data', data: {}, metadata: {} })).toBeUndefined();
  });

  it('labels a long stdout log by its line count', () => {
    // The bar of a collapsed log says what it holds, not just a border.
    expect(labelFor(stream('stdout', lines(LOG_LINES + 5)))!.label).toBe(
      `Log, ${LOG_LINES + 5} lines`,
    );
  });

  it('counts a stream’s lines, accepting a list of lines', () => {
    expect(labelFor(stream('stdout', lines(5)))!.lines).toBe(5);
    expect(labelFor({ output_type: 'stream', name: 'stdout', text: ['a\n', 'b\n'] })!.lines).toBe(
      2,
    );
  });
});

describe('attachOutputLabels (#813)', () => {
  it('shows "Execution failed" and the exception summary above the traceback', async () => {
    open([cellWith('a', [error])]);
    await settle();
    const [bar] = bars();
    expect(bar!.dataset.kind).toBe('error');
    expect(bar!.querySelector('.gn-output-label')!.textContent).toBe('Execution failed');
    expect(bar!.querySelector('.gn-output-summary')!.textContent).toBe(
      'ZeroDivisionError: division by zero',
    );
    // First in the output, before the traceback.
    expect(bar!.parentElement!.firstElementChild).toBe(bar);
  });

  it('labels stderr "Warning", and a plain short stream gets no bar', async () => {
    open([
      cellWith('a', [stream('stderr', 'careful\n')]),
      cellWith('b', [stream('stdout', 'hi\n')]),
    ]);
    await settle();
    expect(bars().map(b => b.textContent)).toEqual(['Warning']);
  });

  it('opens a re-run at its tail again once the outputs are cleared', async () => {
    open([cellWith('a', [stream('stdout', lines(LOG_LINES + 5))])]);
    await settle();
    bars()[0]!.querySelector<HTMLButtonElement>('button')!.click();
    await settle();
    expect(
      notebook.node.querySelector('.jp-OutputArea-output')!.classList.contains('gn-log-full'),
    ).toBe(true);
    // A re-run clears the cell's outputs, then adds the new one: what was
    // opened to the full log belonged to the outputs that are gone.
    const cell = notebook.model!.cells.get(0) as ICodeCellModel;
    cell.outputs.clear();
    cell.outputs.add(stream('stdout', lines(LOG_LINES + 3)));
    await settle();
    const rerun = notebook.node.querySelector<HTMLElement>('.jp-OutputArea-output')!;
    expect(rerun.classList.contains('gn-log-tail')).toBe(true);
    expect(bars()[0]!.querySelector('button')!.textContent).toBe('View full log');
  });

  it('keeps counting a stream as it grows', async () => {
    open([cellWith('a', [stream('stdout', lines(LOG_LINES + 5))])]);
    await settle();
    expect(bars()[0]!.textContent).toContain(`Log, ${LOG_LINES + 5} lines`);
    // Contiguous streams combine into one output, whose text grows.
    const cell = notebook.model!.cells.get(0) as ICodeCellModel;
    cell.outputs.add(stream('stdout', 'one more line\n'));
    await settle();
    expect(bars()[0]!.textContent).toContain(`Log, ${LOG_LINES + 6} lines`);
  });

  it('collapses a long stream to its tail and opens it with View full log', async () => {
    open([cellWith('a', [stream('stdout', lines(LOG_LINES + 5))])]);
    await settle();
    const out = notebook.node.querySelector<HTMLElement>('.jp-OutputArea-output')!;
    expect(out.classList.contains('gn-log-tail')).toBe(true);
    const button = bars()[0]!.querySelector<HTMLButtonElement>('button')!;
    expect(button.textContent).toBe('View full log');
    button.click();
    await settle();
    expect(out.classList.contains('gn-log-full')).toBe(true);
    expect(out.classList.contains('gn-log-tail')).toBe(false);
    const back = bars()[0]!.querySelector<HTMLButtonElement>('button')!;
    expect(back.textContent).toBe('Show last lines');
    expect(back.getAttribute('aria-expanded')).toBe('true');
    back.click();
    await settle();
    expect(out.classList.contains('gn-log-tail')).toBe(true);
  });

  it('leaves a stream of exactly the limit whole', async () => {
    open([cellWith('a', [stream('stdout', lines(LOG_LINES))])]);
    await settle();
    expect(bars()).toHaveLength(0);
    expect(notebook.node.querySelector('.gn-log-tail')).toBeNull();
  });

  it('keeps one bar when the output is looked at again', async () => {
    open([cellWith('a', [error])]);
    await settle();
    labels!.refresh();
    await settle();
    expect(bars()).toHaveLength(1);
  });

  it('says what a cell’s outputs are, and how long the run took, below them (#852)', async () => {
    open([cellWith('a', [stream('stdout', 'hi\n'), image])]);
    await settle();
    const metas = () => notebook.node.querySelectorAll<HTMLElement>('.gn-output-meta');
    expect(metas()).toHaveLength(1);
    // The outputs are the file's until this page runs the cell.
    expect(metas()[0]!.textContent).toBe('saved output');
    // The output area is above it: the meta line comes last in the cell.
    const area = notebook.widgets[0]!.node.querySelector('.jp-OutputArea')!;
    expect(area.lastElementChild).toBe(metas()[0]);

    const model = notebook.widgets[0]!.model as ICodeCellModel;
    clock = 38;
    model.executionState = 'running';
    await settle();
    expect(metas()[0]!.textContent).toBe('Text · Image');
    clock = 138;
    model.executionState = 'idle';
    await settle();
    expect(metas()[0]!.textContent).toBe('Text · Image · 100 ms');
  });

  it('says saved output below them until this page runs the cell (#852)', async () => {
    open([cellWith('a', [stream('stdout', 'hi\n')]), cellWith('b', [])]);
    await settle();
    const saved = () => notebook.node.querySelectorAll<HTMLElement>('.gn-output-meta');
    expect(saved()).toHaveLength(1);
    expect(saved()[0]!.textContent).toBe('saved output');
    expect(saved()[0]!.title).toBe('Saved with the notebook. Run the cell to replace it.');
    // A kernel, running or not, doesn't change what the file held: only a
    // run here does.
    labels!.refresh();
    await settle();
    expect(saved()[0]!.textContent).toBe('saved output');
    const model = notebook.widgets[0]!.model as ICodeCellModel;
    clock = 2000;
    model.executionState = 'running';
    await settle();
    // The run underway is the gutter's to count, not the line's.
    expect(saved()[0]!.textContent).toBe('Text');
    clock = 2040;
    model.executionState = 'idle';
    await settle();
    expect(saved()[0]!.textContent).toBe('Text · 40 ms');
    expect(saved()[0]!.hasAttribute('title')).toBe(false);
  });
});

describe('the meta line’s words (#852)', () => {
  it('names each kind of output once, in order', () => {
    expect(outputKinds([stream('stdout', 'hi\n'), stream('stderr', 'hmm\n')])).toEqual([
      'Text',
      'Warning',
    ]);
    expect(outputKinds([image, stream('stdout', 'x'), error])).toEqual(['Image', 'Text', 'Error']);
    expect(
      outputKinds([
        { output_type: 'display_data', data: { 'image/svg+xml': '<svg/>' }, metadata: {} },
        { output_type: 'display_data', data: { 'text/html': '<table></table>' }, metadata: {} },
      ]),
    ).toEqual(['SVG', 'Table']);
    // Nothing to name: a widget or an unknown mime type.
    expect(outputKinds([])).toEqual([]);
    expect(outputKinds([{ output_type: 'display_data', data: {}, metadata: {} }])).toEqual([]);
  });

  it('writes a run’s time to a fixed precision', () => {
    expect(formatOutputTime(38)).toBe('38 ms');
    expect(formatOutputTime(999.4)).toBe('999 ms');
    expect(formatOutputTime(1000)).toBe('1 s');
    expect(formatOutputTime(1240)).toBe('1.2 s');
    expect(formatOutputTime(18_400)).toBe('18 s');
    expect(formatOutputTime(Number.NaN)).toBe('');
  });
});

// Wide charts and tables (#814): an image's own width or a table's content
// past the column the cell's outputs sit in goes wide; a stream never does.
const image: nbformat.IDisplayData = {
  output_type: 'display_data',
  data: { 'image/png': 'iVBORw0KGgo=' },
  metadata: {},
};
const table = (names: string[], rows: string[][]): nbformat.IDisplayData => ({
  output_type: 'display_data',
  data: {
    'application/vnd.dataresource+json': {
      schema: { fields: names.map(name => ({ name })) },
      data: rows,
    },
  },
  metadata: {},
});

describe('pastColumn', () => {
  it('goes wide past the column and back under it, both with slack', () => {
    const column = 800;
    expect(pastColumn(column + WIDE_SLACK, column, false)).toBe(false);
    expect(pastColumn(column + WIDE_SLACK + 1, column, false)).toBe(true);
    expect(pastColumn(column - WIDE_SLACK, column, true)).toBe(true);
    expect(pastColumn(column - WIDE_SLACK - 1, column, true)).toBe(false);
  });

  it('keeps what it has within the slack, and never widens nothing measured', () => {
    const column = 800;
    expect(pastColumn(column, column, true)).toBe(true);
    expect(pastColumn(column, column, false)).toBe(false);
    expect(pastColumn(0, column, true)).toBe(false);
    expect(pastColumn(-1, column, true)).toBe(false);
  });
});

describe('wide outputs', () => {
  const outs = () => [...notebook.node.querySelectorAll<HTMLElement>('.jp-OutputArea-output')];

  /** Lay each output out in a row 800px wide, past a 56px prompt. */
  const layout = () => {
    for (const out of outs()) {
      const child = out.closest<HTMLElement>('.jp-OutputArea-child');
      const prompt = child?.querySelector<HTMLElement>('.jp-OutputPrompt');
      if (!child || !prompt) throw new Error('no output row');
      Object.defineProperty(child, 'clientWidth', { value: 800, configurable: true });
      Object.defineProperty(prompt, 'clientWidth', { value: 56, configurable: true });
    }
  };

  it('marks an image or table wider than the column, and not what fits or a stream', async () => {
    open([
      cellWith('img', [image]),
      cellWith('table', [table(['a', 'b'], [['one', 'two']])]),
      cellWith('log', [stream('stdout', lines(2))]),
    ]);
    await settle();
    layout();
    const [img, tbl, log] = outs();
    Object.defineProperty(img.querySelector('img')!, 'naturalWidth', {
      value: 900,
      configurable: true,
    });
    Object.defineProperty(tbl.querySelector('.gm-table-scroll table')!, 'scrollWidth', {
      value: 400,
      configurable: true,
    });
    labels!.refresh();
    await settle();
    expect(img.classList.contains(WIDE)).toBe(true);
    expect(tbl.classList.contains(WIDE)).toBe(false);
    expect(log.classList.contains(WIDE)).toBe(false);
  });

  it('waits for an image that has not loaded, and widens it when it has', async () => {
    open([cellWith('img', [image])]);
    await settle();
    layout();
    labels!.refresh();
    await settle();
    const [img] = outs();
    expect(img.classList.contains(WIDE)).toBe(false);
    const el = img.querySelector('img')!;
    Object.defineProperty(el, 'naturalWidth', { value: 1200, configurable: true });
    el.dispatchEvent(new Event('load'));
    await settle();
    expect(img.classList.contains(WIDE)).toBe(true);
  });

  it('keeps a wide output within the slack of the column, and drops it past it', async () => {
    open([cellWith('img', [image])]);
    await settle();
    layout();
    const [img] = outs();
    Object.defineProperty(img.querySelector('img')!, 'naturalWidth', {
      value: 900,
      configurable: true,
    });
    labels!.refresh();
    await settle();
    expect(img.classList.contains(WIDE)).toBe(true);
    // The window widens: 895 is within the slack of 900, so the class stays;
    // 1000 is past it, so it goes. The resize is what brings the new column.
    for (const [row, expectWide] of [
      [951, true],
      [1056, false],
    ] as const) {
      Object.defineProperty(img.closest('.jp-OutputArea-child')!, 'clientWidth', {
        value: row,
        configurable: true,
      });
      window.dispatchEvent(new Event('resize'));
      await settle();
      expect(img.classList.contains(WIDE)).toBe(expectWide);
    }
  });

  it('tells jupyter.css how wide the pane a wide output spans is', async () => {
    open([cellWith('img', [image])]);
    await settle();
    // The notebook's scroll area carries the span jupyter.css gives a wide
    // output, as a custom property: its client width, less the gutter.
    const outer = notebook.node.querySelector<HTMLElement>('.jp-WindowedPanel-outer')!;
    expect(outer).toBeTruthy();
    Object.defineProperty(outer, 'clientWidth', { value: 1000, configurable: true });
    labels!.refresh();
    await settle();
    expect(outer.style.getPropertyValue('--gn-pane')).toBe(`${1000 - 2 * PANE_GUTTER}px`);
  });
});
