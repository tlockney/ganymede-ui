import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
const { attachOutputLabels, labelFor, isInterrupt, LOG_LINES } = await import('./output-labels');
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
let kernel = true;
let labels: ReturnType<typeof attachOutputLabels> | undefined;

function open(cells: nbformat.ICodeCell[]) {
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells });
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  labels = attachOutputLabels(notebook, { hasKernel: () => kernel });
}

beforeEach(() => {
  kernel = true;
});

afterEach(() => {
  if (!labels) return;
  labels.dispose();
  labels = undefined;
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

  it('says Saved output only while there is no kernel, for cells with outputs', async () => {
    kernel = false;
    open([cellWith('a', [stream('stdout', 'hi\n')]), cellWith('b', [])]);
    await settle();
    const saved = () => notebook.node.querySelectorAll('.gn-saved-output');
    expect(saved()).toHaveLength(1);
    expect(saved()[0]!.textContent).toBe('Saved output');
    kernel = true;
    labels!.refresh();
    expect(saved()).toHaveLength(0);
  });
});
