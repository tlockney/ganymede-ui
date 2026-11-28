import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CodeCell } from '@jupyterlab/cells';
import type * as nbformat from '@jupyterlab/nbformat';
import { type Notebook, NotebookActions } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { setCollapsed } = await import('./code-collapse');
const { attachSourceExpand, countSourceLines, isLongSource, SOURCE_LINES } =
  await import('./source-expand');
const { NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');

const lines = (n: number) => Array.from({ length: n }, (_, i) => `x_${i} = ${i}`).join('\n');

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    {
      cell_type: 'code',
      id: 'short',
      source: 'x = 1\ny = 2',
      metadata: {},
      outputs: [],
      execution_count: null,
    },
    {
      cell_type: 'code',
      id: 'long',
      source: lines(SOURCE_LINES + 5),
      metadata: {},
      outputs: [],
      execution_count: 3,
    },
    {
      cell_type: 'markdown',
      id: 'md',
      source: lines(SOURCE_LINES + 10),
      metadata: {},
    },
  ],
};

let notebook: Notebook;
let holder: HTMLDivElement;
let sourceExpand: IDisposable;
let onExpand: ReturnType<typeof vi.fn<(cell: CodeCell, opener: HTMLElement) => void>>;

const cell = (i: number) => notebook.widgets[i]!;
const bar = (i: number) => cell(i).node.querySelector<HTMLElement>(':scope > .gn-source-bar');

beforeEach(() => {
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  onExpand = vi.fn();
  sourceExpand = attachSourceExpand(notebook, onExpand);
});

afterEach(() => {
  sourceExpand.dispose();
  notebook.dispose();
  holder.remove();
});

describe('countSourceLines / isLongSource (#822)', () => {
  it('counts logical lines ignoring a single trailing newline', () => {
    expect(countSourceLines('')).toBe(0);
    expect(countSourceLines('one')).toBe(1);
    expect(countSourceLines('one\n')).toBe(1);
    expect(countSourceLines(`${lines(SOURCE_LINES)}\n`)).toBe(SOURCE_LINES);
    expect(isLongSource(`${lines(SOURCE_LINES)}\n`)).toBe(false);
    expect(isLongSource(lines(SOURCE_LINES + 1))).toBe(true);
  });
});

describe('attachSourceExpand (#822)', () => {
  it('shows a bar only on long, uncollapsed code cells, right before the input wrapper', () => {
    expect(bar(0)).toBeNull();
    expect(bar(2)).toBeNull();

    const longBar = bar(1)!;
    expect(longBar).not.toBeNull();
    expect(longBar.querySelector('.gn-source-label')!.textContent).toBe(
      `${SOURCE_LINES + 5} lines`,
    );
    expect(longBar.querySelector('button')!.textContent).toBe('Expand source');
    expect(longBar.nextElementSibling).toBe(
      cell(1).node.querySelector(':scope > .jp-Cell-inputWrapper'),
    );
  });

  it('adds or updates the bar as source edits cross the line threshold', () => {
    expect(bar(0)).toBeNull();
    cell(0).model.sharedModel.setSource(lines(SOURCE_LINES + 2));
    expect(bar(0)?.querySelector('.gn-source-label')?.textContent).toBe(
      `${SOURCE_LINES + 2} lines`,
    );

    cell(0).model.sharedModel.setSource('short again');
    expect(bar(0)).toBeNull();
  });

  it('hides the bar while a long code cell is collapsed and brings it back on expand', async () => {
    expect(bar(1)).not.toBeNull();
    setCollapsed(cell(1), true, notebook);
    await Promise.resolve();
    expect(bar(1)).toBeNull();
    setCollapsed(cell(1), false, notebook);
    await Promise.resolve();
    expect(bar(1)).not.toBeNull();
  });

  it('removes the bar if a long code cell becomes markdown and returns if reverted', () => {
    notebook.activeCellIndex = 1;
    NotebookActions.changeCellType(notebook, 'markdown');
    expect(bar(1)).toBeNull();
    NotebookActions.changeCellType(notebook, 'code');
    expect(bar(1)).not.toBeNull();
  });

  it('invokes onExpand with the cell and button without activating a different cell', () => {
    notebook.activeCellIndex = 0;
    const button = bar(1)!.querySelector<HTMLButtonElement>('button')!;
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    button.click();
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(onExpand).toHaveBeenCalledWith(cell(1), button);
    expect(notebook.activeCellIndex).toBe(0);
  });
});
