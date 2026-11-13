import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { Contents } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';

// Collapsing code (#564) on JupyterLab's real Notebook in jsdom: the
// disclosure button, the commands, and the saved `source_hidden`. How the
// button looks is left to e2e.

globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createCommands, createNotebook, createRendermime } = await import('./jupyterlab');
const { attachCodeCollapse, setCollapsed } = await import('./code-collapse');
const { NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    {
      cell_type: 'code',
      id: 'a',
      source: 'const io = 1;\nio + 1',
      metadata: {},
      outputs: [],
      execution_count: null,
    },
    { cell_type: 'markdown', id: 'b', source: '# Moons', metadata: {} },
    {
      cell_type: 'code',
      id: 'c',
      source: 'europa',
      metadata: { jupyter: { source_hidden: true } },
      outputs: [],
      execution_count: null,
    },
  ],
};

let notebook: Notebook;
let holder: HTMLDivElement;
let collapse: IDisposable;

const cell = (i: number) => notebook.widgets[i]!;
const toggle = (i: number) =>
  cell(i).node.querySelector<HTMLButtonElement>(':scope > .gn-code-toggle');
const hidden = (i: number) =>
  (cell(i).model.getMetadata('jupyter') as { source_hidden?: boolean } | undefined)
    ?.source_hidden === true;

beforeEach(() => {
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  collapse = attachCodeCollapse(notebook);
});

afterEach(() => {
  collapse.dispose();
  notebook.dispose();
  holder.remove();
});

describe('attachCodeCollapse', () => {
  it('gives code cells a button, not Markdown cells', () => {
    expect(toggle(0)).not.toBeNull();
    expect(toggle(1)).toBeNull();
    expect(toggle(2)).not.toBeNull();
  });

  it('starts from the saved state', () => {
    expect(cell(2).inputHidden).toBe(true);
    expect(toggle(2)!.getAttribute('aria-expanded')).toBe('false');
    expect(toggle(0)!.getAttribute('aria-label')).toBe('Collapse Code');
  });

  it('collapses and expands on a click, and saves it in the notebook', () => {
    toggle(0)!.click();
    expect(cell(0).inputHidden).toBe(true);
    expect(hidden(0)).toBe(true);
    // The first line, in its place (`innerText`, which jsdom keeps as set).
    expect(cell(0).node.querySelector<HTMLElement>('.jp-PlaceholderText')?.innerText).toBe(
      'const io = 1;',
    );
    expect(toggle(0)!.getAttribute('aria-label')).toBe('Expand Code');
    toggle(0)!.click();
    expect(cell(0).inputHidden).toBe(false);
    expect(hidden(0)).toBe(false);
  });

  it('follows a change to the metadata from elsewhere', () => {
    cell(0).model.setMetadata('jupyter', { source_hidden: true });
    expect(cell(0).inputHidden).toBe(true);
    expect(toggle(0)!.getAttribute('aria-expanded')).toBe('false');
  });

  it('decorates cells added later', async () => {
    notebook.model!.sharedModel.insertCell(3, { cell_type: 'code', source: 'callisto' });
    await Promise.resolve();
    expect(toggle(3)).not.toBeNull();
  });

  it('leaves a Markdown cell alone', () => {
    setCollapsed(cell(1), true);
    expect(cell(1).inputHidden).toBe(false);
  });

  it('still expands a collapsed code cell changed to Markdown', async () => {
    notebook.activeCellIndex = 2;
    const { NotebookActions } = await import('@jupyterlab/notebook');
    NotebookActions.changeCellType(notebook, 'markdown');
    await Promise.resolve();
    expect(cell(2).model.type).toBe('markdown');
    expect(cell(2).inputHidden).toBe(true);
    toggle(2)!.click();
    expect(cell(2).inputHidden).toBe(false);
    // Expanded, a Markdown cell has nothing to collapse: no button.
    expect(toggle(2)).toBeNull();
    // Collapsed again from elsewhere (undo, the agent), it gets one back.
    cell(2).model.setMetadata('jupyter', { source_hidden: true });
    expect(cell(2).inputHidden).toBe(true);
    expect(toggle(2)?.getAttribute('aria-expanded')).toBe('false');
  });

  it('takes the notebook to command mode when it collapses the cell being edited', () => {
    notebook.activeCellIndex = 0;
    notebook.mode = 'edit';
    toggle(0)!.click();
    expect(notebook.mode).toBe('command');
  });
});

describe('collapse commands', () => {
  it('collapse and expand the selected cell, or every code cell', async () => {
    const commands = createCommands(notebook, {} as ISessionContext);
    notebook.activeCellIndex = 0;
    await commands.execute('collapse-code');
    expect(cell(0).inputHidden).toBe(true);
    await commands.execute('expand-all-code');
    expect([0, 2].map(i => cell(i).inputHidden)).toEqual([false, false]);
    await commands.execute('collapse-all-code');
    expect([0, 2].map(i => hidden(i))).toEqual([true, true]);
    notebook.activeCellIndex = 2;
    await commands.execute('expand-code');
    expect(cell(2).inputHidden).toBe(false);
    expect(cell(0).inputHidden).toBe(true);
  });

  it('collapse leaves edit mode only for a code cell; expand all covers a collapsed Markdown cell', async () => {
    const commands = createCommands(notebook, {} as ISessionContext);
    notebook.activeCellIndex = 0;
    notebook.mode = 'edit';
    await commands.execute('collapse-code');
    expect(notebook.mode).toBe('command');
    // Editing a Markdown cell, which doesn't collapse: still editing.
    notebook.activeCellIndex = 1;
    notebook.mode = 'edit';
    await commands.execute('collapse-all-code');
    expect(notebook.mode).toBe('edit');
    expect(cell(1).inputHidden).toBe(false);
    cell(1).inputHidden = true;
    await commands.execute('expand-all-code');
    expect(notebook.widgets.map(c => c.inputHidden)).toEqual([false, false, false]);
  });
});
