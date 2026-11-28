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
Element.prototype.scrollTo ??= () => {};

const jupyterlab = await import('./jupyterlab');
const { attachEditing, createCommands, createNotebook, createRendermime } = jupyterlab;
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
      source: 'moons = 4\nprint',
      metadata: {},
      outputs: [],
      execution_count: null,
    },
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
let onCellMenu: ReturnType<typeof vi.fn<(cell: unknown, anchor: HTMLElement) => void>>;

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
  onCellMenu = vi.fn<(cell: unknown, anchor: HTMLElement) => void>();
  editing = attachEditing(notebook, session, rendermime, commands, { onCellMenu });
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
    await vi.waitFor(() => expect(titles()).toHaveLength(4));
    expect(titles()).toEqual(['Move cell up', 'Move cell down', 'Duplicate cell', 'Cell actions']);
  });

  it('opens the cell menu from the capsule’s ⋯ (#852)', async () => {
    const findMore = () =>
      notebook.activeCell!.node.querySelector<HTMLButtonElement>(
        '.jp-cell-toolbar [title="Cell actions"]',
      );
    await vi.waitFor(() => expect(findMore()).not.toBeNull());
    const more = findMore()!;
    await vi.waitFor(() => expect(more.disabled).toBe(false));
    more.click();
    expect(onCellMenu).toHaveBeenCalledTimes(1);
    expect(onCellMenu.mock.calls[0]![0]).toBe(notebook.activeCell);
    expect(onCellMenu.mock.calls[0]![1]).toBeInstanceOf(HTMLElement);
  });

  it('ignores mutating cell toolbar buttons when canEdit is false (#839)', async () => {
    editing.dispose();
    const session = {
      session: { kernel },
      sessionChanged: new Signal({}),
      kernelChanged: new Signal({}),
    } as unknown as ISessionContext;
    let editable = false;
    editing = attachEditing(
      notebook,
      session,
      notebook.rendermime,
      createCommands(notebook, session),
      {
        onCellMenu,
        canEdit: () => editable,
      },
    );
    const findDup = () =>
      notebook.activeCell!.node.querySelector<HTMLButtonElement>(
        '.jp-cell-toolbar [title="Duplicate cell"]',
      );
    await vi.waitFor(() => expect(findDup()).not.toBeNull());
    const dup = findDup()!;
    await vi.waitFor(() => expect(dup.disabled).toBe(false));
    const before = notebook.model!.cells.length;
    dup.click();
    expect(notebook.model!.cells.length).toBe(before);
    editable = true;
    dup.click();
    expect(notebook.model!.cells.length).toBe(before + 1);
  });
});

describe('recheckToolbarOverlap', () => {
  it('re-checks the toolbar when the active Markdown cell changes size', async () => {
    const { recheckToolbarOverlap } = jupyterlab;
    const observed = new Set<Element>();
    let resized: (entries: { contentRect: { width: number; height: number } }[]) => void = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: typeof resized) {
          resized = callback;
        }
        observe(node: Element) {
          observed.add(node);
        }
        unobserve(node: Element) {
          observed.delete(node);
        }
        disconnect() {
          observed.clear();
        }
      },
    );
    const sized = [{ contentRect: { width: 600, height: 40 } }];
    const recheck = recheckToolbarOverlap(notebook);
    // A code cell is active: nothing to watch.
    expect(observed.size).toBe(0);

    notebook.activeCellIndex = 1;
    const markdown = notebook.activeCell!;
    expect([...observed]).toEqual([markdown.inputArea!.node]);
    const changed = vi.fn();
    markdown.displayChanged.connect(changed);
    resized(sized);
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));

    // Parked (hidden): no size, no check.
    resized([{ contentRect: { width: 0, height: 0 } }]);
    await new Promise(r => setTimeout(r, 20));
    expect(changed).toHaveBeenCalledTimes(1);

    notebook.activeCellIndex = 0;
    expect(observed.size).toBe(0);
    resized(sized);
    await new Promise(r => setTimeout(r, 20));
    expect(changed).toHaveBeenCalledTimes(1);

    notebook.activeCellIndex = 1;
    recheck.dispose();
    expect(observed.size).toBe(0);
  });
});

