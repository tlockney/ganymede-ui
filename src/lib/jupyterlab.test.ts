import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import { Signal } from '@lumino/signaling';
import type { IDisposable } from '@lumino/disposable';

// JupyterLab's real Notebook, CodeMirror editors and commands in jsdom, with
// a fake kernel answering `complete_request` and `inspect_request`. What the
// popups look like, and the keyboard, are left to the end-to-end suite.

// ReactWidget (the find bar) waits for an idle callback after rendering.
globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;
// CodeMirror measures text; jsdom has no layout.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { attachEditing, createCommands, createNotebook, createRendermime } = await import(
  './jupyterlab'
);
const { NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    { cell_type: 'code', id: 'a', source: 'moons = 4\nprint', metadata: {}, outputs: [], execution_count: null },
    { cell_type: 'markdown', id: 'b', source: 'Ganymede and Io', metadata: {} },
  ],
};

function fakeKernel() {
  return {
    requestComplete: vi.fn(async () => ({
      content: { status: 'ok', matches: ['moons'], cursor_start: 0, cursor_end: 2, metadata: {} },
    })),
    requestInspect: vi.fn(async () => ({
      content: { status: 'ok', found: true, data: { 'text/plain': 'print(*args)' }, metadata: {} },
    })),
  };
}

let notebook: Notebook;
let editing: IDisposable;
let kernel: ReturnType<typeof fakeKernel>;
let holder: HTMLDivElement;
let commands: ReturnType<typeof createCommands>;

beforeEach(() => {
  kernel = fakeKernel();
  const owner = {};
  const session = {
    session: { kernel },
    sessionChanged: new Signal(owner),
    kernelChanged: new Signal(owner),
  } as unknown as ISessionContext;
  const rendermime = createRendermime('', {} as Contents.IManager);
  notebook = createNotebook(rendermime);
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  notebook.activeCellIndex = 0;
  commands = createCommands(notebook, session);
  editing = attachEditing(notebook, session, rendermime, commands);
});

afterEach(() => {
  editing.dispose();
  const model = notebook.model;
  notebook.dispose();
  model?.dispose();
  holder.remove();
});

const binding = (command: string) => commands.keyBindings.filter(b => b.command === command);

describe('attachEditing', () => {
  it('binds JupyterLab’s keys to completion, inspection and find', () => {
    const id = notebook.id;
    expect(binding('completer:invoke')).toMatchObject([
      { keys: ['Tab'], selector: `#${id}.jp-mod-editMode .jp-mod-completer-enabled` },
    ]);
    expect(binding('completer:select')).toMatchObject([
      { keys: ['Enter'], selector: `#${id} .jp-mod-completer-active` },
    ]);
    expect(binding('tooltip:launch')[0]!.keys).toEqual(['Shift Tab']);
    expect(binding('tooltip:launch')[0]!.selector).toContain(':not(.jp-mod-completer-active)');
    expect(binding('find').map(b => b.selector)).toEqual([`#${id}`, `#${id}-search`]);
    expect(binding('find-close')).toMatchObject([{ keys: ['Escape'], selector: `#${id}-search` }]);
  });

  it('asks the kernel for completions at the cursor', async () => {
    const editor = notebook.activeCell!.editor!;
    editor.setCursorPosition({ line: 1, column: 2 });
    await vi.waitFor(() => expect(commands.hasCommand('completer:invoke')).toBe(true));
    // The completer is wired to the active cell asynchronously.
    await vi.waitFor(async () => {
      await commands.execute('completer:invoke');
      expect(kernel.requestComplete).toHaveBeenCalled();
    });
    expect(kernel.requestComplete).toHaveBeenLastCalledWith({
      code: 'moons = 4\nprint',
      cursor_pos: 12,
    });
  });

  it('shows the kernel’s inspection in a tooltip, and dismisses it', async () => {
    notebook.activeCell!.editor!.setCursorPosition({ line: 1, column: 5 });
    await commands.execute('tooltip:launch');
    expect(kernel.requestInspect).toHaveBeenCalledWith({
      code: 'moons = 4\nprint',
      cursor_pos: 15,
      detail_level: 0,
    });
    const tooltip = document.querySelector('.jp-Tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip!.textContent).toContain('print(*args)');
    await commands.execute('tooltip:dismiss');
    expect(document.querySelector('.jp-Tooltip')).toBeNull();
  });

  it('shows no tooltip when the kernel finds nothing', async () => {
    kernel.requestInspect.mockResolvedValueOnce({
      content: { status: 'ok', found: false, data: {}, metadata: {} },
    } as never);
    await commands.execute('tooltip:launch');
    expect(document.querySelector('.jp-Tooltip')).toBeNull();
  });

  it('opens the find bar next to the notebook, and closes it', async () => {
    await commands.execute('find');
    const bar = holder.querySelector(':scope > .jp-DocumentSearch-overlay');
    expect(bar).not.toBeNull();
    expect(bar!.id).toBe(`${notebook.id}-search`);
    // Rendered by React, a moment later.
    await vi.waitFor(() => expect(bar!.querySelector('textarea, input')).not.toBeNull());
    await commands.execute('find-close');
    expect(holder.querySelector('.jp-DocumentSearch-overlay')).toBeNull();
  });

  it('puts the cell toolbar on the active cell', async () => {
    await vi.waitFor(() =>
      expect(notebook.activeCell!.node.querySelector('.jp-cell-toolbar')).not.toBeNull(),
    );
    const titles = () =>
      [...notebook.activeCell!.node.querySelectorAll('.jp-cell-toolbar [title]')].map(b =>
        b.getAttribute('title'),
      );
    await vi.waitFor(() => expect(titles()).toHaveLength(6));
    expect(titles()).toEqual([
      'Duplicate cell',
      'Move cell up',
      'Move cell down',
      'Insert cell above',
      'Insert cell below',
      'Delete cell',
    ]);
  });
});
