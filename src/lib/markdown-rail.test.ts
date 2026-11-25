import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';

// The class that turns the active cell's rail into a short marker, on
// JupyterLab's real Notebook in jsdom. The marker's look is e2e's.

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { attachMarkdownRail, railIsShort, RAIL_LINES, TALL } = await import('./markdown-rail');
const { NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');

const markdown = (id: string, source: string): nbformat.IMarkdownCell => ({
  cell_type: 'markdown',
  id,
  source,
  metadata: {},
});

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    markdown('long', 'A long cell.\n'.repeat(RAIL_LINES + 4)),
    markdown('short', 'A short cell.'),
    { cell_type: 'code', id: 'code', source: 'io', metadata: {}, outputs: [], execution_count: 1 },
  ],
};

let notebook: Notebook;
let holder: HTMLDivElement;
let dispose: ReturnType<typeof attachMarkdownRail>;
/** The module's own ResizeObserver, captured as it is made (JupyterLab's
 * windowed list and CodeMirror make theirs too, and watch cells as well). */
let rail: (typeof observers)[number];

/** Every ResizeObserver made while the test runs (CodeMirror makes its own). */
const observers: {
  cb: (entries: { target: Element; contentRect: { height: number } }[]) => void;
  seen: Set<Element>;
}[] = [];

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      seen = new Set<Element>();
      constructor(cb: (entries: { target: Element; contentRect: { height: number } }[]) => void) {
        observers.push({ cb, seen: this.seen });
      }
      observe(node: Element) {
        this.seen.add(node);
      }
      unobserve(node: Element) {
        this.seen.delete(node);
      }
      disconnect() {
        this.seen.clear();
      }
    },
  );
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  dispose = attachMarkdownRail(notebook);
  rail = observers[observers.length - 1]!;
});

afterEach(() => {
  dispose.dispose();
  vi.unstubAllGlobals();
  observers.length = 0;
  const model = notebook.model;
  notebook.dispose();
  model?.dispose();
  holder.remove();
});

const cell = (i: number) => notebook.widgets[i]!;

describe('railIsShort', () => {
  it('is the rail until past its line budget, then the marker', () => {
    const lines = 24;
    expect(railIsShort(RAIL_LINES * lines, lines)).toBe(false);
    expect(railIsShort(RAIL_LINES * lines + 1, lines)).toBe(true);
  });
});

describe('attachMarkdownRail', () => {
  it('watches every Markdown cell, and only those', () => {
    expect([...rail.seen]).toEqual([cell(0).node, cell(1).node]);
  });

  it('marks a cell taller than the budget, and unmarks it when it shrinks', () => {
    const size = (long: number, short: number) =>
      rail.cb([
        { target: cell(0).node, contentRect: { height: long } },
        { target: cell(1).node, contentRect: { height: short } },
      ]);
    size(500, 100);
    expect(cell(0).hasClass(TALL)).toBe(true);
    expect(cell(1).hasClass(TALL)).toBe(false);
    size(100, 100);
    expect(cell(0).hasClass(TALL)).toBe(false);
  });

  it('marks a Markdown cell added later', async () => {
    notebook.model?.sharedModel.insertCell(3, { cell_type: 'markdown', source: 'Later.' });
    await vi.waitFor(() =>
      expect([...rail.seen]).toEqual([cell(0).node, cell(1).node, cell(3).node]),
    );
  });

  it('stops watching when disposed', () => {
    dispose.dispose();
    expect([...rail.seen]).toEqual([]);
  });
});