describe('createCommands', () => {
  it('asks before each run, for the selected cells or all, and reports a failure', async () => {
    const session = { session: { kernel } } as unknown as ISessionContext;
    const beforeRun = vi.fn(async () => {
      throw new Error('Kernel failed to start');
    });
    const onError = vi.fn();
    const run = createCommands(notebook, session, beforeRun, onError);

    await run.execute('run-and-advance');
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(beforeRun).toHaveBeenLastCalledWith(false);
    expect(onError).toHaveBeenCalledWith(new Error('Kernel failed to start'));

    await run.execute('run-all');
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));
    expect(beforeRun).toHaveBeenLastCalledWith(true);
  });

  it('changes and runs nothing while it may not edit, whatever keys are bound', async () => {
    const session = { session: { kernel } } as unknown as ISessionContext;
    const beforeRun = vi.fn(async () => true);
    let allowed = true;
    const guarded = createCommands(notebook, session, beforeRun, undefined, () => allowed);
    const snapshot = () =>
      JSON.stringify([notebook.model!.toJSON(), notebook.widgets.map(c => c.inputHidden)]);
    const select = (i: number) => {
      notebook.activeCellIndex = i;
      notebook.deselectAll();
    };

    // Each command, from a state in which it would change something.
    const prepare: Record<string, () => Promise<void> | void> = {
      'insert-above': () => {},
      'insert-below': () => {},
      delete: () => {},
      cut: () => {},
      'to-markdown': () => select(0),
      'to-raw': () => select(0),
      'to-code': () => select(1),
      'move-up': () => select(1),
      'move-down': () => select(0),
      'collapse-code': () => select(0),
      'collapse-all-code': () => {},
      'expand-code': () => {
        select(0);
        notebook.widgets[0]!.inputHidden = true;
      },
      'expand-all-code': () => {
        notebook.widgets[0]!.inputHidden = true;
      },
      paste: async () => {
        select(0);
        await guarded.execute('copy');
      },
      undo: () => guarded.execute('insert-below'),
      redo: async () => {
        await guarded.execute('insert-below');
        await guarded.execute('undo');
        expect(notebook.widgets.length).toBe(2);
      },
    };
    notebook.model!.sharedModel.clearUndoHistory();
    for (const [id, setUp] of Object.entries(prepare)) {
      allowed = true;
      select(0);
      await setUp();
      const before = snapshot();
      allowed = false;
      await guarded.execute(id);
      expect(snapshot(), id).toBe(before);
      // The same command, allowed, does change it (the state is a real one).
      allowed = true;
      await guarded.execute(id);
      expect(snapshot(), `${id} when allowed`).not.toBe(before);
      // Back to the start for the next.
      notebook.model!.fromJSON(CONTENT);
      await new Promise(r => setTimeout(r, 0));
      for (const c of notebook.widgets) c.inputHidden = false;
      notebook.model!.sharedModel.clearUndoHistory();
    }

    allowed = false;
    for (const id of ['run-cell', 'run-and-advance', 'run-and-insert', 'run-all']) {
      await guarded.execute(id);
    }
    expect(beforeRun).not.toHaveBeenCalled();
    notebook.mode = 'command';
    await guarded.execute('edit-mode');
    expect(notebook.mode).toBe('command');
    // Reading still works.
    select(0);
    await guarded.execute('select-below');
    expect(notebook.activeCellIndex).toBe(1);
  });
});

describe('UrlResolver (#704)', () => {
  // Only `driveName` is read, by `isLocal`.
  const contents = { driveName: () => '' } as unknown as Contents.IManager;
  const { UrlResolver } = jupyterlab;
  const resolve = (path: string, url: string) =>
    new UrlResolver({ path, contents }).resolveUrl(url);

  const LOCAL: [string, string, string][] = [
    ['a/b/nb.ipynb', 'x', 'a/b/x'],
    ['a/b/nb.ipynb', './img/x.png', 'a/b/img/x.png'],
    ['a/b/nb.ipynb', '../x', 'a/x'],
    ['a/b/nb.ipynb', '../../../x', 'x'],
    ['nb.ipynb', 'x', 'x'],
    ['my dir/nb.ipynb', 'x', 'my%20dir/x'],
    ['a/b/nb.ipynb', 'dir/', 'a/b/dir'],
    ['a/b/nb.ipynb', './', 'a/b'],
    ['nb.ipynb', './', ''],
  ];
  const OTHER = ['https://example.com/x.png', 'data:image/png;base64,AAAA', '/abs/x'];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves relative URLs without reading process.cwd()', async () => {
    vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('no cwd in the browser');
    });
    for (const [path, url, want] of LOCAL) expect(await resolve(path, url)).toBe(want);
  });

  it('leaves URLs that are not local unchanged', async () => {
    vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('no cwd in the browser');
    });
    for (const url of OTHER) expect(await resolve('a/b/nb.ipynb', url)).toBe(url);
  });

  it("matches JupyterLab's resolver when the working directory is '/'", async () => {
    vi.spyOn(process, 'cwd').mockReturnValue('/');
    const { RenderMimeRegistry } = await import('@jupyterlab/rendermime');
    for (const [path, url] of [...LOCAL, ...OTHER.map(u => ['a/b/nb.ipynb', u] as const)]) {
      const upstream = new RenderMimeRegistry.UrlResolver({ path, contents });
      expect(await resolve(path, url)).toBe(await upstream.resolveUrl(url));
    }
  });
});
