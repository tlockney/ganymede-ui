import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useCallback, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reloadPage } from '../lib/reload';
import type * as nbformat from '@jupyterlab/nbformat';
import type { NotebookModel } from '@jupyterlab/notebook';
import type { ICodeCellModel } from '@jupyterlab/cells';
import { ServerConnection } from '@jupyterlab/services';
import { Signal } from '@lumino/signaling';
import '../test/notebook-env';
import { entry, fakeBackend, fakeServices } from '../test/fakes';
import type { NotebookController } from './NotebookPane';
import { declareDevice } from '../lib/kernel-relay';
import { attachDevice } from '../lib/device-remote';
import { NotebookRoom } from '../lib/room';
import { attachCellControls } from '../lib/cell-controls';
import type { BackendConfig } from '../lib/backends';
import type { KernelPlaces } from '../lib/kernel-place';
import { forgetChosenViews, forgetPositions } from '../lib/journal';

// No kernel and no real notebook widget: the pane's loading, dirty state and
// saving are tested here with JupyterLab's real NotebookModel. Rendering,
// running cells and the keyboard are left to the end-to-end suite.
const fakes = vi.hoisted(() => ({
  sessions: [] as unknown[],
  notebooks: [] as unknown[],
  widgets: [] as { dispose: () => void; saveState: (m: unknown) => void }[],
  editing: [] as { dispose: () => void }[],
  /** What a notebook command runs. */
  execute: vi.fn(async () => {}),
  /** The fake session's JupyterLab error dialog, which should never open. */
  kernelErrorDialog: vi.fn(async () => {}),
  /** How the next session rejoins; by default at once, finding none. */
  initialize: undefined as undefined | ((session: { session: unknown }) => Promise<boolean>),
}));

vi.mock('../lib/jupyterlab', async () => {
  const { Widget } = await import('@lumino/widgets');
  const { Signal } = await import('@lumino/signaling');
  return {
    // Enough for the journal view to render outputs into.
    createRendermime: vi.fn(() => ({
      createRenderer: () => {
        const w = new Widget();
        (w as unknown as { renderModel: unknown }).renderModel = async () => {};
        return w;
      },
      preferredMimeType: () => undefined,
    })),
    createNotebook: vi.fn((rendermime: unknown) => {
      // A plain Lumino widget stands in for JupyterLab's Notebook.
      const w = new Widget() as InstanceType<typeof Widget> & {
        model?: NotebookModel;
        activeCellIndex?: number;
        widgets: { model: { type: string } }[];
        isSelectedOrActive(cell: unknown): boolean;
        activeCellChanged: InstanceType<typeof Signal>;
        stateChanged: InstanceType<typeof Signal>;
        mode?: string;
        setMode(mode: string, options?: { focus?: boolean }): void;
        deselectAll(): void;
        scrollToCell(cell: unknown, align?: string): Promise<void>;
        scrollToItem(index: number, align?: string, margin?: number): Promise<void>;
        select(cell: unknown): void;
      };
      // Its cells, with the active one selected, for what a run needs.
      // Each cell has a node in the notebook's, which a test can give a layout.
      const cellNodes: HTMLElement[] = [];
      const activates: (() => void)[] = [];
      Object.defineProperty(w, 'widgets', {
        get: () =>
          Array.from({ length: w.model!.cells.length }, (_, i) => {
            if (!cellNodes[i]) {
              cellNodes[i] = document.createElement('div');
              cellNodes[i]!.dataset.notebookCell = String(i);
              w.node.append(cellNodes[i]!);
            }
            return {
              model: w.model!.cells.get(i),
              node: cellNodes[i],
              activate: (activates[i] ??= vi.fn()),
            };
          }),
      });
      w.isSelectedOrActive = cell =>
        (cell as { model: unknown }).model === w.model!.cells.get(w.activeCellIndex ?? 0);
      w.activeCellChanged = new Signal(w);
      // The keyboard bar (#209) follows the mode.
      w.stateChanged = new Signal(w);
      // The outline goes to a heading's cell (#212).
      w.setMode = vi.fn((mode: string) => {
        w.mode = mode;
      });
      w.deselectAll = vi.fn();
      w.scrollToCell = vi.fn(async () => {});
      // Back from the journal, with no margin above the cell (#841).
      w.scrollToItem = vi.fn(async () => {});
      w.select = vi.fn();
      (w as unknown as { rendermime: unknown }).rendermime = rendermime;
      fakes.notebooks.push(w);
      return w;
    }),
    createCommands: vi.fn(() => ({
      processKeydownEvent: vi.fn(),
      hasCommand: () => true,
      isEnabled: () => true,
      execute: fakes.execute,
    })),
    attachEditing: vi.fn(() => {
      const editing = { dispose: vi.fn(), isDisposed: false };
      fakes.editing.push(editing);
      return editing;
    }),
  };
});

// The touch keyboard bar needs a touch device and a focused editor; this
// stands in to say whether the pane shows it.
vi.mock('./KeyboardBar', () => ({ KeyboardBar: () => <div data-testid="keyboard-bar" /> }));

// The real `attachDevice`, watched for how the pane attaches it (#701).
vi.mock('../lib/device-remote', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/device-remote')>();
  return { ...actual, attachDevice: vi.fn(actual.attachDevice) };
});

// The touch cell controls need JupyterLab's cells; cell-controls.test.ts
// covers them.
vi.mock('../lib/cell-controls', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/cell-controls')>()),
  attachCellControls: vi.fn(() => ({ dispose: vi.fn(), isDisposed: false })),
}));

// The output labels need JupyterLab's cells too; output-labels.test.ts covers
// what a pass does. Here stands what the pane wires to them: the run queue
// that says what "saved output" means (#852), and a look again when a kernel
// comes or goes (#813).
const outputLabels = vi.hoisted(() => ({
  options: undefined as { runs: unknown; onExpandTable?: (target: unknown) => void } | undefined,
  refresh: vi.fn(),
}));
vi.mock('../lib/output-labels', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/output-labels')>()),
  attachOutputLabels: vi.fn(
    (_notebook: unknown, options: { runs: unknown; onExpandTable?: (target: unknown) => void }) => {
      outputLabels.options = options;
      return { dispose: vi.fn(), isDisposed: false, refresh: outputLabels.refresh };
    },
  ),
}));

const sourceExpand = vi.hoisted(() => ({
  onExpand: undefined as ((cell: unknown, opener?: HTMLElement) => void) | undefined,
}));
vi.mock('../lib/source-expand', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/source-expand')>()),
  attachSourceExpand: vi.fn(
    (_notebook: unknown, onExpand: (cell: unknown, opener?: HTMLElement) => void) => {
      sourceExpand.onExpand = onExpand;
      return { dispose: vi.fn(), isDisposed: false };
    },
  ),
}));

// The same for collapsing code (#564); code-collapse.test.ts covers it.
vi.mock('../lib/code-collapse', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/code-collapse')>()),
  attachCodeCollapse: vi.fn(() => ({ dispose: vi.fn(), isDisposed: false })),
}));

// Type errors need JupyterLab's cells and a kernel; type-errors.test.ts covers them.
vi.mock('../lib/type-errors', () => ({
  attachTypeErrors: vi.fn(() => ({ dispose: vi.fn(), isDisposed: false })),
}));

// Signature help, definition and rename need JupyterLab's cells and a
// kernel; language-service.test.ts and language-editor.test.ts cover them.
const language = vi.hoisted(() => ({
  goToDefinition: vi.fn(async () => true),
  rename: vi.fn(async () => true),
  notify: undefined as ((message: string) => void) | undefined,
}));
vi.mock('../lib/language-editor', () => ({
  attachLanguageFeatures: vi.fn(
    (_notebook: unknown, _session: unknown, notify: (m: string) => void) => {
      language.notify = notify;
      return {
        service: { goToDefinition: language.goToDefinition, rename: language.rename },
        dispose: vi.fn(),
        isDisposed: false,
      };
    },
  ),
}));

// The running and queued lines need JupyterLab's cells; run-status.test.ts
// covers them.
const runStatus = vi.hoisted(() => ({
  clear: vi.fn(),
  options: undefined as { interrupt(): void } | undefined,
  /** Whether a cell is running or queued, and the signal for it changing. */
  busy: false,
  busyChanged: undefined as { emit(busy: boolean): void } | undefined,
  /** The queue the pane passes on: the margin's Run and the meta line read it. */
  status: undefined as unknown,
  /** The functions connected to `busyChanged` now. */
  handlers: new Set<unknown>(),
}));
vi.mock('../lib/run-status', async () => {
  const { Signal } = await import('@lumino/signaling');
  return {
    attachRunStatus: vi.fn((_: unknown, options: { interrupt(): void }) => {
      runStatus.options = options;
      const busyChanged = new Signal<object, boolean>({});
      runStatus.busyChanged = busyChanged;
      runStatus.handlers.clear();
      const connect = busyChanged.connect.bind(busyChanged);
      const disconnect = busyChanged.disconnect.bind(busyChanged);
      busyChanged.connect = (fn, ctx) => (runStatus.handlers.add(fn), connect(fn, ctx));
      busyChanged.disconnect = (fn, ctx) => (runStatus.handlers.delete(fn), disconnect(fn, ctx));
      const status = {
        clear: runStatus.clear,
        dispose: vi.fn(),
        isDisposed: false,
        get busy() {
          return runStatus.busy;
        },
        busyChanged,
        changed: new Signal<object, void>({}),
        stateOf: vi.fn(() => undefined),
        lastRun: vi.fn(() => undefined),
        hasRun: vi.fn(() => false),
      };
      runStatus.status = status;
      return status;
    }),
  };
});
/** What the pane gave the running line: its Interrupt. */
const runStatusOptions = () => runStatus.options!;

vi.mock('../lib/widgets', () => ({
  attachWidgets: vi.fn(() => {
    const widgets = { dispose: vi.fn(), isDisposed: false, saveState: vi.fn() };
    fakes.widgets.push(widgets);
    return widgets;
  }),
}));

vi.mock('../lib/table-output', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/table-output')>()),
  installTableOutput: vi.fn(),
}));

vi.mock('../lib/kernel-relay', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/kernel-relay')>()),
  declareDevice: vi.fn(),
}));
vi.mock('../lib/backends', () => ({ trustNotebook: vi.fn(async () => {}) }));

vi.mock('@jupyterlab/apputils', async importOriginal => {
  const { Signal } = await import('@lumino/signaling');
  class SessionContext {
    session = null;
    kernelChanged = new Signal(this);
    statusChanged = new Signal(this);
    connectionStatusChanged = new Signal(this);
    initialize = vi.fn(() => fakes.initialize?.(this) ?? Promise.resolve(false));
    changeKernel = vi.fn(async () => null);
    dispose = vi.fn();
    /** JupyterLab's own "Error Starting Kernel" dialog (#869). */
    _displayKernelError = fakes.kernelErrorDialog;
    constructor(readonly options: Record<string, unknown>) {
      fakes.sessions.push(this);
    }
  }
  return { ...(await importOriginal<object>()), SessionContext };
});

const { NotebookPane } = await import('./NotebookPane');
const { hasUntrustedOutputs } = await import('../lib/trust');
const { attachEditing } = await import('../lib/jupyterlab');
const { trustNotebook } = await import('../lib/backends');
const { NotebookModel: RealNotebookModel, NotebookActions } = await import('@jupyterlab/notebook');

const NOTEBOOK: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: { kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' } },
  cells: [
    {
      cell_type: 'code',
      id: 'a1',
      source: 'print(1)',
      metadata: {},
      outputs: [],
      execution_count: null,
    },
  ],
};

/** The server settings the next `setup` gives its services, if any. */
let serverSettings: ServerConnection.ISettings | undefined;

function setup(
  get = vi.fn(async () => ({ path: 'moons/Io.ipynb', content: structuredClone(NOTEBOOK) })),
  path = 'moons/Io.ipynb',
  config?: BackendConfig,
  places?: KernelPlaces,
  native = false,
  findQuery?: string,
) {
  const fake = fakeServices();
  if (serverSettings) Object.assign(fake.services, { serverSettings });
  fake.contents.get = get as never;
  const backend = fakeBackend(fake.services, config);
  const controllers: (NotebookController | undefined)[] = [];
  const onController = vi.fn((c: NotebookController | undefined) => controllers.push(c));
  const onLoadError = vi.fn();
  const onRenamed = vi.fn();
  const pane = (query?: string) => (
    <NotebookPane
      backend={backend}
      path={path}
      places={places}
      native={native}
      findQuery={query}
      onController={onController}
      onLoadError={onLoadError}
      onRenamed={onRenamed}
    />
  );
  const utils = render(pane(findQuery));
  // The Mac app's Find field changing (#879): the pane reports new matches.
  const renderWith = (query: string) => utils.rerender(pane(query));
  const latest = () => controllers[controllers.length - 1];
  return { ...utils, fake, onController, onLoadError, onRenamed, latest, renderWith };
}

beforeEach(() => {
  forgetChosenViews();
  forgetPositions();
  runStatus.busy = false;
  fakes.sessions.length = 0;
  fakes.notebooks.length = 0;
  fakes.widgets.length = 0;
  fakes.editing.length = 0;
  fakes.initialize = undefined;
  fakes.execute.mockClear();
  fakes.kernelErrorDialog.mockClear();
  vi.mocked(attachDevice).mockClear();
  serverSettings = undefined;
  outputLabels.options = undefined;
  outputLabels.refresh.mockClear();
});

/** A notebook with HTML output, as read from a file nobody signed. */
function untrusted(trusted?: boolean): nbformat.INotebookContent {
  const nb = structuredClone(NOTEBOOK);
  nb.cells.push({
    cell_type: 'code',
    id: 'h1',
    source: 'HTML("<b>hi</b>")',
    metadata: trusted === undefined ? {} : { trusted },
    execution_count: 2,
    outputs: [
      {
        output_type: 'display_data',
        metadata: {},
        data: { 'text/html': '<b>hi</b>', 'text/plain': '<HTML>' },
      },
    ],
  });
  nb.cells.push({ cell_type: 'markdown', id: 'm1', source: '# Io', metadata: {} });
  return nb;
}

afterEach(() => {
  vi.useRealTimers();
});

const modelOf = () => (fakes.notebooks[0] as { model: NotebookModel }).model;
/** The model of the notebook built on a reload. */
const modelOf2 = () => (fakes.notebooks[1] as { model: NotebookModel }).model;

describe('NotebookPane', () => {
  it('reports the notebook’s metadata title, and a change to it (#867)', async () => {
    const named = structuredClone(NOTEBOOK);
    named.metadata.title = 'Io moons';
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: named })));
    await waitFor(() => expect(latest()?.title).toBe('Io moons'));
    // A live room changes the title in the file's metadata, without a reload.
    act(() => modelOf().setMetadata('title', 'Europa'));
    await waitFor(() => expect(latest()?.title).toBe('Europa'));
  });

  it('reports no title when the notebook’s metadata has none (#867)', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    expect(latest()!.title).toBeUndefined();
  });

  // #892's display title: the pane reports `displayTitle`, not just the
  // metadata's title, so the toolbar and the tab follow a notebook's first
  // `#` heading. A pane that went back to `notebookTitle(metadata)` would
  // report no title for the first and the metadata title for the second.
  it('reports a notebook’s first `#` heading when its metadata has no title (#892)', async () => {
    const headed = structuredClone(NOTEBOOK);
    headed.cells.push({ cell_type: 'markdown', id: 'h1', source: '# Heading', metadata: {} });
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: headed })));
    await waitFor(() => expect(latest()?.title).toBe('Heading'));
  });

  it('reports the metadata title over the first `#` heading (#892)', async () => {
    const named = structuredClone(NOTEBOOK);
    named.metadata.title = 'Io moons';
    named.cells.push({ cell_type: 'markdown', id: 'h1', source: '# Heading', metadata: {} });
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: named })));
    await waitFor(() => expect(latest()?.title).toBe('Io moons'));
  });

  it('reports no title for neither a metadata title nor a `#` heading (#892)', async () => {
    const plain = structuredClone(NOTEBOOK);
    plain.cells.push({ cell_type: 'markdown', id: 'h2', source: '## Heading', metadata: {} });
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: plain })));
    await waitFor(() => expect(latest()).toBeDefined());
    expect(latest()!.title).toBeUndefined();
  });

  it('opens a notebook an agent kept as a journal, and switches to the notebook and back (#184)', async () => {
    const kept = structuredClone(NOTEBOOK);
    kept.cells[0]!.metadata = {
      ganymede: { agent: { by: 'claude-code', mode: 'executed', at: '2026-11-20T10:00:00Z' } },
    };
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: kept })));
    await waitFor(() => expect(latest()?.journal).toBe(true));
    expect(screen.getByRole('region', { name: 'Journal of Io.ipynb' })).toBeInTheDocument();
    expect(screen.getByText('Agent ran it')).toBeInTheDocument();
    // The notebook stays mounted underneath, so its kernel and room go on.
    expect(document.querySelector('.notebook-page')).toHaveAttribute('hidden');

    act(() => latest()!.toggleJournal());
    await waitFor(() => expect(latest()!.journal).toBe(false));
    expect(screen.queryByRole('region', { name: 'Journal of Io.ipynb' })).not.toBeInTheDocument();
    expect(document.querySelector('.notebook-page')).not.toHaveAttribute('hidden');

    act(() => latest()!.toggleJournal());
    await waitFor(() => expect(latest()!.journal).toBe(true));
  });

  it('says what the notebook is above its first cell in the native chrome (#867)', async () => {
    const { latest } = setup(
      vi.fn(async () => ({ path: 'moons/Io.ipynb', content: kept() })),
      'moons/Io.ipynb',
      undefined,
      undefined,
      true,
    );
    await waitFor(() => expect(latest()?.journal).toBe(true));
    // The journal's header has the eyebrow; the page's line waits for the cells.
    expect(document.querySelector('.page-eyebrow')).not.toBeInTheDocument();

    act(() => latest()!.toggleJournal());
    await waitFor(() => expect(latest()!.journal).toBe(false));
    expect(document.querySelector('.page-eyebrow')).toHaveTextContent(
      'python · 20 Nov 2026 · Kept with claude-code',
    );
    // In the page, above the notebook's cells.
    const eyebrow = document.querySelector('.page-eyebrow')!;
    const page = document.querySelector('.notebook-page')!;
    expect(eyebrow.nextElementSibling).toBe(page);
  });

  it('shows no page eyebrow in the toolbar chrome (#867)', async () => {
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: kept() })));
    await waitFor(() => expect(latest()?.journal).toBe(true));
    act(() => latest()!.toggleJournal());
    await waitFor(() => expect(latest()!.journal).toBe(false));
    expect(document.querySelector('.page-eyebrow')).not.toBeInTheDocument();
  });

  it('tells the journal which agents are in its room, from the server (#724)', async () => {
    const content = structuredClone(NOTEBOOK);
    content.cells[0]!.metadata = {
      ganymede: { agent: { by: 'claude-code', mode: 'executed', at: '2026-11-20T10:00:00Z' } },
    };
    const { YNotebook } = await import('@jupyter/ydoc');
    const shared = new YNotebook();
    shared.fromJSON(content as never);
    const room = {
      notebook: shared,
      connected: true,
      live: true,
      onConnection: () => () => {},
      watchLive: () => () => {},
      dispose: vi.fn(),
    };
    const join = vi.spyOn(NotebookRoom, 'join').mockResolvedValue(room as unknown as NotebookRoom);
    serverSettings = ServerConnection.makeSettings({
      baseUrl: 'http://127.0.0.1:1/',
      fetch: (async (r: Request) =>
        new Response(
          JSON.stringify(
            r.url.includes('api/collaboration/rooms')
              ? {
                  rooms: [
                    { path: 'moons/Io.ipynb', clients: [{ name: 'claude-code', kind: 'agent' }] },
                  ],
                }
              : {},
          ),
        )) as unknown as typeof fetch,
    });
    setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content })));
    expect(await screen.findByText('claude-code is in the room.')).toBeInTheDocument();
    join.mockRestore();
  });

  /** A notebook an agent kept. */
  const kept = () => {
    const nb = structuredClone(NOTEBOOK);
    nb.cells[0]!.metadata = {
      ganymede: { agent: { by: 'claude-code', mode: 'executed', at: '2026-11-20T10:00:00Z' } },
    };
    return nb;
  };

  it('does not run, insert into or edit the hidden notebook while the journal shows (#184)', async () => {
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: kept() })));
    await waitFor(() => expect(latest()?.journal).toBe(true));
    const c = latest()!;
    const before = modelOf().cells.length;
    c.insert('code');
    c.insert('markdown');
    c.changeCellType('markdown');
    await c.run();
    await c.runAll();
    c.clearOutputs();
    expect(c.command('delete')).toBe(false);
    expect(await c.goToDefinition()).toBe(false);
    expect(await c.renameSymbol('x')).toBe(false);
    expect(modelOf().cells.length).toBe(before);
    expect(fakes.sessions.length).toBeGreaterThan(0);
  });

  /** A journal whose one code cell has an output, with the controller. */
  async function journalWithOutput() {
    const nb = kept();
    Object.assign(nb.cells[0]!, {
      execution_count: 3,
      outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }],
    });
    const view = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: nb })));
    await waitFor(() => expect(view.latest()?.journal).toBe(true));
    return view;
  }

  it('does not start a kernel or run a cell from the journal, as the page commands run and run-all call it (#184)', async () => {
    const { latest } = await journalWithOutput();
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    const advance = vi.spyOn(NotebookActions, 'runAndAdvance').mockResolvedValue(true);
    const all = vi.spyOn(NotebookActions, 'runAll').mockResolvedValue(true);
    await act(() => latest()!.run());
    expect(session.changeKernel).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    await act(() => latest()!.runAll());
    expect(session.changeKernel).not.toHaveBeenCalled();
    expect(all).not.toHaveBeenCalled();
    advance.mockRestore();
    all.mockRestore();
  });

  it('keeps the outputs and counts when Clear All Outputs runs from the journal (#184)', async () => {
    const { latest } = await journalWithOutput();
    const cell = modelOf().cells.get(0) as ICodeCellModel;
    act(() => latest()!.clearOutputs());
    expect(cell.outputs.length).toBe(1);
    expect(cell.executionCount).toBe(3);
    expect(modelOf().dirty).toBe(false);
  });

  it('leaves the cell type alone when the page command cell-type runs from the journal (#184)', async () => {
    const { latest } = await journalWithOutput();
    const change = vi.spyOn(NotebookActions, 'changeCellType').mockImplementation(() => {});
    act(() => latest()!.changeCellType('markdown'));
    expect(change).not.toHaveBeenCalled();
    expect(modelOf().cells.get(0).type).toBe('code');
    change.mockRestore();
  });

  it('takes focus in command mode when it opens with nothing focused, as after Try a Notebook (#815)', async () => {
    const { Widget } = await import('@lumino/widgets');
    const activate = vi.spyOn(Widget.prototype, 'activate');
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    expect(activate).toHaveBeenCalledWith();
    expect(activate.mock.contexts).toContain(fakes.notebooks[0]);
    activate.mockRestore();
  });

  it('leaves focus where it is when it opens from a control that keeps it (#815)', async () => {
    const { Widget } = await import('@lumino/widgets');
    const activate = vi.spyOn(Widget.prototype, 'activate');
    const sidebarButton = document.createElement('button');
    document.body.append(sidebarButton);
    sidebarButton.focus();
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    expect(activate.mock.contexts).not.toContain(fakes.notebooks[0]);
    expect(document.activeElement).toBe(sidebarButton);
    sidebarButton.remove();
    activate.mockRestore();
  });

  it('leaves focus to the Apple apps with native chrome (#815)', async () => {
    const { Widget } = await import('@lumino/widgets');
    const activate = vi.spyOn(Widget.prototype, 'activate');
    document.documentElement.classList.add('chrome-native');
    try {
      const { latest } = setup();
      await waitFor(() => expect(latest()).toBeDefined());
      expect(activate.mock.contexts).not.toContain(fakes.notebooks[0]);
    } finally {
      document.documentElement.classList.remove('chrome-native');
      activate.mockRestore();
    }
  });

  it('takes focus out of the hidden notebook when the journal shows (#184)', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const inCell = document.createElement('textarea');
    document.querySelector('.notebook-page')!.appendChild(inCell);
    inCell.focus();
    expect(document.activeElement).toBe(inCell);
    act(() => latest()!.toggleJournal());
    await waitFor(() => expect(latest()!.journal).toBe(true));
    expect(document.activeElement).not.toBe(inCell);
  });

  it("keeps the person's view across a reopen of the file, and defaults only the first time (#184)", async () => {
    const get = vi.fn(async () => ({ path: 'moons/Io.ipynb', content: kept() }));
    const { latest } = setup(get);
    await waitFor(() => expect(latest()?.journal).toBe(true));
    act(() => latest()!.toggleJournal());
    await waitFor(() => expect(latest()!.journal).toBe(false));
    // Reload opens the file again, as a restarted server does.
    act(() => {
      latest()!.reload();
    });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(fakes.notebooks).toHaveLength(2));
    await waitFor(() => expect(latest()?.journal).toBe(false));
    expect(screen.queryByRole('region', { name: /^Journal of/ })).not.toBeInTheDocument();
  });

  it('scrolls the journal to a cell instead of moving the hidden notebook (#184)', async () => {
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: kept() })));
    await waitFor(() => expect(latest()?.journal).toBe(true));
    const article = document.querySelector('.journal [data-cell-index="0"]') as HTMLElement;
    const scrollIntoView = vi.fn();
    article.scrollIntoView = scrollIntoView;
    const notebook = fakes.notebooks[0] as { scrollToCell: ReturnType<typeof vi.fn> };
    expect(latest()!.goToCell(0)).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(notebook.scrollToCell).not.toHaveBeenCalled();
    expect(latest()!.goToCell(7)).toBe(false);
  });

  describe('keeps the cell in view across the two views (#816)', () => {
    const CELL = 100;
    const VIEW = 400;
    afterEach(() => vi.restoreAllMocks());

    /** Eight cells an agent wrote; each 100 px tall in a 400 px view, in both views. */
    function eightCells() {
      const nb = structuredClone(NOTEBOOK);
      nb.cells = Array.from({ length: 8 }, (_, i) => ({
        cell_type: 'markdown',
        id: `m${i}`,
        source: `cell ${i}`,
        metadata: { ganymede: { agent: { by: 'claude-code', mode: 'note' } } },
      })) as nbformat.INotebookContent['cells'];
      return nb;
    }

    /** jsdom has no layout: say where each cell is, from each view's scroll position. */
    function layout() {
      const state = { notebookTop: 0 };
      const journal = () => document.querySelector('.journal-scroll') as HTMLElement | null;
      const box = (top: number) =>
        ({ top, bottom: top + CELL, height: CELL, left: 0, right: 100, width: 100 }) as DOMRect;
      vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: Element,
      ) {
        const el = this as HTMLElement;
        if (el.classList.contains('journal-scroll') || el.classList.contains('lm-Widget')) {
          return { top: 0, bottom: VIEW, height: VIEW, left: 0, right: 100, width: 100 } as DOMRect;
        }
        if (el.dataset.cellIndex !== undefined) {
          return box(Number(el.dataset.cellIndex) * CELL - (journal()?.scrollTop ?? 0));
        }
        if (el.dataset.notebookCell !== undefined) {
          return box(Number(el.dataset.notebookCell) * CELL - state.notebookTop);
        }
        return { top: 0, bottom: 0, height: 0, left: 0, right: 0, width: 0 } as DOMRect;
      });
      vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (
        this: Element,
      ) {
        return this.classList.contains('journal-scroll') ? 20 * CELL : 0;
      });
      vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (
        this: Element,
      ) {
        return this.classList.contains('journal-scroll') ? VIEW : 0;
      });
      return state;
    }

    it('opens the journal at the cell the notebook showed at its top', async () => {
      const state = layout();
      const { latest } = setup(
        vi.fn(async () => ({ path: 'moons/Io.ipynb', content: eightCells() })),
      );
      await waitFor(() => expect(latest()?.journal).toBe(true));
      act(() => latest()!.toggleJournal());
      await waitFor(() => expect(latest()!.journal).toBe(false));
      // The notebook is scrolled so that cell 3's top is just above the view.
      state.notebookTop = 3 * CELL + 20;
      act(() => latest()!.toggleJournal());
      await waitFor(() => expect(latest()!.journal).toBe(true));
      const scroller = document.querySelector('.journal-scroll') as HTMLElement;
      expect(scroller.scrollTop).toBe(3 * CELL);
    });

    it('carries the active cell when it shows, though another is first in view', async () => {
      const state = layout();
      const { latest } = setup(
        vi.fn(async () => ({ path: 'moons/Io.ipynb', content: eightCells() })),
      );
      await waitFor(() => expect(latest()?.journal).toBe(true));
      act(() => latest()!.toggleJournal());
      await waitFor(() => expect(latest()!.journal).toBe(false));
      // Cell 3 is first in view; cell 5 is active and in view too.
      state.notebookTop = 3 * CELL + 10;
      (fakes.notebooks[0] as { activeCellIndex: number }).activeCellIndex = 5;
      act(() => latest()!.toggleJournal());
      await waitFor(() => expect(latest()!.journal).toBe(true));
      expect((document.querySelector('.journal-scroll') as HTMLElement).scrollTop).toBe(5 * CELL);
    });

    it('shows the cell the journal was at when switching back to the notebook', async () => {
      const { Widget } = await import('@lumino/widgets');
      const activate = vi.spyOn(Widget.prototype, 'activate');
      layout();
      const { latest } = setup(
        vi.fn(async () => ({ path: 'moons/Io.ipynb', content: eightCells() })),
      );
      await waitFor(() => expect(latest()?.journal).toBe(true));
      const scroller = document.querySelector('.journal-scroll') as HTMLElement;
      // Reading cell 5: its top is a little above the top of the view.
      act(() => {
        scroller.scrollTop = 5 * CELL + 30;
      });
      const notebook = fakes.notebooks[0] as {
        activeCellIndex: number;
        setMode: ReturnType<typeof vi.fn>;
        scrollToItem: ReturnType<typeof vi.fn>;
        select: ReturnType<typeof vi.fn>;
        deselectAll: ReturnType<typeof vi.fn>;
        widgets: { model: unknown; activate: ReturnType<typeof vi.fn> }[];
      };
      activate.mockClear();
      act(() => latest()!.toggleJournal());
      // Flush at the top: no margin above it (#841).
      await waitFor(() =>
        expect(notebook.scrollToItem).toHaveBeenCalledExactlyOnceWith(5, 'start', 0),
      );
      expect(notebook.setMode).toHaveBeenCalledWith('command', { focus: false });
      expect(notebook.activeCellIndex).toBe(5);
      await waitFor(() => expect(notebook.select).toHaveBeenCalledOnce());
      expect((notebook.select.mock.calls[0]![0] as { model: unknown }).model).toBe(
        notebook.widgets[5]!.model,
      );
      // Selected quietly without focusing the notebook or cell editor (#897).
      expect(notebook.widgets[5]!.activate).not.toHaveBeenCalled();
      expect(activate.mock.contexts).not.toContain(notebook);
      const scrolled = notebook.scrollToItem.mock.invocationCallOrder[0]!;
      expect(notebook.deselectAll.mock.invocationCallOrder.at(-1)!).toBeGreaterThan(scrolled);
      expect(notebook.select.mock.invocationCallOrder[0]!).toBeGreaterThan(
        notebook.deselectAll.mock.invocationCallOrder.at(-1)!,
      );
    });

    it('selects the first cell quietly without focusing it when switching from the journal (#897)', async () => {
      const { Widget } = await import('@lumino/widgets');
      const activate = vi.spyOn(Widget.prototype, 'activate');
      layout();
      const { latest } = setup(
        vi.fn(async () => ({ path: 'moons/Io.ipynb', content: eightCells() })),
      );
      await waitFor(() => expect(latest()?.journal).toBe(true));
      const notebook = fakes.notebooks[0] as {
        activeCellIndex: number;
        setMode: ReturnType<typeof vi.fn>;
        scrollToItem: ReturnType<typeof vi.fn>;
        select: ReturnType<typeof vi.fn>;
        widgets: { model: unknown; activate: ReturnType<typeof vi.fn> }[];
      };
      activate.mockClear();
      act(() => latest()!.toggleJournal());
      await waitFor(() =>
        expect(notebook.scrollToItem).toHaveBeenCalledExactlyOnceWith(0, 'start', 0),
      );
      await waitFor(() => expect(notebook.select).toHaveBeenCalledOnce());
      expect(notebook.setMode).toHaveBeenCalledWith('command', { focus: false });
      expect(notebook.activeCellIndex).toBe(0);
      expect((notebook.select.mock.calls[0]![0] as { model: unknown }).model).toBe(
        notebook.widgets[0]!.model,
      );
      expect(activate.mock.contexts).not.toContain(notebook);
      expect(notebook.widgets[0]!.activate).not.toHaveBeenCalled();
      expect(document.querySelector('.notebook-page')!.contains(document.activeElement)).toBe(
        false,
      );
    });

    it('lands on the same cell going notebook, journal, notebook', async () => {
      const state = layout();
      const { latest } = setup(
        vi.fn(async () => ({ path: 'moons/Io.ipynb', content: eightCells() })),
      );
      await waitFor(() => expect(latest()?.journal).toBe(true));
      const notebook = fakes.notebooks[0] as {
        activeCellIndex: number;
        scrollToItem: ReturnType<typeof vi.fn>;
      };
      // Scrolling the notebook to a cell moves it there.
      notebook.scrollToItem.mockImplementation(async (index: number) => {
        state.notebookTop = index * CELL;
      });
      act(() => latest()!.toggleJournal());
      await waitFor(() => expect(latest()!.journal).toBe(false));
      state.notebookTop = 4 * CELL + 10;
      notebook.activeCellIndex = 0;
      act(() => latest()!.toggleJournal());
      await waitFor(() => expect(latest()!.journal).toBe(true));
      const scroller = document.querySelector('.journal-scroll') as HTMLElement;
      expect(scroller.scrollTop).toBe(4 * CELL);
      act(() => latest()!.toggleJournal());
      await waitFor(() => expect(notebook.activeCellIndex).toBe(4));
      await waitFor(() => expect(state.notebookTop).toBe(4 * CELL));
    });
  });

  it('opens a notebook with no agent cells as a notebook (#184)', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    expect(latest()!.journal).toBe(false);
    expect(screen.queryByRole('region', { name: /^Journal of/ })).not.toBeInTheDocument();
  });

  it('loads the file and hands the toolbar a clean controller', async () => {
    const { fake, latest } = setup();
    expect(screen.getByText('Opening Io.ipynb…')).toBeInTheDocument();
    await waitFor(() => expect(latest()).toBeDefined());

    expect(fake.contents.get).toHaveBeenCalledWith('moons/Io.ipynb', {
      type: 'notebook',
      content: true,
    });
    expect(latest()).toMatchObject({
      path: 'moons/Io.ipynb',
      name: 'Io.ipynb',
      dirty: false,
      kernelName: 'python3',
    });
    // No kernel until the first run, which starts the one the file names.
    await waitFor(() => expect(latest()!.status).toBe('none'));
    expect(modelOf().cells.length).toBe(1);
    expect(modelOf().cells.get(0).sharedModel.getSource()).toBe('print(1)');
    expect(document.querySelector('.notebook-page .notebook-holder')).toBeInTheDocument();

    // One session per file, named by path, joined if running but not started.
    const session = fakes.sessions[0] as {
      options: Record<string, unknown>;
      initialize: () => void;
    };
    expect(session.options).toMatchObject({
      path: 'moons/Io.ipynb',
      name: 'Io.ipynb',
      type: 'notebook',
      kernelPreference: { shouldStart: false, autoStartDefault: false },
    });
    expect(session.initialize).toHaveBeenCalled();
  });

  it('marks the notebook dirty on an edit and saves it through the contents manager', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());

    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    await waitFor(() => expect(latest()!.dirty).toBe(true));

    await act(() => latest()!.save());
    expect(fake.contents.save).toHaveBeenCalledOnce();
    const [path, saved] = fake.contents.save.mock.calls[0]!;
    expect(path).toBe('moons/Io.ipynb');
    expect(saved).toMatchObject({ type: 'notebook', format: 'json' });
    const content = saved.content as nbformat.INotebookContent;
    expect(content.cells[0]!.source).toBe('print(2)');
    expect(content.metadata.kernelspec?.name).toBe('python3');
    await waitFor(() => expect(latest()!.dirty).toBe(false));
  });

  it('downloads the notebook with unsaved edits, and stays dirty', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(3)'));
    await waitFor(() => expect(latest()!.dirty).toBe(true));

    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(b => {
      blobs.push(b as Blob);
      return 'blob:notebook';
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('Io.ipynb');
      expect(this.href).toBe('blob:notebook');
    });
    act(() => latest()!.download());
    expect(click).toHaveBeenCalledOnce();
    const content = JSON.parse(await blobs[0]!.text()) as nbformat.INotebookContent;
    expect(content.cells[0]!.source).toBe('print(3)');
    expect(latest()!.dirty).toBe(true);
    create.mockRestore();
    click.mockRestore();
  });

  it('publishes as a web page from the server, saving unsaved edits first', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(4)'));
    await waitFor(() => expect(latest()!.dirty).toBe(true));

    Object.assign(fake.contents, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://server/' }),
    });
    const order: string[] = [];
    fake.contents.save.mockImplementation(async (path: string) => {
      order.push('save');
      return entry({ name: path, path, type: 'notebook' });
    });
    const request = vi.spyOn(ServerConnection, 'makeRequest').mockImplementation(async url => {
      order.push(`get ${String(url)}`);
      const head =
        '<meta name="generator" content="Ganymede 0.11.0">' +
        '<meta name="ganymede-code" content="hidden">';
      return new Response(`${head}</head><h1>Io</h1>`, {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    });
    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(b => {
      blobs.push(b as Blob);
      return 'blob:page';
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('Io.html');
    });
    await act(() => latest()!.publish({ code: 'hidden', byline: '', copy: false }));
    expect(order).toEqual([
      'save',
      'get http://server/nbconvert/html/moons/Io.ipynb?code=hidden&copy=false',
    ]);
    expect(click).toHaveBeenCalledOnce();
    expect(await blobs[0]!.text()).toContain('<h1>Io</h1>');
    request.mockRestore();
    create.mockRestore();
    click.mockRestore();
  });

  it('exports from the server, saving unsaved edits first', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(4)'));
    await waitFor(() => expect(latest()!.dirty).toBe(true));
    Object.assign(fake.contents, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://server/' }),
    });
    const order: string[] = [];
    fake.contents.save.mockImplementation(async (path: string) => {
      order.push('save');
      return entry({ name: path, path, type: 'notebook' });
    });
    const request = vi.spyOn(ServerConnection, 'makeRequest').mockImplementation(async url => {
      order.push(`get ${String(url)}`);
      return new Response('print(4)\n', {
        headers: { 'content-disposition': "attachment; filename*=utf-8''Io.py" },
      });
    });
    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(b => {
      blobs.push(b as Blob);
      return 'blob:export';
    });
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    await act(() => latest()!.exportAs('script'));
    expect(order).toEqual([
      'save',
      'get http://server/nbconvert/script/moons/Io.ipynb?download=true',
    ]);
    expect(names).toEqual(['Io.py']);
    expect(await blobs[0]!.text()).toBe('print(4)\n');
    request.mockRestore();
    create.mockRestore();
    click.mockRestore();
  });

  it('shows why an export failed', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    Object.assign(fake.contents, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://server/' }),
    });
    const request = vi
      .spyOn(ServerConnection, 'makeRequest')
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'nbconvert failed: bad' }), { status: 500 }),
      );
    await act(() => latest()!.exportAs('markdown'));
    expect(screen.getByRole('alert')).toHaveTextContent('nbconvert failed: bad');
    request.mockRestore();
  });

  it('publishes nothing when the save first fails', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(5)'));
    await waitFor(() => expect(latest()!.dirty).toBe(true));
    fake.contents.save.mockRejectedValue(new Error('disk full'));
    const request = vi.spyOn(ServerConnection, 'makeRequest');
    await expect(latest()!.publish({ code: 'folded', byline: '', copy: true })).rejects.toThrow(
      'couldn’t be saved',
    );
    expect(request).not.toHaveBeenCalled();
    request.mockRestore();
  });

  it("shows a kernel that fails to start once: the notice, not also JupyterLab's dialog (#869)", async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as {
      changeKernel: ReturnType<typeof vi.fn>;
      _displayKernelError: (message: string, traceback: string) => Promise<void>;
    };
    const message =
      "io: kernelspec python3 (/k/python3/kernel.json) runs /missing/python, which doesn't exist; reinstall the kernel or fix argv in kernel.json";
    // As JupyterLab's SessionContext does: its dialog, then the rejection.
    session.changeKernel.mockImplementationOnce(async () => {
      void session._displayKernelError(message, '');
      throw new Error(message);
    });
    await act(() => latest()!.run());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Couldn’t run the cell: ${message}`);
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(fakes.kernelErrorDialog).not.toHaveBeenCalled();
  });

  it('starts the kernel the file names on the first run', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    expect(session.changeKernel).not.toHaveBeenCalled();
    await act(() => latest()!.run());
    expect(session.changeKernel).toHaveBeenCalledWith({ name: 'python3' });
  });

  it('clears every output and execution count, as an edit', async () => {
    const withOutput = structuredClone(NOTEBOOK);
    Object.assign(withOutput.cells[0]!, {
      execution_count: 3,
      outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }],
    });
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: withOutput })));
    await waitFor(() => expect(latest()).toBeDefined());
    const cell = modelOf().cells.get(0) as ICodeCellModel;
    expect(cell.outputs.length).toBe(1);
    expect(modelOf().dirty).toBe(false);
    act(() => latest()!.clearOutputs());
    expect(cell.outputs.length).toBe(0);
    expect(cell.executionCount).toBeNull();
    expect(modelOf().dirty).toBe(true);
  });

  it('gives the output labels the run queue, and looks again when a kernel comes (#852)', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    // What "saved output" means is the queue's answer: a cell this page
    // hasn't run (#852), kernel or no kernel.
    expect(outputLabels.options).toBeDefined();
    expect(outputLabels.options!.runs).toBe(runStatus.status);
    const session = fakes.sessions[0] as {
      kernelChanged: { emit(v: unknown): void };
    };
    act(() => session.kernelChanged.emit(null));
    // The kernel came or went, and the pane had the labels look again:
    // output-labels.test.ts covers how.
    expect(outputLabels.refresh).toHaveBeenCalled();
  });

  it('only picks the kernel for the first run while none is running', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    await act(() => latest()!.changeKernel('ts'));
    expect(session.changeKernel).not.toHaveBeenCalled();
    expect(latest()!.kernelName).toBe('ts');
    await act(() => latest()!.runAll());
    expect(session.changeKernel).toHaveBeenCalledWith({ name: 'ts' });
  });

  it('marks a remote’s kernels in the notice’s picker, and says when it isn’t answering (#832)', async () => {
    const nb = structuredClone(NOTEBOOK);
    nb.metadata.kernelspec = { name: 'julia', display_name: 'Julia' };
    const { latest } = setup(
      vi.fn(async () => ({ path: 'moons/Io.ipynb', content: nb })),
      'moons/Io.ipynb',
      undefined,
      {
        remote: { name: 'workmbp', reachable: false, error: 'gateway: error sending request' },
        gateway: ['python3'],
      },
    );
    await waitFor(() => expect(latest()?.status).toBe('none'));
    await act(() => latest()!.run());
    const picker = screen.getByRole('combobox', { name: 'Pick a Kernel' });
    expect(within(picker).getByRole('option', { name: 'Python 3 · workmbp' })).toBeEnabled();
    expect(
      within(picker).getByRole('option', {
        name: 'workmbp isn’t answering: gateway: error sending request',
      }),
    ).toBeDisabled();
  });

  it('records the kernel in the notebook when it is changed', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as { session: unknown; changeKernel: () => void };
    session.session = {};
    await act(() => latest()!.changeKernel('python3'));
    expect(session.changeKernel).toHaveBeenCalledWith({ name: 'python3' });
    expect(modelOf().getMetadata('kernelspec')).toEqual({
      name: 'python3',
      display_name: 'Python 3',
      language: 'python',
    });
  });

  it('opens a notebook whose kernel is not installed, and says so on run', async () => {
    const nb = structuredClone(NOTEBOOK);
    nb.metadata.kernelspec = { name: 'julia', display_name: 'Julia' };
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: nb })));
    await waitFor(() => expect(latest()?.status).toBe('none'));
    expect(latest()).toMatchObject({ missingKernel: 'Julia' });
    expect(latest()!.kernelName).toBeUndefined();

    await act(() => latest()!.run());
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    expect(session.changeKernel).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Io.ipynb uses Julia, which isn’t installed here.',
    );

    // Picking one in the notice clears it, and the next run starts it.
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Pick a Kernel' }), [
      'python3',
    ]);
    await waitFor(() =>
      expect(latest()).toMatchObject({ kernelName: 'python3', missingKernel: undefined }),
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(() => latest()!.run());
    expect(session.changeKernel).toHaveBeenCalledWith({ name: 'python3' });
  });

  describe('problems (#213)', () => {
    type FakeKernel = {
      id?: string;
      name: string;
      status: string;
      connectionStatus: string;
      isDisposed: boolean;
      reconnect: ReturnType<typeof vi.fn>;
    };
    type FakeSession = {
      session: { kernel: FakeKernel } | null;
      changeKernel: ReturnType<typeof vi.fn>;
      statusChanged: { emit(v: unknown): void };
      connectionStatusChanged: { emit(v: unknown): void };
      kernelChanged: { emit(v: unknown): void };
    };
    const kernel = (over: Partial<FakeKernel> = {}): FakeKernel => ({
      name: 'python3',
      status: 'idle',
      connectionStatus: 'connected',
      isDisposed: false,
      reconnect: vi.fn(async () => {}),
      ...over,
    });
    /** Open the notebook with a kernel running. */
    async function running(get?: Parameters<typeof setup>[0]) {
      const s = setup(get);
      await waitFor(() => expect(s.latest()?.status).toBe('none'));
      const session = fakes.sessions[0] as FakeSession;
      session.session = { kernel: kernel() };
      act(() => session.kernelChanged.emit(null));
      await waitFor(() => expect(s.latest()?.status).toBe('idle'));
      return { ...s, session };
    }

    it('shows busy while a cell runs even when the kernel reports idle (#655)', async () => {
      const { latest, session } = await running();
      expect(latest()?.status).toBe('idle');
      // The first run: the page marked the cell running, and the last
      // status the kernel sent was an idle, for another request's busy/idle.
      runStatus.busy = true;
      act(() => runStatus.busyChanged!.emit(true));
      await waitFor(() => expect(latest()?.status).toBe('busy'));
      // A kernel that sent no status yet reads the same.
      session.session!.kernel.status = 'unknown';
      act(() => session.statusChanged.emit('unknown'));
      expect(latest()?.status).toBe('busy');
      // The cell finishes: back to what the kernel says.
      session.session!.kernel.status = 'idle';
      runStatus.busy = false;
      act(() => runStatus.busyChanged!.emit(false));
      await waitFor(() => expect(latest()?.status).toBe('idle'));
    });

    describe('kernel version line (#693)', () => {
      type Info = {
        status: 'ok';
        implementation: string;
        implementation_version: string;
        banner: string;
      };
      const info = (implementation: string, implementation_version: string, banner = ''): Info => ({
        status: 'ok',
        implementation,
        implementation_version,
        banner,
      });
      /** A kernel that announces messages as the library's connection does. */
      const withMessages = (over: Partial<FakeKernel> = {}, first?: Info) => {
        const anyMessage = new Signal<unknown, { msg: unknown; direction: string }>({});
        const k = {
          ...kernel(over),
          anyMessage,
          info: first ? Promise.resolve(first) : new Promise<never>(() => {}),
        };
        const reply = (content: Info, direction = 'recv', type = 'kernel_info_reply') =>
          act(() => anyMessage.emit({ msg: { header: { msg_type: type }, content }, direction }));
        return Object.assign(k, { reply });
      };
      const show = async (k: FakeKernel, s: Awaited<ReturnType<typeof running>>) => {
        s.session.session = { kernel: k };
        act(() => s.session.kernelChanged.emit(null));
        await waitFor(() => expect(s.latest()?.kernelName).toBe(k.name));
      };
      const line = (s: Awaited<ReturnType<typeof running>>) => s.latest()?.kernelVersionLine;

      it('shows the kernel’s reply, the one that came before it listened, and nothing otherwise', async () => {
        const s = await running();
        expect(line(s)).toBeUndefined();
        // Replied before the pane listened: `info` has it.
        await show(
          withMessages({}, info('cdp-kernel', '0.14.0', 'cdp-kernel on node 24.11.0 (V8 13)')),
          s,
        );
        await waitFor(() => expect(line(s)).toBe('cdp-kernel 0.14.0 · node 24.11.0'));
        // A reply without the fields, or not a received kernel_info_reply, says nothing new.
        const k = withMessages({ name: 'x' });
        await show(k, s);
        expect(line(s)).toBeUndefined();
        k.reply(info('', ''));
        expect(line(s)).toBeUndefined();
        k.reply(info('ipython', '8.20.0'), 'send');
        k.reply(info('ipython', '8.20.0'), 'recv', 'status');
        expect(line(s)).toBeUndefined();
        k.reply(info('ipython', '8.20.0'));
        await waitFor(() => expect(line(s)).toBe('ipython 8.20.0'));
      });

      it('follows a kernel switch and ignores the old kernel’s late reply', async () => {
        const s = await running();
        const a = withMessages({ name: 'a' });
        await show(a, s);
        a.reply(info('ipython', '8.20.0'));
        await waitFor(() => expect(line(s)).toBe('ipython 8.20.0'));
        const b = withMessages({ name: 'b' });
        await show(b, s);
        expect(line(s)).toBeUndefined();
        a.reply(info('ipython', '9.9.9'));
        expect(line(s)).toBeUndefined();
        b.reply(info('cdp-kernel', '0.14.0'));
        await waitFor(() => expect(line(s)).toBe('cdp-kernel 0.14.0'));
        a.reply(info('ipython', '9.9.9'));
        expect(line(s)).toBe('cdp-kernel 0.14.0');
      });

      it.each(['restarting', 'autorestarting'])(
        'clears on %s and takes the reply after the connection comes back, not the old kernel’s',
        async state => {
          const s = await running();
          const k = withMessages({}, info('cdp-kernel', '0.14.0'));
          await show(k, s);
          await waitFor(() => expect(line(s)).toBe('cdp-kernel 0.14.0'));
          k.status = state;
          act(() => s.session.statusChanged.emit(state));
          await waitFor(() => expect(line(s)).toBeUndefined());
          // The old socket is still open: its reply is the old kernel's.
          k.reply(info('cdp-kernel', '0.14.0'));
          expect(line(s)).toBeUndefined();
          // The connection goes down and comes back, and asks again.
          k.connectionStatus = 'connecting';
          act(() => s.session.connectionStatusChanged.emit('connecting'));
          k.connectionStatus = 'connected';
          act(() => s.session.connectionStatusChanged.emit('connected'));
          k.reply(info('cdp-kernel', '0.15.0'));
          await waitFor(() => expect(line(s)).toBe('cdp-kernel 0.15.0'));
        },
      );

      it('clears when the kernel dies', async () => {
        const s = await running();
        const k = withMessages({});
        await show(k, s);
        k.reply(info('ipython', '8.20.0'));
        await waitFor(() => expect(line(s)).toBe('ipython 8.20.0'));
        k.status = 'dead';
        act(() => s.session.statusChanged.emit('dead'));
        await waitFor(() => expect(line(s)).toBeUndefined());
        k.reply(info('ipython', '8.20.0'));
        expect(line(s)).toBeUndefined();
      });
    });

    describe('an interrupt that reset the kernel’s state (#796)', () => {
      /** A kernel that announces messages as the library's connection does. */
      const withMessages = (over: Partial<FakeKernel> = {}) => {
        const anyMessage = new Signal<unknown, { msg: unknown; direction: string }>({});
        const k = { ...kernel(over), anyMessage, info: new Promise<never>(() => {}) };
        /** The stderr note cdp-kernel prints when the runtime ends, with `meta` as its metadata. */
        const note = (meta?: unknown, direction = 'recv', type = 'stream') =>
          act(() =>
            anyMessage.emit({
              msg: {
                header: { msg_type: type },
                content: { name: 'stderr', text: '\n[cdp-kernel] restarting on next cell\n' },
                metadata: meta ?? {},
              },
              direction,
            }),
          );
        return Object.assign(k, { note });
      };
      const reset = (reason = 'interrupt') => ({
        cdp_kernel: { state_reset: true, reason, runtime: 'browser' },
      });
      const show = async (k: FakeKernel, s: Awaited<ReturnType<typeof running>>) => {
        s.session.session = { kernel: k };
        act(() => s.session.kernelChanged.emit(null));
        await waitFor(() => expect(s.latest()?.kernelName).toBe(k.name));
      };
      const notice = () => screen.queryByRole('alert');

      it('says so, and Restart & Run All restarts the kernel and then runs every cell', async () => {
        const s = await running();
        const order: string[] = [];
        const k = withMessages();
        Object.assign(k, { restart: vi.fn(async () => void order.push('restart')) });
        const all = vi
          .spyOn(NotebookActions, 'runAll')
          .mockImplementation(async () => (order.push('run all'), true));
        await show(k, s);
        k.note(reset());
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Kernel state was reset by the interrupt.',
        );
        expect(notice()).toHaveClass('problem-state-reset');
        // Nothing runs until the person asks.
        expect(order).toEqual([]);
        await userEvent.click(screen.getByRole('button', { name: 'Restart & Run All' }));
        await waitFor(() => expect(order).toEqual(['restart', 'run all']));
        expect(notice()).not.toBeInTheDocument();
        all.mockRestore();
      });

      it('runs nothing when the restart fails, and Retry does both', async () => {
        const s = await running();
        const k = withMessages();
        const restart = vi
          .fn()
          .mockRejectedValueOnce(new TypeError('Failed to fetch'))
          .mockResolvedValue(undefined);
        Object.assign(k, { restart });
        const all = vi.spyOn(NotebookActions, 'runAll').mockResolvedValue(true);
        await show(k, s);
        k.note(reset());
        await userEvent.click(await screen.findByRole('button', { name: 'Restart & Run All' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Couldn’t reach the server to restart the kernel and run all cells.',
        );
        expect(all).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(all).toHaveBeenCalledOnce());
        expect(restart).toHaveBeenCalledTimes(2);
        all.mockRestore();
      });

      it('says nothing for an interrupt that kept the state, another end, or an older kernel', async () => {
        const s = await running();
        const k = withMessages();
        await show(k, s);
        // An older cdp-kernel's note, or an interrupt a waiting cell answered.
        k.note();
        // The runtime crashed: its note in the output says so.
        k.note(reset('exit'));
        // Not a message the kernel sent, or not a stream.
        k.note(reset(), 'send');
        k.note(reset(), 'recv', 'execute_reply');
        expect(notice()).not.toBeInTheDocument();
        // The same kernel's reset does show: the cases above were refused.
        k.note(reset());
        expect(await screen.findByRole('alert')).toHaveTextContent('Kernel state was reset');
      });

      it.each(['restarting', 'autorestarting'])(
        'goes away on %s, and a note from then on is ignored',
        async state => {
          const s = await running();
          const k = withMessages();
          await show(k, s);
          k.note(reset());
          expect(await screen.findByRole('alert')).toBeInTheDocument();
          k.status = state;
          act(() => s.session.statusChanged.emit(state));
          await waitFor(() => expect(notice()).not.toBeInTheDocument());
          k.note(reset());
          expect(notice()).not.toBeInTheDocument();
        },
      );

      it('goes away when the kernel changes, and the old one’s late note is ignored', async () => {
        const s = await running();
        const a = withMessages({ name: 'a' });
        await show(a, s);
        a.note(reset());
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        const b = withMessages({ name: 'b' });
        await show(b, s);
        await waitFor(() => expect(notice()).not.toBeInTheDocument());
        a.note(reset());
        expect(notice()).not.toBeInTheDocument();
      });

      it('keeps another problem’s notice when the kernel changes', async () => {
        const s = await running();
        const a = withMessages({ name: 'a' });
        await show(a, s);
        a.connectionStatus = 'disconnected';
        act(() => s.session.connectionStatusChanged.emit('disconnected'));
        expect(await screen.findByRole('alert')).toHaveTextContent('Lost the connection');
        // A kernel whose connection is down too, so the lost notice stays for it.
        await show(withMessages({ name: 'b', connectionStatus: 'disconnected' }), s);
        expect(screen.getByRole('alert')).toHaveTextContent('Lost the connection');
      });

      it('offers no Restart & Run All in the journal, and does once it shows the notebook', async () => {
        const s = await running(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: kept() })));
        expect(s.latest()?.journal).toBe(true);
        const k = withMessages();
        const restart = vi.fn(async () => {});
        Object.assign(k, { restart });
        await show(k, s);
        k.note(reset());
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Kernel state was reset by the interrupt.',
        );
        expect(notice()).toHaveTextContent('Choose Open as Notebook');
        expect(screen.queryByRole('button', { name: 'Restart & Run All' })).not.toBeInTheDocument();
        act(() => s.latest()!.toggleJournal());
        await userEvent.click(await screen.findByRole('button', { name: 'Restart & Run All' }));
        await waitFor(() => expect(restart).toHaveBeenCalledOnce());
      });

      it('goes away when the kernel is shut down', async () => {
        const s = await running();
        const k = withMessages();
        await show(k, s);
        k.note(reset());
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        s.session.session = null;
        act(() => s.session.kernelChanged.emit(null));
        await waitFor(() => expect(s.latest()?.status).toBe('none'));
        expect(notice()).not.toBeInTheDocument();
      });

      it('does not restart again when Retry follows a failed Run All', async () => {
        const s = await running();
        const k = withMessages();
        const restart = vi.fn(async () => {});
        Object.assign(k, { restart });
        const all = vi
          .spyOn(NotebookActions, 'runAll')
          .mockRejectedValueOnce(new TypeError('Failed to fetch'))
          .mockResolvedValue(true);
        await show(k, s);
        k.note(reset());
        await userEvent.click(await screen.findByRole('button', { name: 'Restart & Run All' }));
        await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
        await waitFor(() => expect(all).toHaveBeenCalledTimes(2));
        expect(restart).toHaveBeenCalledOnce();
        // A new press restarts again.
        k.note(reset());
        await userEvent.click(await screen.findByRole('button', { name: 'Restart & Run All' }));
        await waitFor(() => expect(restart).toHaveBeenCalledTimes(2));
        all.mockRestore();
      });

      it('Dismiss hides it', async () => {
        const s = await running();
        const k = withMessages();
        await show(k, s);
        k.note(reset());
        await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
        expect(notice()).not.toBeInTheDocument();
      });
    });

    it.each(['restarting', 'autorestarting', 'starting', 'terminating'])(
      'keeps %s while a run is in flight (#655)',
      async state => {
        const { latest, session } = await running();
        runStatus.busy = true;
        session.session!.kernel.status = state;
        act(() => session.statusChanged.emit(state));
        await waitFor(() => expect(latest()?.status).toBe(state));
        act(() => runStatus.busyChanged!.emit(true));
        expect(latest()?.status).toBe(state);
      },
    );

    it('listens for busy changes once, even after the status effect runs again (#655)', async () => {
      const { latest, session, unmount } = await running();
      // `joined` changed while the notebook opened, so the effect has run
      // more than once: only the latest run's handler stays connected.
      expect(runStatus.handlers.size).toBe(1);
      runStatus.busy = true;
      act(() => runStatus.busyChanged!.emit(true));
      await waitFor(() => expect(latest()?.status).toBe('busy'));
      expect(session.session!.kernel.status).toBe('idle');
      unmount();
      expect(runStatus.handlers.size).toBe(0);
    });

    it('does not show busy for a run on a kernel that is dead or not connected (#655)', async () => {
      const { latest, session } = await running();
      runStatus.busy = true;
      const k = session.session!.kernel;
      k.connectionStatus = 'connecting';
      act(() => session.connectionStatusChanged.emit('connecting'));
      await waitFor(() => expect(latest()?.status).toBe('connecting'));
      session.session!.kernel = kernel({
        status: 'dead',
        connectionStatus: 'disconnected',
        isDisposed: true,
      });
      act(() => session.statusChanged.emit('dead'));
      await waitFor(() => expect(latest()?.status).toBe('dead'));
    });

    it('says the kernel died, and Restart starts a new one', async () => {
      const { latest, session } = await running();
      runStatus.clear.mockClear();
      // A dead kernel disposes itself, closing its connection.
      session.session!.kernel = kernel({
        status: 'dead',
        connectionStatus: 'disconnected',
        isDisposed: true,
      });
      act(() => session.statusChanged.emit('dead'));
      await waitFor(() => expect(latest()?.status).toBe('dead'));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The Python 3 kernel stopped. It may have crashed or run out of memory.',
      );
      // The cells it was running aren't running any more.
      expect(runStatus.clear).toHaveBeenCalled();

      session.changeKernel.mockImplementationOnce(async () => {
        session.session!.kernel = kernel();
        session.kernelChanged.emit(null);
        return null;
      });
      await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
      expect(session.changeKernel).toHaveBeenCalledWith({ name: 'python3' });
      await waitFor(() => expect(latest()?.status).toBe('idle'));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says when the kernel’s connection is lost, and Retry reconnects', async () => {
      const { session } = await running();
      const k = session.session!.kernel;
      k.connectionStatus = 'disconnected';
      act(() => session.connectionStatusChanged.emit('disconnected'));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Lost the connection to the kernel.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      expect(k.reconnect).toHaveBeenCalledOnce();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says when the server can’t be reached to save, and Retry saves', async () => {
      const { fake, latest } = setup();
      await waitFor(() => expect(latest()).toBeDefined());
      act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
      fake.contents.save.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await act(() => latest()!.save());
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Couldn’t reach the server to save Io.ipynb.');
      expect(alert).toHaveTextContent('Your edits are still here.');
      expect(latest()!.dirty).toBe(true);

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(fake.contents.save).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(latest()!.dirty).toBe(false));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says when the server can’t be reached to open the file, and Retry opens it', async () => {
      const get = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue({ path: 'moons/Io.ipynb', content: structuredClone(NOTEBOOK) });
      const { latest, onLoadError } = setup(get);
      expect(onLoadError).toHaveBeenCalledWith(false);
      expect(await screen.findByText('Couldn’t open Io.ipynb')).toBeInTheDocument();
      expect(onLoadError).toHaveBeenLastCalledWith(true);
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Couldn’t reach the server to open Io.ipynb.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(latest()).toBeDefined());
      expect(onLoadError).toHaveBeenLastCalledWith(false);
      expect(get).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('says a notebook in a hidden folder may be refused, keeping the server’s message', async () => {
      // A jupyter_server answers 404 for anything under a dot-folder (#337, #390).
      const get = vi
        .fn()
        .mockRejectedValue(new Error('no such file or directory: Users/me/.work/nb/Io.ipynb'));
      setup(get, 'Users/me/.work/nb/Io.ipynb');
      expect(await screen.findByText('Couldn’t open Io.ipynb')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('no such file or directory');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'the server may be refusing it because it is in the hidden folder “.work”',
      );
    });

    it('offers Reload, not Retry, when a chunk of the page failed to load', async () => {
      // Retry would import the same chunk and fail again (#364).
      const get = vi.fn().mockRejectedValue(new TypeError('Importing a module script failed.'));
      const reload = vi.fn();
      const location = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...location, reload },
      });
      try {
        setup(get);
        expect(await screen.findByText('Couldn’t open Io.ipynb')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('Reload to load them.');
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
        expect(reload).toHaveBeenCalledOnce();
        expect(get).toHaveBeenCalledOnce();
      } finally {
        Object.defineProperty(window, 'location', { configurable: true, value: location });
      }
    });

    it('says when a restart can’t reach the server, and Retry restarts', async () => {
      const { latest, session } = await running();
      const restart = vi
        .fn()
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(undefined);
      Object.assign(session.session!.kernel, { restart });
      await act(() => latest()!.restart());
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Couldn’t reach the server to restart the kernel.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(restart).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('restarts the kernel, then runs every cell (#801)', async () => {
      const { latest, session } = await running();
      const order: string[] = [];
      const restart = vi.fn(async () => void order.push('restart'));
      Object.assign(session.session!.kernel, { restart });
      const all = vi
        .spyOn(NotebookActions, 'runAll')
        .mockImplementation(async () => (order.push('run all'), true));
      await act(() => latest()!.restartAndRunAll());
      expect(order).toEqual(['restart', 'run all']);
      all.mockRestore();
    });

    it('does nothing from the journal (#801)', async () => {
      const { latest } = await journalWithOutput();
      const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
      const all = vi.spyOn(NotebookActions, 'runAll').mockResolvedValue(true);
      await act(() => latest()!.restartAndRunAll());
      expect(session.changeKernel).not.toHaveBeenCalled();
      expect(all).not.toHaveBeenCalled();
      all.mockRestore();
    });

    it('does not run the cells when the restart fails (#801)', async () => {
      const { latest, session } = await running();
      const restart = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      Object.assign(session.session!.kernel, { restart });
      const all = vi.spyOn(NotebookActions, 'runAll').mockResolvedValue(true);
      await act(() => latest()!.restartAndRunAll());
      expect(restart).toHaveBeenCalledOnce();
      expect(all).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      all.mockRestore();
    });

    it('says when a run can’t reach the server, and Retry runs again', async () => {
      const { latest } = await running();
      const run = vi
        .spyOn(NotebookActions, 'runAndAdvance')
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValue(true);
      await act(() => latest()!.run());
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Couldn’t reach the server to run the cell.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      run.mockRestore();
    });

    it('offers no Retry when there is nothing to run again', async () => {
      const { latest, session } = await running();
      const interrupt = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      Object.assign(session.session!.kernel, { interrupt });
      act(() => runStatusOptions().interrupt());
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t reach the server to interrupt the kernel.',
      );
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
      expect(latest()).toBeDefined();
    });

    it('shows the lock again once a kernel notice over it clears', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { fake, session } = await running(
        vi.fn(async () => ({
          path: 'moons/Io.ipynb',
          last_modified: '2026-10-20T10:00:00Z',
          content: structuredClone(NOTEBOOK),
        })),
      );
      fake.contents.get.mockResolvedValue({ last_modified: '2026-10-20T10:05:00Z' } as never);
      act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
      await act(() => vi.advanceTimersByTimeAsync(120_000));
      expect(screen.getByRole('alert')).toHaveTextContent('Saving is locked');

      session.session!.kernel = kernel({
        status: 'dead',
        connectionStatus: 'disconnected',
        isDisposed: true,
      });
      act(() => session.statusChanged.emit('dead'));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('The Python 3 kernel stopped.'),
      );
      session.changeKernel.mockImplementationOnce(async () => {
        session.session!.kernel = kernel();
        session.kernelChanged.emit(null);
        return null;
      });
      await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Saving is locked'));
    });

    it('says the kernel ran out of memory when its last reading was near the limit', async () => {
      const GB = 1024 ** 3;
      let available = 8 * GB;
      const asked: string[] = [];
      serverSettings = ServerConnection.makeSettings({
        baseUrl: 'http://server/',
        fetch: ((input: RequestInfo) => {
          asked.push(typeof input === 'string' ? input : input.url);
          return Promise.resolve(
            new Response(
              JSON.stringify({
                content: {
                  kernel_memory: GB,
                  host_virtual_memory: { total: 16 * GB, available },
                },
              }),
            ),
          );
        }) as typeof fetch,
      });
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { latest, session } = await running();
      session.session!.kernel = kernel({ id: 'k1' });
      act(() => session.kernelChanged.emit(null));
      await waitFor(() => expect(asked.some(u => u.includes('/get_usage/k1'))).toBe(true));
      available = GB / 2;
      const before = asked.length;
      await act(() => vi.advanceTimersByTimeAsync(5000));
      await waitFor(() => expect(asked.length).toBeGreaterThan(before));
      await act(() => vi.advanceTimersByTimeAsync(0));
      session.session!.kernel = kernel({
        id: 'k1',
        status: 'dead',
        connectionStatus: 'disconnected',
        isDisposed: true,
      });
      act(() => session.statusChanged.emit('dead'));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'The Python 3 kernel ran out of memory and stopped.',
        ),
      );
      // A run long after the death, when the reading is stale, says the same.
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      const run = vi
        .spyOn(NotebookActions, 'runAndAdvance')
        .mockRejectedValueOnce(new Error('Kernel is dead'));
      await act(() => latest()!.run());
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The Python 3 kernel ran out of memory and stopped.',
      );
      run.mockRestore();
    });

    it('says only that the kernel stopped when its last reading was far from the limit', async () => {
      const GB = 1024 ** 3;
      const asked: string[] = [];
      serverSettings = ServerConnection.makeSettings({
        baseUrl: 'http://server/',
        fetch: ((input: RequestInfo) => {
          asked.push(typeof input === 'string' ? input : input.url);
          return Promise.resolve(
            new Response(
              JSON.stringify({
                content: {
                  kernel_memory: GB,
                  host_virtual_memory: { total: 16 * GB, available: 8 * GB },
                },
              }),
            ),
          );
        }) as typeof fetch,
      });
      const { session } = await running();
      session.session!.kernel = kernel({ id: 'k1' });
      act(() => session.kernelChanged.emit(null));
      await waitFor(() => expect(asked.length).toBeGreaterThan(0));
      session.session!.kernel = kernel({
        id: 'k1',
        status: 'dead',
        connectionStatus: 'disconnected',
        isDisposed: true,
      });
      act(() => session.statusChanged.emit('dead'));
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent(
          'The Python 3 kernel stopped. It may have crashed or run out of memory.',
        ),
      );
    });

    it('says the kernel died when a run fails under a dead kernel', async () => {
      const { latest, session } = await running();
      session.session!.kernel.status = 'dead';
      const run = vi
        .spyOn(NotebookActions, 'runAndAdvance')
        .mockRejectedValueOnce(new Error('Kernel is dead'));
      await act(() => latest()!.run());
      expect(screen.getByRole('alert')).toHaveTextContent('The Python 3 kernel stopped.');
      expect(screen.getByRole('button', { name: 'Restart' })).toBeInTheDocument();
      run.mockRestore();
    });
  });

  it('is connecting, and runs nothing, until it has rejoined a running kernel', async () => {
    let rejoin!: () => void;
    fakes.initialize = session =>
      new Promise<boolean>(resolve => {
        rejoin = () => {
          session.session = {
            kernel: { name: 'python3', anyMessage: new Signal({}), info: new Promise(() => {}) },
          };
          resolve(false);
        };
      });
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    expect(latest()!.status).toBe('connecting');

    const run = latest()!.run();
    act(() => rejoin());
    await act(() => run);
    // The rejoined kernel runs it; none is started in its place.
    expect(session.changeKernel).not.toHaveBeenCalled();
  });

  it('renders markdown without starting a kernel', async () => {
    const nb = structuredClone(NOTEBOOK);
    nb.cells = [{ cell_type: 'markdown', id: 'm1', source: '# Io', metadata: {} }];
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: nb })));
    await waitFor(() => expect(latest()?.status).toBe('none'));
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    await act(() => latest()!.run());
    await act(() => latest()!.runAll());
    expect(session.changeKernel).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('outlines the Markdown headings, follows edits, and goes to a heading’s cell (#212)', async () => {
    const nb = structuredClone(NOTEBOOK);
    nb.cells = [
      { cell_type: 'markdown', id: 'm1', source: '# Io\n## Volcanoes', metadata: {} },
      ...nb.cells,
      { cell_type: 'markdown', id: 'm2', source: '## Plumes', metadata: {} },
    ];
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: nb })));
    await waitFor(() =>
      expect(latest()?.outline).toEqual([
        { level: 1, text: 'Io', cell: 0 },
        { level: 2, text: 'Volcanoes', cell: 0, ran: false },
        { level: 2, text: 'Plumes', cell: 2 },
      ]),
    );
    // An edit shows a moment later.
    act(() => modelOf().cells.get(2).sharedModel.setSource('## Plumes & rings'));
    await waitFor(() => expect(latest()?.outline.at(-1)?.text).toBe('Plumes & rings'));
    // A cell going updates it at once, so no heading points at the
    // wrong cell meanwhile.
    act(() => modelOf().sharedModel.deleteCell(0));
    expect(latest()?.outline).toEqual([{ level: 2, text: 'Plumes & rings', cell: 1 }]);

    const notebook = fakes.notebooks[0] as {
      activeCellIndex?: number;
      mode?: string;
      scrollToCell: ReturnType<typeof vi.fn>;
    };
    expect(latest()!.goToCell(1)).toBe(true);
    expect(notebook.activeCellIndex).toBe(1);
    expect(notebook.mode).toBe('command');
    expect(notebook.scrollToCell).toHaveBeenCalledWith(
      expect.objectContaining({ model: modelOf().cells.get(1) }),
      'start',
    );
    expect(latest()!.goToCell(5)).toBe(false);
  });

  it('searches the cells for the app’s Find tab, and follows edits and a cleared field (#879)', async () => {
    const nb = structuredClone(NOTEBOOK);
    nb.cells = [
      { cell_type: 'markdown', id: 'm1', source: '# Io\n## Volcanoes', metadata: {} },
      ...nb.cells,
      {
        cell_type: 'code',
        id: 'a2',
        source: 'plume = 2',
        metadata: {},
        outputs: [],
        execution_count: null,
      },
    ];
    const { latest, renderWith } = setup(
      vi.fn(async () => ({ path: 'moons/Io.ipynb', content: nb })),
    );
    await waitFor(() => expect(latest()).toBeDefined());
    // Nothing while the field is empty.
    expect(latest()!.notebookFind).toBeNull();
    renderWith('volcano');
    await waitFor(() =>
      expect(latest()?.notebookFind).toEqual({
        query: 'volcano',
        matches: [{ cell: 0, heading: 'Volcanoes', snippet: '## Volcanoes' }],
        more: 0,
      }),
    );
    // A match in a later cell keeps the heading above it.
    renderWith('  plume  ');
    await waitFor(() =>
      expect(latest()?.notebookFind).toEqual({
        query: 'plume',
        matches: [{ cell: 2, heading: 'Volcanoes', snippet: 'plume = 2' }],
        more: 0,
      }),
    );
    // An edit shows a moment later.
    act(() => modelOf().cells.get(2).sharedModel.setSource('plume = 3'));
    await waitFor(() => expect(latest()?.notebookFind?.matches[0].snippet).toBe('plume = 3'));
    // Clearing the field clears the matches.
    renderWith('');
    await waitFor(() => expect(latest()?.notebookFind).toBeNull());
  });

  it('moves the Find rows with a cell at once, before the edits’ wait (#879)', async () => {
    const nb = structuredClone(NOTEBOOK);
    nb.cells = ['plume = 1', 'plume = 2'].map((source, i) => ({
      cell_type: 'code',
      id: `a${i + 1}`,
      source,
      metadata: {},
      outputs: [],
      execution_count: null,
    }));
    const { latest, renderWith } = setup(
      vi.fn(async () => ({ path: 'moons/Io.ipynb', content: nb })),
    );
    await waitFor(() => expect(latest()).toBeDefined());
    vi.useFakeTimers();
    renderWith('plume');
    // The query's own answer, at once: the app's field already waited for
    // typing to stop (#881).
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(latest()!.notebookFind?.matches.map(m => m.cell)).toEqual([0, 1]);
    // A cell inserted above them moves them at once, with no wait: a row
    // that took the debounce would point at the wrong cell meanwhile.
    act(() => modelOf().sharedModel.insertCell(0, { cell_type: 'markdown', source: '# Io' }));
    expect(latest()!.notebookFind?.matches.map(m => m.cell)).toEqual([1, 2]);
  });

  it('goes to a definition and renames a symbol through the language service, and shows its refusals (#676)', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()?.status).toBe('none'));
    await expect(latest()!.goToDefinition()).resolves.toBe(true);
    expect(language.goToDefinition).toHaveBeenCalledTimes(1);
    await expect(latest()!.renameSymbol('sum')).resolves.toBe(true);
    expect(language.rename).toHaveBeenCalledWith('sum');
    await latest()!.renameSymbol();
    expect(language.rename).toHaveBeenLastCalledWith(undefined);
    act(() => language.notify!('Can’t rename: "process" is declared outside the notebook'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Can’t rename: "process" is declared outside the notebook',
    );
  });

  it('starts one kernel for runs that come in while it starts', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()?.status).toBe('none'));
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    await act(() => Promise.all([latest()!.run(), latest()!.runAll()]));
    expect(session.changeKernel).toHaveBeenCalledTimes(1);
  });

  it('waits for a kernel start before disposing the session when the pane goes (#461)', async () => {
    const { latest, unmount } = setup();
    await waitFor(() => expect(latest()?.status).toBe('none'));
    const session = fakes.sessions[0] as {
      changeKernel: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    };
    let started!: () => void;
    session.changeKernel.mockImplementation(
      () => new Promise<null>(r => (started = () => r(null))),
    );
    let running!: Promise<unknown>;
    act(() => void (running = latest()!.run()));
    await waitFor(() => expect(session.changeKernel).toHaveBeenCalled());
    // Another notebook opens while the kernel starts.
    unmount();
    await new Promise(r => setTimeout(r, 10));
    expect(session.dispose).not.toHaveBeenCalled();
    await act(async () => {
      started();
      await running;
    });
    await waitFor(() => expect(session.dispose).toHaveBeenCalled());
  });

  it('starts no kernel for a run that waited on the join when the pane goes (#461)', async () => {
    let join!: () => void;
    fakes.initialize = () => new Promise(r => (join = () => r(false)));
    const { latest, unmount } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as {
      changeKernel: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    };
    let running!: Promise<unknown>;
    act(() => void (running = latest()!.run()));
    unmount();
    await new Promise(r => setTimeout(r, 10));
    // Still joining: the session stays.
    expect(session.dispose).not.toHaveBeenCalled();
    await act(async () => {
      join();
      await running;
    });
    await waitFor(() => expect(session.dispose).toHaveBeenCalled());
    expect(session.changeKernel).not.toHaveBeenCalled();
  });

  it('also waits for a kernel change made after the teardown began (#461)', async () => {
    let join!: () => void;
    fakes.initialize = () => new Promise(r => (join = () => r(false)));
    const { latest, unmount } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const controller = latest()!;
    const ctx = fakes.sessions[0] as {
      session: unknown;
      changeKernel: ReturnType<typeof vi.fn>;
      dispose: ReturnType<typeof vi.fn>;
    };
    unmount();
    // The teardown is waiting on the join.
    await new Promise(r => setTimeout(r, 10));
    let changed!: () => void;
    ctx.changeKernel.mockImplementation(() => new Promise<null>(r => (changed = () => r(null))));
    ctx.session = { kernel: { name: 'python3' } };
    let changing!: Promise<unknown>;
    act(() => void (changing = controller.changeKernel('ts')));
    await act(async () => join());
    await new Promise(r => setTimeout(r, 10));
    expect(ctx.dispose).not.toHaveBeenCalled();
    await act(async () => {
      changed();
      await changing;
    });
    await waitFor(() => expect(ctx.dispose).toHaveBeenCalled());
  });

  it('starts the newly picked kernel after the running one is shut down', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()?.status).toBe('none'));
    const session = fakes.sessions[0] as {
      session: unknown;
      changeKernel: ReturnType<typeof vi.fn>;
    };
    session.session = { kernel: { name: 'python3' } };
    await act(() => latest()!.changeKernel('ts'));
    session.session = null;
    session.changeKernel.mockClear();
    await act(() => latest()!.run());
    expect(session.changeKernel).toHaveBeenCalledWith({ name: 'ts' });
  });

  it('says why a file could not be opened', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Permission denied')));
    expect(await screen.findByText('Couldn’t open Io.ipynb')).toBeInTheDocument();
    expect(screen.getByText('Permission denied')).toBeInTheDocument();
  });

  it('adds completion, tooltips, find and the cell toolbar to the notebook', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    expect(fakes.editing).toHaveLength(1);
    const [notebook, session] = vi.mocked(attachEditing).mock.lastCall!;
    expect(notebook).toBe(fakes.notebooks[0]);
    expect(session).toBe(fakes.sessions[0]);
  });

  it('saves the widget state into the notebook before saving it', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const widgets = fakes.widgets[0]!;
    vi.mocked(widgets.saveState).mockImplementation(m =>
      (m as NotebookModel).setMetadata('widgets', { saved: true }),
    );
    await act(() => latest()!.save());
    expect(widgets.saveState).toHaveBeenCalledWith(modelOf());
    const content = fake.contents.save.mock.calls[0]![1].content as nbformat.INotebookContent;
    expect(content.metadata.widgets).toEqual({ saved: true });
  });

  it('is trusted when no code cell shows untrusted output', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    expect(latest()!.trusted).toBe(true);
  });

  it('trusts a notebook with untrusted output, locally and on the backend', async () => {
    const { fake, latest } = setup(
      vi.fn(async () => ({ path: 'moons/Io.ipynb', content: untrusted() })),
    );
    await waitFor(() => expect(latest()).toBeDefined());
    expect(latest()!.trusted).toBe(false);

    await act(() => latest()!.trust());
    const model = modelOf();
    for (let i = 0; i < model.cells.length; i++) expect(model.cells.get(i).trusted).toBe(true);
    expect(trustNotebook).toHaveBeenCalledWith(
      expect.objectContaining({ services: fake.services }),
      'moons/Io.ipynb',
    );
    await waitFor(() => expect(latest()!.trusted).toBe(true));
    // Trusting is not an edit.
    expect(latest()!.dirty).toBe(false);
  });

  it('saves its edits before a reload the page starts (#375)', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    const reload = vi.fn();
    const ask = vi.fn(() => false);
    expect(await act(() => reloadPage(reload, ask))).toBe(true);
    expect(fake.contents.save).toHaveBeenCalledWith('moons/Io.ipynb', expect.anything());
    expect(ask).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalledOnce();

    // A save that fails asks before the reload.
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(3)'));
    fake.contents.save.mockRejectedValueOnce(new Error('Disk full'));
    expect(await act(() => reloadPage(reload, ask))).toBe(false);
    expect(ask).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  describe('Reload after a chunk failed, with the last notebook still saving (#375)', () => {
    /** As App: Io open with an edit, then Europa opened, whose chunk fails. */
    async function switching() {
      const fake = fakeServices();
      fake.contents.get = vi.fn(async (path: string) => {
        if (path === 'moons/Europa.ipynb') {
          throw new TypeError('Importing a module script failed.');
        }
        return { path, content: structuredClone(NOTEBOOK), last_modified: '' };
      }) as never;
      const backend = fakeBackend(fake.services);
      let open!: (path: string) => void;
      function Parent() {
        const [path, setPath] = useState('moons/Io.ipynb');
        open = setPath;
        const report = useCallback(() => {}, []);
        return <NotebookPane key={path} backend={backend} path={path} onController={report} />;
      }
      render(<Parent />);
      await waitFor(() => expect(fakes.notebooks).toHaveLength(1));
      await waitFor(() => expect(fakes.sessions).toHaveLength(1));
      act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
      let finish!: (e?: Error) => void;
      fake.contents.save.mockImplementationOnce(
        (path: string) =>
          new Promise((resolve, reject) => {
            finish = e => (e ? reject(e) : resolve(entry({ name: path, path, type: 'notebook' })));
          }),
      );
      act(() => open('moons/Europa.ipynb'));
      await userEvent.click(await screen.findByRole('button', { name: 'Reload' }));
      expect(fake.contents.save).toHaveBeenCalledWith('moons/Io.ipynb', expect.anything());
      return finish;
    }

    let reload: ReturnType<typeof vi.fn>;
    const location = window.location;
    beforeEach(() => {
      reload = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...location, reload },
      });
    });
    afterEach(() => {
      Object.defineProperty(window, 'location', { configurable: true, value: location });
      vi.restoreAllMocks();
    });

    it('waits for that save, then reloads without asking', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const finish = await switching();
      expect(reload).not.toHaveBeenCalled();
      await act(async () => finish());
      await waitFor(() => expect(reload).toHaveBeenCalledOnce());
      expect(confirm).not.toHaveBeenCalled();
    });

    it('says why that save failed, and stays on No', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const finish = await switching();
      await act(async () => finish(new Error('Disk full')));
      await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
      expect(confirm.mock.calls[0]![0]).toContain(
        'Couldn’t save the latest edits to Io.ipynb: Disk full',
      );
      expect(reload).not.toHaveBeenCalled();
    });
  });

  it('shows why a save failed, and stays dirty', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    fake.contents.save.mockRejectedValueOnce(new Error('Disk full'));
    await act(() => latest()!.save());
    expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t save Io.ipynb: Disk full');
    expect(screen.getByRole('alert')).toHaveTextContent('Your edits are still here.');
    expect(latest()!.dirty).toBe(true);
    // Retry is offered; Dismiss leaves it.
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('settles under a parent that keeps its controller and passes a new onRenamed each render', async () => {
    const fake = fakeServices();
    fake.contents.get = vi.fn(async () => ({
      path: 'moons/Io.ipynb',
      content: structuredClone(NOTEBOOK),
    })) as never;
    const onController = vi.fn();
    const backend = fakeBackend(fake.services);
    function Parent() {
      const [, setController] = useState<unknown>();
      // As App: a stable onController, an onRenamed made anew each render.
      const report = useCallback((c: unknown) => {
        onController(c);
        setController(c);
      }, []);
      return (
        <NotebookPane
          backend={backend}
          path="moons/Io.ipynb"
          onController={report}
          onRenamed={() => {}}
        />
      );
    }
    render(<Parent />);
    await waitFor(() => expect(onController).toHaveBeenCalledWith(expect.anything()));
    await new Promise(r => setTimeout(r, 200));
    expect(onController.mock.calls.length).toBeLessThan(20);
  });

  describe('rename', () => {
    /** The notebook, and nothing else: `taken` names a file that exists too. */
    const files = (taken?: string) =>
      vi.fn(async (path: string) => {
        if (path === 'moons/Io.ipynb') {
          return { path, content: structuredClone(NOTEBOOK), last_modified: '' };
        }
        if (path === taken) return { path, type: 'notebook' };
        throw new Error('Not found');
      }) as unknown as Parameters<typeof setup>[0];

    it('saves unsaved edits, renames the file and opens it there', async () => {
      const { fake, latest, onRenamed } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
      await waitFor(() => expect(latest()!.dirty).toBe(true));

      let ok: boolean | undefined;
      await act(async () => void (ok = await latest()!.rename('Europa')));
      expect(ok).toBe(true);
      expect(fake.contents.save).toHaveBeenCalledWith('moons/Io.ipynb', expect.anything());
      expect(fake.contents.rename).toHaveBeenCalledWith('moons/Io.ipynb', 'moons/Europa.ipynb');
      expect(fake.contents.save.mock.invocationCallOrder[0]).toBeLessThan(
        fake.contents.rename.mock.invocationCallOrder[0]!,
      );
      expect(onRenamed).toHaveBeenCalledWith('moons/Io.ipynb', 'moons/Europa.ipynb');
    });

    it('saves edits made during the rename to the new file', async () => {
      const { fake, latest, onRenamed } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      // An edit lands while the rename is on its way.
      fake.contents.rename.mockImplementationOnce(async (_from: string, to: string) => {
        modelOf().cells.get(0).sharedModel.setSource('print(3)');
        return entry({ name: to, path: to, type: 'notebook' });
      });
      await act(async () => void (await latest()!.rename('Europa')));
      expect(fake.contents.save).toHaveBeenLastCalledWith(
        'moons/Europa.ipynb',
        expect.objectContaining({ type: 'notebook' }),
      );
      const saved = fake.contents.save.mock.lastCall![1] as { content: nbformat.INotebookContent };
      expect(saved.content.cells[0]!.source).toBe('print(3)');
      expect(onRenamed).toHaveBeenCalledWith('moons/Io.ipynb', 'moons/Europa.ipynb');
    });

    it('saves edits made while the session moves to the new file', async () => {
      const { fake, latest } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      const session = {
        setPath: vi.fn(async () => {
          modelOf().cells.get(0).sharedModel.setSource('print(5)');
        }),
        setName: vi.fn(async () => {}),
      };
      (fakes.sessions[0] as { session: unknown }).session = session;
      await act(async () => void (await latest()!.rename('Europa')));
      expect(session.setPath).toHaveBeenCalledWith('moons/Europa.ipynb');
      const saved = fake.contents.save.mock.lastCall!;
      expect(saved[0]).toBe('moons/Europa.ipynb');
      expect((saved[1] as { content: nbformat.INotebookContent }).content.cells[0]!.source).toBe(
        'print(5)',
      );
    });

    it('sends a save made during the rename to the new path', async () => {
      const { fake, latest } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      let finish!: () => void;
      fake.contents.rename.mockImplementationOnce(async (_from: string, to: string) => {
        await new Promise<void>(r => (finish = r));
        return entry({ name: to, path: to, type: 'notebook' });
      });
      let renaming!: Promise<boolean>;
      act(() => void (renaming = latest()!.rename('Europa')));
      await waitFor(() => expect(fake.contents.rename).toHaveBeenCalled());
      // ⌘S, mid-rename, with an edit to save.
      act(() => modelOf().cells.get(0).sharedModel.setSource('print(6)'));
      let saving!: Promise<boolean>;
      act(() => void (saving = latest()!.save()));
      await act(async () => {
        finish();
        await renaming;
        await saving;
      });
      const paths = fake.contents.save.mock.calls.map(c => c[0]);
      expect(paths).toContain('moons/Europa.ipynb');
      expect(paths).not.toContain('moons/Io.ipynb');
    });

    it('moves the session once it has joined, even if the pane goes meanwhile', async () => {
      let join!: () => void;
      fakes.initialize = () => new Promise(r => (join = () => r(false)));
      const { latest, unmount, onRenamed } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      const ctx = fakes.sessions[0] as { session: unknown; dispose: () => void };
      const session = { setPath: vi.fn(async () => {}), setName: vi.fn(async () => {}) };
      let renaming!: Promise<boolean>;
      act(() => void (renaming = latest()!.rename('Europa')));
      // Another notebook opens before the session has joined.
      unmount();
      ctx.session = session;
      await act(async () => {
        join();
        await renaming;
      });
      expect(session.setPath).toHaveBeenCalledWith('moons/Europa.ipynb');
      await waitFor(() => expect(ctx.dispose).toHaveBeenCalled());
      expect(vi.mocked(ctx.dispose).mock.invocationCallOrder[0]).toBeGreaterThan(
        session.setPath.mock.invocationCallOrder[0]!,
      );
      expect(onRenamed).toHaveBeenCalledWith('moons/Io.ipynb', 'moons/Europa.ipynb');
    });

    it('clears a failed rename’s notice when the name goes back', async () => {
      const { latest } = setup(files('moons/Europa.ipynb'));
      await waitFor(() => expect(latest()).toBeDefined());
      await act(async () => void (await latest()!.rename('Europa')));
      expect(screen.getByRole('alert')).toBeInTheDocument();
      await act(async () => void (await latest()!.rename('Io')));
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does nothing for the same name', async () => {
      const { fake, latest, onRenamed } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      await act(async () => void (await latest()!.rename(' Io ')));
      expect(fake.contents.rename).not.toHaveBeenCalled();
      expect(onRenamed).not.toHaveBeenCalled();
    });

    it('won’t replace a file that exists', async () => {
      const { fake, latest, onRenamed } = setup(files('moons/Europa.ipynb'));
      await waitFor(() => expect(latest()).toBeDefined());
      let ok: boolean | undefined;
      await act(async () => void (ok = await latest()!.rename('Europa.ipynb')));
      expect(ok).toBe(false);
      expect(fake.contents.rename).not.toHaveBeenCalled();
      expect(onRenamed).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Couldn’t rename Io.ipynb: “Europa.ipynb” already exists. Choose another name.',
      );
    });

    it('moves its session and later edits when its folder moves', async () => {
      const { fake, latest } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      const session = { setPath: vi.fn(async () => {}), setName: vi.fn(async () => {}) };
      (fakes.sessions[0] as { session: unknown }).session = session;
      act(() => modelOf().cells.get(0).sharedModel.setSource('print(4)'));
      await waitFor(() => expect(latest()!.dirty).toBe(true));

      const folderMove = vi.fn(async () => {});
      await act(() => latest()!.moved('satellites/Io.ipynb', folderMove));
      expect(folderMove).toHaveBeenCalledOnce();
      expect(fake.contents.save).toHaveBeenCalledWith(
        'satellites/Io.ipynb',
        expect.objectContaining({ type: 'notebook' }),
      );
      expect(session.setPath).toHaveBeenCalledWith('satellites/Io.ipynb');
      expect(session.setName).toHaveBeenCalledWith('Io.ipynb');
      // Later saves go to the new path too.
      fake.contents.save.mockClear();
      act(() => modelOf().cells.get(0).sharedModel.setSource('print(7)'));
      await act(() => latest()!.save());
      expect(fake.contents.save).toHaveBeenCalledWith('satellites/Io.ipynb', expect.anything());
      expect(fake.contents.save).not.toHaveBeenCalledWith('moons/Io.ipynb', expect.anything());
    });

    it('moves a kernel started while the file was being renamed', async () => {
      const { fake, latest } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      let finish!: () => void;
      fake.contents.rename.mockImplementationOnce(async (_from: string, to: string) => {
        await new Promise<void>(r => (finish = r));
        return entry({ name: to, path: to, type: 'notebook' });
      });
      let renaming!: Promise<boolean>;
      act(() => void (renaming = latest()!.rename('Europa')));
      await waitFor(() => expect(fake.contents.rename).toHaveBeenCalled());
      // A run starts the first kernel while the rename is on its way.
      const session = { setPath: vi.fn(async () => {}), setName: vi.fn(async () => {}) };
      (fakes.sessions[0] as { session: unknown }).session = session;
      await act(async () => {
        finish();
        await renaming;
      });
      expect(session.setPath).toHaveBeenCalledWith('moons/Europa.ipynb');
      expect(session.setName).toHaveBeenCalledWith('Europa.ipynb');
    });

    it('also rejects with why a rename failed, for a caller that shows it', async () => {
      const { latest } = setup(files('moons/Europa.ipynb'));
      await waitFor(() => expect(latest()).toBeDefined());
      await act(() =>
        expect(latest()!.rename('Europa', { throws: true })).rejects.toThrow(
          '“Europa.ipynb” already exists. Choose another name.',
        ),
      );
      expect(screen.getByRole('alert')).toHaveTextContent('Couldn’t rename Io.ipynb');
    });

    describe('reopened at the new path', () => {
      /** As App: the pane remounts at the new path when it is renamed. */
      function reopening(fake: ReturnType<typeof fakeServices>) {
        const controllers: (NotebookController | undefined)[] = [];
        const backend = fakeBackend(fake.services);
        function Parent() {
          const [path, setPath] = useState('moons/Io.ipynb');
          const report = useCallback(
            (c: NotebookController | undefined) => void controllers.push(c),
            [],
          );
          return (
            <NotebookPane
              key={path}
              backend={backend}
              path={path}
              onController={report}
              onRenamed={(from, to) => setPath(p => (p === from ? to : p))}
            />
          );
        }
        render(<Parent />);
        return () => controllers[controllers.length - 1];
      }

      /** Io's notebook, at either name, once it is there. */
      const both = (fake: ReturnType<typeof fakeServices>) =>
        vi.fn(async (path: string) => {
          const renamed = fake.contents.rename.mock.calls.length > 0;
          if (path !== (renamed ? 'moons/Europa.ipynb' : 'moons/Io.ipynb')) {
            throw new Error('Not found');
          }
          return { path, content: structuredClone(NOTEBOOK), last_modified: '' };
        }) as never;

      it('says why the edits typed during the rename weren’t saved', async () => {
        const fake = fakeServices();
        fake.contents.get = both(fake);
        const latest = reopening(fake);
        await waitFor(() => expect(latest()).toBeDefined());
        fake.contents.rename.mockImplementationOnce(async (_from: string, to: string) => {
          modelOf().cells.get(0).sharedModel.setSource('print(8)');
          return entry({ name: to, path: to, type: 'notebook' });
        });
        fake.contents.save.mockRejectedValue(new Error('Disk full'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        await act(async () => void (await latest()!.rename('Europa')));
        await waitFor(() => expect(latest()?.path).toBe('moons/Europa.ipynb'));
        expect(await screen.findByRole('alert')).toHaveTextContent(
          'Couldn’t save the latest edits to Europa.ipynb: Disk full',
        );
        vi.mocked(console.error).mockRestore();
      });

      it('loads the file after the old pane’s last save', async () => {
        const fake = fakeServices();
        fake.contents.get = both(fake);
        const latest = reopening(fake);
        await waitFor(() => expect(latest()).toBeDefined());
        const edit = (source: string) => modelOf().cells.get(0).sharedModel.setSource(source);
        // An edit during the rename, and another during the save of that one.
        fake.contents.rename.mockImplementationOnce(async (_from: string, to: string) => {
          edit('print(9)');
          return entry({ name: to, path: to, type: 'notebook' });
        });
        let finish!: () => void;
        fake.contents.save
          .mockImplementationOnce(async (path: string) => {
            edit('print(10)');
            return entry({ name: path, path, type: 'notebook' });
          })
          // The old pane's teardown save, of the last edit.
          .mockImplementationOnce(async (path: string) => {
            await new Promise<void>(r => (finish = r));
            return entry({ name: path, path, type: 'notebook' });
          });
        await act(async () => void (await latest()!.rename('Europa')));
        await waitFor(() => expect(fake.contents.save).toHaveBeenCalledTimes(2));
        // The new pane's loads, not the rename's check that nothing is there.
        const loads = () =>
          (fake.contents.get.mock.calls as unknown as [string, { content?: boolean }][]).filter(
            ([path, options]) => path === 'moons/Europa.ipynb' && options?.content,
          );
        await new Promise(r => setTimeout(r, 50));
        expect(loads()).toHaveLength(0);
        await act(async () => finish());
        await waitFor(() => expect(loads()).toHaveLength(1));
        await waitFor(() => expect(latest()?.path).toBe('moons/Europa.ipynb'));
      });
    });

    it('says why a rename failed', async () => {
      const { fake, latest, onRenamed } = setup(files());
      await waitFor(() => expect(latest()).toBeDefined());
      fake.contents.rename.mockRejectedValueOnce(new Error('Permission denied'));
      let ok: boolean | undefined;
      await act(async () => void (ok = await latest()!.rename('Europa')));
      expect(ok).toBe(false);
      expect(onRenamed).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Couldn’t rename Io.ipynb: Permission denied',
      );
    });
  });

  it('reports the active cell type and changes it', async () => {
    const { latest } = setup(
      vi.fn(async () => ({ path: 'moons/Io.ipynb', content: untrusted(true) })),
    );
    await waitFor(() => expect(latest()).toBeDefined());
    await waitFor(() => expect(latest()?.cellType).toBe('code'));
    const notebook = fakes.notebooks[0] as {
      activeCellIndex: number;
      activeCellChanged: { emit(v: unknown): void };
      activate(): void;
    };
    // The markdown cell becomes active.
    act(() => {
      notebook.activeCellIndex = 2;
      notebook.activeCellChanged.emit(null);
    });
    await waitFor(() => expect(latest()?.cellType).toBe('markdown'));

    const change = vi.spyOn(NotebookActions, 'changeCellType').mockImplementation(() => {});
    const activate = vi.spyOn(notebook, 'activate');
    act(() => latest()!.changeCellType('raw'));
    expect(change).toHaveBeenCalledWith(notebook, 'raw');
    expect(activate).toHaveBeenCalled();
    change.mockRestore();
  });

  it('runs the notebook’s own commands for the app, and says when one fails', async () => {
    const { CommandRegistry } = await import('@lumino/commands');
    const { createCommands } = await import('../lib/jupyterlab');
    const registry = new CommandRegistry();
    const moveUp = vi.fn(async () => {
      throw new Error('no cell');
    });
    registry.addCommand('move-up', { execute: moveUp });
    registry.addCommand('find-close', { execute: vi.fn(), isEnabled: () => false });
    vi.mocked(createCommands).mockReturnValueOnce(registry);
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());

    expect(latest()!.command('no-such-command')).toBe(false);
    // Disabled: nothing to close.
    expect(latest()!.command('find-close')).toBe(false);
    expect(latest()!.command('move-up')).toBe(true);
    expect(moveUp).toHaveBeenCalled();
    expect(await screen.findByText(/Couldn’t move-up: no cell/)).toBeInTheDocument();
  });

  it('shows why a kernel action failed', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as {
      session: unknown;
      changeKernel: ReturnType<typeof vi.fn>;
    };
    session.session = {};
    session.changeKernel.mockRejectedValueOnce(new Error('No such kernel: julia'));
    await act(() => latest()!.changeKernel('julia'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t change the kernel: No such kernel: julia',
    );
  });

  /** A pane on a file loaded at 10:00 that someone else then saved at 10:05. */
  async function changedOnDisk() {
    const loaded = '2026-10-20T10:00:00Z';
    const t = setup(
      vi.fn(async () => ({
        path: 'moons/Io.ipynb',
        last_modified: loaded,
        content: structuredClone(NOTEBOOK),
      })),
    );
    await waitFor(() => expect(t.latest()).toBeDefined());
    const change = (at = '2026-10-20T10:05:00Z') =>
      t.fake.contents.get.mockImplementation((async (_: string, o?: { content?: boolean }) =>
        o?.content
          ? { path: 'moons/Io.ipynb', last_modified: at, content: structuredClone(NOTEBOOK) }
          : { last_modified: at }) as never);
    return { ...t, change };
  }

  it('publishes nothing while saving is locked', async () => {
    const { latest, change } = await changedOnDisk();
    change();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    await act(() => latest()!.save());
    expect(latest()!.locked).toBe(true);
    const request = vi.spyOn(ServerConnection, 'makeRequest');
    await expect(latest()!.publish({ code: 'folded', byline: '', copy: true })).rejects.toThrow(
      'changed on disk',
    );
    expect(request).not.toHaveBeenCalled();
    request.mockRestore();
  });

  it('publishes nothing from a clean notebook locked by a change on disk', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { latest, change } = await changedOnDisk();
    const cell = modelOf().cells.get(0) as ICodeCellModel;
    act(() => (cell.executionState = 'running'));
    change();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(() => expect(latest()!.locked).toBe(true));
    expect(modelOf().dirty).toBe(false);
    const request = vi.spyOn(ServerConnection, 'makeRequest');
    await expect(latest()!.publish({ code: 'folded', byline: '', copy: true })).rejects.toThrow(
      'changed on disk',
    );
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Saving is locked');
    request.mockRestore();
  });

  it('keeps the lock notice when the export’s save finds the file changed on disk', async () => {
    const { fake, latest, change } = await changedOnDisk();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    change();
    expect(latest()!.locked).toBe(false);
    const request = vi.spyOn(ServerConnection, 'makeRequest');
    await act(() => latest()!.exportAs('markdown'));
    expect(fake.contents.save).not.toHaveBeenCalled();
    expect(latest()!.locked).toBe(true);
    expect(request).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Saving is locked');
    expect(within(alert).getByRole('button', { name: 'Unlock' })).toBeVisible();
    expect(alert).not.toHaveTextContent('Couldn’t export');
    request.mockRestore();
  });

  it('exports nothing while saving is locked, and says so again', async () => {
    const { latest, change } = await changedOnDisk();
    change();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    await act(() => latest()!.save());
    expect(latest()!.locked).toBe(true);
    const request = vi.spyOn(ServerConnection, 'makeRequest');
    await act(() => latest()!.exportAs('markdown'));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Saving is locked');
    request.mockRestore();
  });

  it('locks saving when a save finds the file changed on disk, until Unlock', async () => {
    const { fake, latest, change } = await changedOnDisk();
    change();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    const confirm = vi.spyOn(window, 'confirm');

    expect(await act(() => latest()!.save())).toBe(false);
    expect(fake.contents.save).not.toHaveBeenCalled();
    expect(latest()!.locked).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Io.ipynb changed on disk. Saving is locked',
    );
    // Locked: a second save doesn't ask to overwrite, it says why not.
    expect(await act(() => latest()!.save())).toBe(false);
    expect(fake.contents.save).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(latest()!.dirty).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    expect(latest()!.locked).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await act(() => latest()!.save())).toBe(true);
    expect(fake.contents.save).toHaveBeenCalledOnce();
    // Over the version that locked it, which is now the base.
    expect(fake.contents.save.mock.calls[0]![1]).toMatchObject({
      last_modified: '2026-10-20T10:05:00Z',
    });
    await waitFor(() => expect(latest()!.dirty).toBe(false));
    confirm.mockRestore();
  });

  it('locks again on a change after Unlock, rather than writing over it', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fake, latest, change } = await changedOnDisk();
    change();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    await act(async () => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(latest()!.locked).toBe(true));
    // Unlocked: saves write over that version, and the checks go on.
    await userEvent.click(screen.getByRole('button', { name: 'Unlock' }));
    await waitFor(() => expect(latest()!.locked).toBe(false));

    change('2026-10-20T10:10:00Z');
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(() => expect(latest()!.locked).toBe(true));
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fake.contents.save).not.toHaveBeenCalled();
  });

  it('saves before letting the notebook go once unlocked', async () => {
    const { fake, latest, change, unmount } = await changedOnDisk();
    change();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    expect(await act(() => latest()!.save())).toBe(false);
    await act(() => latest()!.unlock());
    unmount();
    await waitFor(() => expect(fake.contents.save).toHaveBeenCalledOnce());
  });

  it('notices a change on disk without a save: every few seconds, and on focus', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fake, latest, change } = await changedOnDisk();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(fake.contents.get).toHaveBeenLastCalledWith('moons/Io.ipynb', { content: false });
    expect(latest()!.locked).toBe(false);

    change();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    await act(async () => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(latest()!.locked).toBe(true));
    expect(screen.getByRole('alert')).toHaveTextContent('unsaved edits here are dropped');
    // Locked: no more asking.
    const asked = fake.contents.get.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(20_000));
    expect(fake.contents.get).toHaveBeenCalledTimes(asked);
  });

  it('takes a change on disk in place when nothing here would be lost (#508)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fake, latest, change } = await changedOnDisk();
    const changed = structuredClone(NOTEBOOK);
    changed.cells[0]!.source = 'print("from the agent")';
    changed.cells.push({ cell_type: 'markdown', id: 'm2', metadata: {}, source: '# Notes' });
    // The new version names another kernel and asks for the clipboard.
    changed.metadata.kernelspec = { name: 'julia', display_name: 'Julia 1.11' };
    changed.metadata.ganymede = { device: ['clipboard'] };
    change();
    // Where the person was: the second cell, scrolled down.
    act(() => modelOf().sharedModel.insertCell(1, { cell_type: 'markdown', source: 'x' }));
    act(() => void (modelOf().dirty = false));
    const notebook = fakes.notebooks[0] as unknown as {
      activeCellIndex: number;
      node: HTMLElement;
    };
    notebook.activeCellIndex = 1;
    notebook.node.scrollTop = 40;
    vi.mocked(declareDevice).mockClear();
    fake.contents.get.mockImplementation((async (_: string, o?: { content?: boolean }) =>
      o?.content
        ? { path: 'moons/Io.ipynb', last_modified: '2026-10-20T10:05:00Z', content: changed }
        : { last_modified: '2026-10-20T10:05:00Z' }) as never);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(() =>
      expect(modelOf().cells.get(0).sharedModel.getSource()).toBe('print("from the agent")'),
    );
    expect(latest()!.locked).toBe(false);
    expect(latest()!.dirty).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Same notebook and session: the kernel stays.
    expect(fakes.notebooks).toHaveLength(1);
    expect(fakes.sessions).toHaveLength(1);
    // The person's place is kept.
    expect(notebook.activeCellIndex).toBe(1);
    expect(notebook.node.scrollTop).toBe(40);
    // As on open: the kernel the new version names, and its device ask.
    await waitFor(() => expect(latest()!.missingKernel).toBe('Julia 1.11'));
    expect(declareDevice).toHaveBeenCalledWith(
      'moons/Io.ipynb',
      expect.objectContaining({ ganymede: { device: ['clipboard'] } }),
    );
    // Saves go on from the new version.
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(3)'));
    expect(await act(() => latest()!.save())).toBe(true);
    expect(fake.contents.save.mock.calls[0]![1]).toMatchObject({
      last_modified: '2026-10-20T10:05:00Z',
    });
  });

  it('locks instead while a cell runs', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { latest, change } = await changedOnDisk();
    const cell = modelOf().cells.get(0) as ICodeCellModel;
    act(() => (cell.executionState = 'running'));
    change();
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(() => expect(latest()!.locked).toBe(true));
    expect(cell.sharedModel.getSource()).toBe(NOTEBOOK.cells[0]!.source);
  });

  it('doesn’t take its own save for a change on disk', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fake, latest } = await changedOnDisk();
    let disk = '2026-10-20T10:00:00Z';
    fake.contents.get.mockImplementation((async () => ({ last_modified: disk })) as never);
    fake.contents.save.mockImplementation((async (path: string) => {
      disk = '2026-10-20T10:07:00Z';
      return { path, last_modified: disk };
    }) as never);
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    expect(await act(() => latest()!.save())).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(latest()!.locked).toBe(false);
  });

  it('autosaves nothing while locked', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fake, latest, change } = await changedOnDisk();
    change();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));

    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fake.contents.save).not.toHaveBeenCalled();
    expect(latest()!.locked).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('unsaved edits here are dropped');
    // Picking a kernel doesn't hide it.
    await act(() => latest()!.changeKernel('ts'));
    expect(screen.getByRole('alert')).toHaveTextContent('Saving is locked');
  });

  it('reloads the file from disk, asking first when there are edits, and keeps the kernel', async () => {
    const { fake, latest, change } = await changedOnDisk();
    change();
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    await act(async () => void window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(latest()!.locked).toBe(true));
    const confirm = vi.spyOn(window, 'confirm');

    confirm.mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining('unsaved edits here will be lost'),
    );
    expect(fakes.notebooks).toHaveLength(1);

    confirm.mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await waitFor(() => expect(fakes.notebooks).toHaveLength(2));
    await waitFor(() => expect(latest()?.locked).toBe(false));
    expect(latest()!.dirty).toBe(false);
    // The edits were dropped, not saved over the new file.
    expect(fake.contents.save).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // The old session let go of the kernel (left running); the new one rejoins it.
    expect(fakes.sessions).toHaveLength(2);
    expect((fakes.sessions[1] as { initialize: () => void }).initialize).toHaveBeenCalled();
    // Saves go through again, against the reloaded file.
    act(() => modelOf2().cells.get(0).sharedModel.setSource('print(3)'));
    expect(await act(() => latest()!.save())).toBe(true);
    expect(fake.contents.save.mock.calls[0]![1]).toMatchObject({
      last_modified: '2026-10-20T10:05:00Z',
    });
    confirm.mockRestore();
  });

  it('asks before the page closes with unsaved edits', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const unload = () => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(unload()).toBe(false);
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    expect(unload()).toBe(true);
  });

  it('autosaves a dirty notebook every two minutes and when the page is hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());

    // Clean: nothing to save.
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fake.contents.save).not.toHaveBeenCalled();

    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fake.contents.save).toHaveBeenCalledOnce();
    await waitFor(() => expect(latest()!.dirty).toBe(false));

    act(() => modelOf().cells.get(0).sharedModel.setSource('print(3)'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(fake.contents.save).toHaveBeenCalledTimes(2));
    visibility.mockRestore();
  });

  it('stops autosaving once discarded, and starts again when that is undone', async () => {
    const { fake, latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const hide = () => act(async () => void document.dispatchEvent(new Event('visibilitychange')));

    const undo = latest()!.discard();
    await hide();
    expect(fake.contents.save).not.toHaveBeenCalled();
    undo();
    await hide();
    await waitFor(() => expect(fake.contents.save).toHaveBeenCalledOnce());
    visibility.mockRestore();
  });

  it('saves unsaved edits before letting the notebook go', async () => {
    const { fake, latest, unmount } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    unmount();
    await waitFor(() => expect(fake.contents.save).toHaveBeenCalledOnce());
    const content = fake.contents.save.mock.calls[0]![1].content as nbformat.INotebookContent;
    expect(content.cells[0]!.source).toBe('print(2)');
    await waitFor(() =>
      expect((fakes.notebooks[0] as { isDisposed: boolean }).isDisposed).toBe(true),
    );
  });

  it('drops unsaved edits when the app discards them before letting the notebook go', async () => {
    const { fake, latest, unmount } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    latest()!.discard();
    unmount();
    await waitFor(() =>
      expect((fakes.notebooks[0] as { isDisposed: boolean }).isDisposed).toBe(true),
    );
    expect(fake.contents.save).not.toHaveBeenCalled();
  });

  it('clears the controller and disposes the notebook on unmount, leaving the kernel', async () => {
    const { latest, onController, unmount } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    vi.useFakeTimers();
    unmount();
    expect(onController).toHaveBeenLastCalledWith(undefined);
    act(() => vi.runAllTimers());
    const notebook = fakes.notebooks[0] as { isDisposed: boolean };
    expect(notebook.isDisposed).toBe(true);
    const session = fakes.sessions[0] as { dispose: () => void };
    expect(session.dispose).toHaveBeenCalled();
    expect(fakes.editing[0]!.dispose).toHaveBeenCalled();
    expect(fakes.widgets[0]!.dispose).toHaveBeenCalled();
  });
});

describe('hasUntrustedOutputs', () => {
  const load = (content: nbformat.INotebookContent) => {
    const model = new RealNotebookModel();
    model.fromJSON(content);
    return model;
  };

  it('is true for code cells with output and no trust', () => {
    expect(hasUntrustedOutputs(load(untrusted()))).toBe(true);
    expect(hasUntrustedOutputs(load(untrusted(false)))).toBe(true);
  });

  it('is false for trusted cells, cells without output, and other cells', () => {
    expect(hasUntrustedOutputs(load(untrusted(true)))).toBe(false);
    expect(hasUntrustedOutputs(load(NOTEBOOK))).toBe(false);
  });
});

describe('NotebookPane on a connected machine that is away (#701)', () => {
  const MACHINE: BackendConfig = {
    kind: 'ganymede',
    url: '',
    token: '',
    machine: 'mini',
    machineName: 'Mini',
  };
  const LOCAL: BackendConfig = { kind: 'ganymede', url: '', token: 't' };

  /** A pane in a (fake) room whose connection is `connected`; the room's notebook is a real one. */
  async function inRoom(
    connected: boolean,
    config: BackendConfig = MACHINE,
    {
      kernelspec,
      places,
    }: { kernelspec?: { name: string; display_name: string }; places?: KernelPlaces } = {},
  ) {
    const content = structuredClone(NOTEBOOK);
    if (kernelspec) content.metadata.kernelspec = kernelspec;
    Object.assign(content.cells[0]!, {
      execution_count: 3,
      outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }],
    });
    const { YNotebook } = await import('@jupyter/ydoc');
    const shared = new YNotebook();
    shared.fromJSON(content as never);
    const room = { notebook: shared, connected, onConnection: () => () => {}, dispose: vi.fn() };
    vi.spyOn(NotebookRoom, 'join').mockResolvedValue(room as unknown as NotebookRoom);
    serverSettings = ServerConnection.makeSettings({ baseUrl: 'http://127.0.0.1:1/' });
    const view = setup(
      vi.fn(async () => ({ path: 'moons/Io.ipynb', content })),
      'moons/Io.ipynb',
      config,
      places,
    );
    await waitFor(() => expect(view.latest()).toBeDefined());
    await waitFor(() => expect(fakes.sessions.length).toBeGreaterThan(0));
    return view;
  }

  afterEach(() => vi.restoreAllMocks());

  it('does not run a cell: no kernel starts and nothing executes', async () => {
    const { latest } = await inRoom(false);
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    const advance = vi.spyOn(NotebookActions, 'runAndAdvance').mockResolvedValue(true);
    const all = vi.spyOn(NotebookActions, 'runAll').mockResolvedValue(true);
    await act(() => latest()!.run());
    await act(() => latest()!.runAll());
    expect(session.changeKernel).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    expect(all).not.toHaveBeenCalled();
  });

  it('says in the notice’s picker that the machine’s remote isn’t answering (#832)', async () => {
    const { latest } = await inRoom(true, MACHINE, {
      kernelspec: { name: 'julia', display_name: 'Julia' },
      places: {
        remote: { name: 'workmbp', reachable: false, error: 'gateway: timed out' },
        gateway: ['python3'],
      },
    });
    await act(() => latest()!.run());
    const picker = screen.getByRole('combobox', { name: 'Pick a Kernel' });
    expect(
      within(picker).getByRole('option', {
        name: 'Mini runs kernels on workmbp, which isn’t answering',
      }),
    ).toBeDisabled();
  });

  it('runs when the machine is answering', async () => {
    const { latest } = await inRoom(true);
    const advance = vi.spyOn(NotebookActions, 'runAndAdvance').mockResolvedValue(true);
    await act(() => latest()!.run());
    expect(advance).toHaveBeenCalled();
  });

  it('keeps the outputs when Clear All Outputs runs', async () => {
    const { latest } = await inRoom(false);
    const cell = modelOf().cells.get(0) as ICodeCellModel;
    act(() => latest()!.clearOutputs());
    expect(cell.outputs.length).toBe(1);
    expect(cell.executionCount).toBe(3);
  });

  it('leaves the cell type alone', async () => {
    const { latest } = await inRoom(false);
    const change = vi.spyOn(NotebookActions, 'changeCellType').mockImplementation(() => {});
    act(() => latest()!.changeCellType('markdown'));
    expect(change).not.toHaveBeenCalled();
    expect(modelOf().cells.get(0).type).toBe('code');
  });

  it('adds no cell', async () => {
    const { latest } = await inRoom(false);
    const below = vi.spyOn(NotebookActions, 'insertBelow').mockImplementation(() => {});
    const before = modelOf().cells.length;
    act(() => latest()!.insert('code'));
    expect(below).not.toHaveBeenCalled();
    expect(modelOf().cells.length).toBe(before);
  });

  it('refuses a notebook command, and runs it when the machine is answering', async () => {
    const away = await inRoom(false);
    expect(away.latest()!.command('delete')).toBe(false);
    expect(fakes.execute).not.toHaveBeenCalled();
    away.unmount();
    const up = await inRoom(true);
    expect(up.latest()!.command('delete')).toBe(true);
    expect(fakes.execute).toHaveBeenCalledWith('delete');
  });

  it('gives the notebook’s commands and cell controls a way to ask whether it may edit', async () => {
    const { createCommands } = await import('../lib/jupyterlab');
    const { attachCellControls } = await import('../lib/cell-controls');
    await inRoom(false);
    const canEdit = vi.mocked(createCommands).mock.lastCall![4] as () => boolean;
    expect(canEdit()).toBe(false);
    const away = vi.mocked(attachCellControls).mock.lastCall![2] as () => boolean;
    expect(away()).toBe(true);
    const { attachCodeCollapse } = await import('../lib/code-collapse');
    expect((vi.mocked(attachCodeCollapse).mock.lastCall![1] as () => boolean)()).toBe(true);
  });

  /** Opens the cell menu on the first cell, as the cell's "…" button does. */
  function openCellMenu() {
    const onMenu = vi.mocked(attachCellControls).mock.lastCall![1];
    const nb = fakes.notebooks.at(-1) as { widgets: unknown[] };
    act(() => onMenu(nb.widgets[0] as never, document.body));
    return screen.getByRole('menu', { name: 'Cell Actions' });
  }
  const menuItems = (menu: HTMLElement) =>
    Array.from(menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'));

  it('shows no touch keyboard bar while it is away, and does when it is back', async () => {
    const away = await inRoom(false);
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.queryByTestId('keyboard-bar')).toBeNull();
    away.unmount();
    await inRoom(true);
    expect(await screen.findByTestId('keyboard-bar')).toBeInTheDocument();
  });

  it('disables every item of the cell menu while it is away, and not when it is back', async () => {
    const away = await inRoom(false);
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    const items = menuItems(openCellMenu());
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item, item.textContent ?? '').toBeDisabled();
    away.unmount();
    await inRoom(true);
    const live = menuItems(openCellMenu());
    expect(live.some(i => !(i as HTMLButtonElement).disabled)).toBe(true);
  });

  it('drops edit keys pressed in the notebook, and only those', async () => {
    const { createCommands } = await import('../lib/jupyterlab');
    await inRoom(false);
    const keys = vi.mocked(createCommands).mock.results.at(-1)!.value
      .processKeydownEvent as ReturnType<typeof vi.fn>;
    const node = (fakes.notebooks[0] as { node: HTMLElement }).node;
    const press = (target: HTMLElement, key = 'b') => {
      const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(press(node)).toBe(true);
    expect(keys).not.toHaveBeenCalled();
    // Moving is not editing, and a key elsewhere on the page is not the notebook's.
    expect(press(node, 'ArrowDown')).toBe(false);
    expect(keys).toHaveBeenCalledTimes(1);
    expect(press(document.body)).toBe(false);
    expect(keys).toHaveBeenCalledTimes(2);
  });

  it('shows no `device` of this one to a machine’s kernels, and does to a local server’s', async () => {
    // A machine's window whose remote doesn't let its notebooks use this
    // device registered no remote handler, so the pane attaches none
    // (#701, #877).
    await inRoom(true);
    expect(vi.mocked(attachDevice).mock.lastCall![1]).toMatchObject({ disabled: true });
    // The same machine with its setting on: its window registered the
    // handler, and the pane answers through it.
    vi.stubGlobal('webkit', {
      messageHandlers: { deviceRemote: { postMessage: vi.fn(async () => ({})) } },
    });
    vi.mocked(attachDevice).mockClear();
    await inRoom(true);
    expect(vi.mocked(attachDevice).mock.lastCall![1]?.disabled).toBeFalsy();
    vi.unstubAllGlobals();
    // This device's own server kernels always get it.
    vi.mocked(attachDevice).mockClear();
    await inRoom(true, LOCAL);
    expect(vi.mocked(attachDevice).mock.lastCall![1]?.disabled).toBeFalsy();
  });
});

describe('NotebookPane progress reporting (#913)', () => {
  it('reports activeCell, cellCount, ranCellCount, and outline ran status', async () => {
    const nb: nbformat.INotebookContent = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        { cell_type: 'markdown', id: 'm0', source: '# Setup', metadata: {} },
        {
          cell_type: 'code',
          id: 'c1',
          source: 'const a = 1',
          execution_count: 1,
          outputs: [],
          metadata: {},
        },
        { cell_type: 'markdown', id: 'm2', source: '## Analysis', metadata: {} },
        {
          cell_type: 'code',
          id: 'c3',
          source: 'const b = 2',
          execution_count: null,
          outputs: [],
          metadata: {},
        },
      ],
    };
    const { latest } = setup(
      vi.fn(async () => ({
        path: 'moons/Io.ipynb',
        content: nb,
      })),
    );
    await waitFor(() => expect(latest()?.cellCount).toBe(4));
    expect(latest()?.activeCell).toBe(0);
    expect(latest()?.ranCellCount).toBe(1);
    expect(latest()?.outline).toEqual([
      { level: 1, text: 'Setup', cell: 0, ran: true },
      { level: 2, text: 'Analysis', cell: 2, ran: false },
    ]);

    // Changing the active cell updates activeCell.
    const fakeNb = fakes.notebooks[0] as {
      activeCellIndex: number;
      activeCellChanged: { emit(v: unknown): void };
    };
    act(() => {
      fakeNb.activeCellIndex = 3;
      fakeNb.activeCellChanged.emit(null);
    });
    await waitFor(() => expect(latest()?.activeCell).toBe(3));

    // Executing the second code cell updates ranCellCount and outline[1].ran immediately.
    act(() => {
      (modelOf().cells.get(3) as ICodeCellModel).executionCount = 2;
    });
    await waitFor(() => expect(latest()?.ranCellCount).toBe(2));
    expect(latest()?.outline).toEqual([
      { level: 1, text: 'Setup', cell: 0, ran: true },
      { level: 2, text: 'Analysis', cell: 2, ran: true },
    ]);

    // Clearing outputs resets ranCellCount and marks sections unrun.
    act(() => {
      latest()!.clearOutputs();
    });
    await waitFor(() => expect(latest()?.ranCellCount).toBe(0));
    expect(latest()?.outline).toEqual([
      { level: 1, text: 'Setup', cell: 0, ran: false },
      { level: 2, text: 'Analysis', cell: 2, ran: false },
    ]);
  });

  it('opens and closes ExpandedView for long source, CellMenu, command palette, and tables (#822)', async () => {
    const tableOutput = {
      output_type: 'display_data',
      data: {
        'application/vnd.dataresource+json': {
          schema: { fields: [{ name: 'moon', type: 'string' }] },
          data: Array.from({ length: 20 }, (_, i) => ({ moon: `M${i}` })),
          ganymede: { rows: 20, shown: 20, title: 'Moons' },
        },
      },
      metadata: {},
    };
    const nb: nbformat.INotebookContent = {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          id: 'c1',
          source: 'line 1\nline 2',
          execution_count: 5,
          outputs: [tableOutput],
          metadata: {},
        },
      ],
    };
    const { latest } = setup(
      vi.fn(async () => ({
        path: 'moons/Io.ipynb',
        content: nb,
      })),
    );
    await waitFor(() => expect(latest()?.cellCount).toBe(1));

    const fakeNb = fakes.notebooks[0] as { widgets: unknown[] };
    act(() => {
      sourceExpand.onExpand?.(fakeNb.widgets[0]);
    });
    expect(await screen.findByRole('dialog', { name: 'In [5] · 2 lines' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Command palette command expands the active code cell.
    act(() => {
      expect(latest()!.command('expand-source')).toBe(true);
    });
    expect(await screen.findByRole('dialog', { name: 'In [5] · 2 lines' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();

    // Table expansion opens table view and auto-closes when switching to Journal.
    act(() => {
      outputLabels.options?.onExpandTable?.({
        cell: fakeNb.widgets[0],
        outputIndex: 0,
        output: tableOutput,
        opener: document.body,
      });
    });
    expect(await screen.findByRole('dialog', { name: 'Moons · 20 rows' })).toBeInTheDocument();
    act(() => latest()!.toggleJournal());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('NotebookPane read-only when another Ganymede server owns the notebook (#839)', () => {
  const LOCAL: BackendConfig = { kind: 'ganymede', url: '', token: 't' };

  async function openInRoom(initialWritable: boolean) {
    const content = structuredClone(NOTEBOOK);
    Object.assign(content.cells[0]!, {
      execution_count: 3,
      outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }],
    });
    const { YNotebook } = await import('@jupyter/ydoc');
    const shared = new YNotebook();
    shared.fromJSON(content as never);
    const room = {
      notebook: shared,
      connected: true,
      onConnection: () => () => {},
      dispose: vi.fn(),
    };
    vi.spyOn(NotebookRoom, 'join').mockResolvedValue(room as unknown as NotebookRoom);
    serverSettings = ServerConnection.makeSettings({ baseUrl: 'http://127.0.0.1:1/' });
    let writable = initialWritable;
    const get = vi.fn(async () => ({ path: 'moons/Io.ipynb', content, writable }));
    const view = setup(get, 'moons/Io.ipynb', LOCAL);
    await waitFor(() => expect(view.latest()).toBeDefined());
    await waitFor(() => expect(fakes.sessions.length).toBeGreaterThan(0));
    return {
      ...view,
      shared,
      get,
      setWritable(next: boolean) {
        writable = next;
      },
    };
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens read-only with editing off, Run disabled, and banner shown when contents says writable: false', async () => {
    const { latest } = await openInRoom(false);
    expect(latest()!.readOnly).toBe(true);
    expect(modelOf().readOnly).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Another Ganymede server on this machine has this notebook open',
    );
    expect(screen.queryByTestId('keyboard-bar')).toBeNull();
    expect(document.querySelector('.notebook-page')).toHaveClass('is-readonly');

    // Run and Run All do not start a kernel or execute cells.
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    const advance = vi.spyOn(NotebookActions, 'runAndAdvance').mockResolvedValue(true);
    const all = vi.spyOn(NotebookActions, 'runAll').mockResolvedValue(true);
    await act(() => latest()!.run());
    await act(() => latest()!.runAll());
    await act(() => latest()!.restartAndRunAll());
    expect(session.changeKernel).not.toHaveBeenCalled();
    expect(advance).not.toHaveBeenCalled();
    expect(all).not.toHaveBeenCalled();

    // Cell mutations and save/rename/kernel switch are blocked.
    const below = vi.spyOn(NotebookActions, 'insertBelow').mockImplementation(() => {});
    const change = vi.spyOn(NotebookActions, 'changeCellType').mockImplementation(() => {});
    act(() => {
      latest()!.insert('code');
      latest()!.changeCellType('markdown');
      latest()!.clearOutputs();
    });
    expect(below).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect((modelOf().cells.get(0) as ICodeCellModel).outputs.length).toBe(1);
    expect(latest()!.command('delete')).toBe(false);
    expect(await act(() => latest()!.save())).toBe(false);
    expect(await act(() => latest()!.rename('Europa'))).toBe(false);

    // Edit keys are dropped, navigation keys still work.
    const node = (fakes.notebooks[0] as { node: HTMLElement }).node;
    const edit = new KeyboardEvent('keydown', { key: 'b', bubbles: true, cancelable: true });
    node.dispatchEvent(edit);
    expect(edit.defaultPrevented).toBe(true);
    const move = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    node.dispatchEvent(move);
    expect(move.defaultPrevented).toBe(false);

    // Cell controls, commands, code collapse, and cell toolbar all know it is read-only.
    const { createCommands } = await import('../lib/jupyterlab');
    const canEdit = vi.mocked(createCommands).mock.lastCall![4] as () => boolean;
    expect(canEdit()).toBe(false);
    expect((vi.mocked(attachCellControls).mock.lastCall![2] as () => boolean)()).toBe(true);
    const { attachCodeCollapse } = await import('../lib/code-collapse');
    expect((vi.mocked(attachCodeCollapse).mock.lastCall![1] as () => boolean)()).toBe(true);
    expect(vi.mocked(attachEditing).mock.lastCall![4]?.canEdit?.()).toBe(false);

    // Cell menu disables every item while read-only.
    const onMenu = vi.mocked(attachCellControls).mock.lastCall![1];
    const nb = fakes.notebooks.at(-1) as { widgets: unknown[] };
    act(() => onMenu(nb.widgets[0] as never, document.body));
    const menu = screen.getByRole('menu', { name: 'Cell Actions' });
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]'));
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expect(item, item.textContent ?? '').toBeDisabled();
  });

  it('switches to read-only when a room turns read-only while open, and back without reload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { latest, shared, setWritable } = await openInRoom(true);
    const initialNotebook = fakes.notebooks[0];
    expect(latest()!.readOnly).toBe(false);
    expect(modelOf().readOnly).toBe(false);
    expect(screen.queryByText(/Another Ganymede server/)).toBeNull();
    expect(screen.getByTestId('keyboard-bar')).toBeInTheDocument();

    // Room turns read-only while open (contents poll detects writable: false).
    setWritable(false);
    await act(() => vi.advanceTimersByTimeAsync(5_000));
    await waitFor(() => expect(latest()!.readOnly).toBe(true));
    expect(modelOf().readOnly).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Another Ganymede server on this machine has this notebook open',
    );
    expect(screen.queryByTestId('keyboard-bar')).toBeNull();

    // Lock released: room becomes writable again without reloading the notebook.
    setWritable(true);
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await waitFor(() => expect(latest()!.readOnly).toBe(false));
    expect(modelOf().readOnly).toBe(false);
    expect(screen.queryByText(/Another Ganymede server/)).toBeNull();
    expect(screen.getByTestId('keyboard-bar')).toBeInTheDocument();
    expect(fakes.notebooks).toHaveLength(1);
    expect(fakes.notebooks[0]).toBe(initialNotebook);

    // Also reacts immediately to room state transitions without waiting for a poll.
    act(() => shared.setState('read_only', true));
    await waitFor(() => expect(latest()!.readOnly).toBe(true));
    act(() => shared.setState('read_only', false));
    await waitFor(() => expect(latest()!.readOnly).toBe(false));

    // Running works again once editable.
    const advance = vi.spyOn(NotebookActions, 'runAndAdvance').mockResolvedValue(true);
    await act(() => latest()!.run());
    expect(advance).toHaveBeenCalledOnce();
  });

  it('opens read-only without a room when contents reports writable: false, and unlocks when writable', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let writable = false;
    const get = vi.fn(async () => ({
      path: 'moons/Io.ipynb',
      content: structuredClone(NOTEBOOK),
      last_modified: '2026-10-20T10:00:00Z',
      writable,
    }));
    const { latest } = setup(get);
    await waitFor(() => expect(latest()).toBeDefined());
    expect(latest()!.readOnly).toBe(true);
    expect(modelOf().readOnly).toBe(true);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Another Ganymede server on this machine has this notebook open',
    );

    writable = true;
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    await waitFor(() => expect(latest()!.readOnly).toBe(false));
    expect(modelOf().readOnly).toBe(false);
    expect(screen.queryByText(/Another Ganymede server/)).toBeNull();
  });
});

describe('room save attention and recovery copies (#831)', () => {
  it('shows Save needs attention with save_error from room state, and clears once saved', async () => {
    const { YNotebook } = await import('@jupyter/ydoc');
    const shared = new YNotebook();
    shared.fromJSON(structuredClone(NOTEBOOK) as never);
    serverSettings = ServerConnection.makeSettings({
      baseUrl: 'http://127.0.0.1:1/',
      fetch: (async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch,
    });
    const room = {
      notebook: shared,
      connected: true,
      live: true,
      onConnection: () => () => {},
      watchLive: () => () => {},
      save: vi.fn(async () => 'success' as const),
      dispose: vi.fn(),
    };
    const join = vi.spyOn(NotebookRoom, 'join').mockResolvedValue(room as unknown as NotebookRoom);

    const { latest } = setup();
    await waitFor(() => expect(latest()?.path).toBe('moons/Io.ipynb'));
    expect(screen.queryByText('Save needs attention')).not.toBeInTheDocument();

    act(() => {
      shared.ystate.set('save', 'failed');
      shared.ystate.set('save_error', 'Disk full');
    });

    expect(await screen.findByText('Save needs attention')).toBeVisible();
    expect(screen.getByText('Disk full')).toBeVisible();
    expect(latest()?.saveAttention).toBe(true);
    expect(latest()?.saveAttentionDetail).toBe('Disk full');

    act(() => {
      shared.ystate.delete('save_error');
      shared.ystate.set('save', 'saved');
    });

    await waitFor(() => {
      expect(screen.queryByText('Save needs attention')).not.toBeInTheDocument();
      expect(latest()?.saveAttention).toBe(false);
    });
    join.mockRestore();
  });

  it('offers merge conflict copies with cell names, opens the diff sheet, and restores via Contents API before DELETE', async () => {
    const { YNotebook } = await import('@jupyter/ydoc');
    const shared = new YNotebook();
    const liveNb = structuredClone(NOTEBOOK);
    shared.fromJSON(liveNb as never);
    shared.ystate.set('save', 'saved');
    shared.ystate.set('recovery', {
      id: 'rec-mc-1',
      at: '2026-11-28T10:00:00Z',
      reason: 'merge_conflict',
      cells: ['a1'],
    });
    const copyNb = structuredClone(NOTEBOOK);
    copyNb.cells[0]!.source = 'print("recovered")';

    let discarded = false;
    const calls: string[] = [];
    serverSettings = ServerConnection.makeSettings({
      baseUrl: 'http://127.0.0.1:1/',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request ? input : new Request(input, init);
        const u = new URL(req.url);
        calls.push(`${req.method} ${u.pathname}`);
        if (req.method === 'GET' && u.pathname.endsWith('/api/collaboration/recovery')) {
          return new Response(
            JSON.stringify({
              copies: discarded
                ? []
                : [
                    {
                      id: 'rec-mc-1',
                      path: 'moons/Io.ipynb',
                      at: '2026-11-28T10:00:00Z',
                      reason: 'merge_conflict',
                      detail: 'cell a1',
                      cells: ['a1'],
                    },
                  ],
            }),
            { status: 200 },
          );
        }
        if (req.method === 'GET' && u.pathname.endsWith('/api/collaboration/recovery/rec-mc-1')) {
          return new Response(
            JSON.stringify({
              id: 'rec-mc-1',
              path: 'moons/Io.ipynb',
              at: '2026-11-28T10:00:00Z',
              reason: 'merge_conflict',
              detail: 'cell a1',
              cells: ['a1'],
              content: copyNb,
            }),
            { status: 200 },
          );
        }
        if (
          req.method === 'DELETE' &&
          u.pathname.endsWith('/api/collaboration/recovery/rec-mc-1')
        ) {
          discarded = true;
          shared.ystate.delete('recovery');
          return new Response(null, { status: 204 });
        }
        return new Response('Not Found', { status: 404 });
      }) as unknown as typeof fetch,
    });

    const room = {
      notebook: shared,
      connected: true,
      live: true,
      onConnection: () => () => {},
      watchLive: () => () => {},
      save: vi.fn(async () => 'success' as const),
      dispose: vi.fn(),
    };
    const join = vi.spyOn(NotebookRoom, 'join').mockResolvedValue(room as unknown as NotebookRoom);

    const user = userEvent.setup();
    const { fake, latest } = setup();
    expect(await screen.findByText('Save needs attention')).toBeVisible();
    expect(screen.getByText(/Merge conflict: cell a1/)).toBeVisible();
    await waitFor(() => expect(latest()?.reviewRecovery).toBeDefined());

    await user.click(screen.getByRole('button', { name: 'Review Copy…' }));
    expect(await screen.findByRole('dialog')).toBeVisible();
    expect(screen.getByText('Conflicting cells:')).toBeVisible();
    expect(screen.getByText(/print\("recovered"\)/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Restore Copy' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(fake.contents.save).toHaveBeenCalledWith('moons/Io.ipynb', {
      type: 'notebook',
      format: 'json',
      content: copyNb,
    });
    expect(calls).toContain('DELETE /api/collaboration/recovery/rec-mc-1');
    await waitFor(() => expect(screen.queryByText('Save needs attention')).not.toBeInTheDocument());
    join.mockRestore();
  });

  it('re-reads the list when a summary id is 404 and degrades gracefully when recovery endpoints answer 404', async () => {
    const { YNotebook } = await import('@jupyter/ydoc');

    // Case 1: GET /{id} returns 404 after another server already removed it.
    const shared1 = new YNotebook();
    shared1.fromJSON(structuredClone(NOTEBOOK) as never);
    shared1.ystate.set('recovery', {
      id: 'rec-stale',
      at: '2026-11-28T10:00:00Z',
      reason: 'save_failed',
      cells: [],
    });
    const seenPaths: string[] = [];
    let listCount = 0;
    serverSettings = ServerConnection.makeSettings({
      baseUrl: 'http://127.0.0.1:1/',
      fetch: (async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        const u = new URL(url);
        seenPaths.push(u.pathname);
        if (u.pathname.endsWith('/api/collaboration/recovery')) {
          listCount++;
          return new Response(JSON.stringify({ copies: [] }), { status: 200 });
        }
        if (u.pathname.endsWith('/api/collaboration/recovery/rec-stale')) {
          return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
        }
        return new Response('Not Found', { status: 404 });
      }) as unknown as typeof fetch,
    });
    const join1 = vi.spyOn(NotebookRoom, 'join').mockResolvedValue({
      notebook: shared1,
      connected: true,
      live: true,
      onConnection: () => () => {},
      watchLive: () => () => {},
      save: vi.fn(async () => 'success' as const),
      dispose: vi.fn(),
    } as unknown as NotebookRoom);

    const first = setup();
    await waitFor(() => expect(listCount).toBe(2));
    expect(seenPaths.some(p => p.endsWith('/rec-stale'))).toBe(true);
    await waitFor(() => expect(screen.queryByText('Save needs attention')).not.toBeInTheDocument());
    first.unmount();
    join1.mockRestore();

    // Case 2: Older server returns 404 on /api/collaboration/recovery?path=...
    const shared2 = new YNotebook();
    shared2.fromJSON(structuredClone(NOTEBOOK) as never);
    shared2.ystate.set('recovery', {
      id: 'ignored-legacy',
      at: '2026-11-28T10:00:00Z',
      reason: 'save_failed',
      cells: [],
    });
    serverSettings = ServerConnection.makeSettings({
      baseUrl: 'http://127.0.0.1:1/',
      fetch: (async () => new Response('Not Found', { status: 404 })) as unknown as typeof fetch,
    });
    const join2 = vi.spyOn(NotebookRoom, 'join').mockResolvedValue({
      notebook: shared2,
      connected: true,
      live: true,
      onConnection: () => () => {},
      watchLive: () => () => {},
      save: vi.fn(async () => 'success' as const),
      dispose: vi.fn(),
    } as unknown as NotebookRoom);

    const second = setup();
    await waitFor(() => expect(second.latest()?.path).toBe('moons/Io.ipynb'));
    await waitFor(() => {
      expect(second.latest()?.saveAttention).toBe(false);
      expect(screen.queryByText('Save needs attention')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    join2.mockRestore();
  });
});

describe('NotebookPane room reconnecting read-only (#702)', () => {
  async function joinWithLive(config?: BackendConfig) {
    const content = structuredClone(NOTEBOOK);
    Object.assign(content.cells[0]!, {
      execution_count: 1,
      outputs: [{ output_type: 'stream', name: 'stdout', text: '1\n' }],
    });
    const { YNotebook } = await import('@jupyter/ydoc');
    const shared = new YNotebook();
    shared.fromJSON(content as never);
    let live = true;
    const listeners = new Set<(v: boolean) => void>();
    const room = {
      notebook: shared,
      get live() {
        return live;
      },
      get connected() {
        return live;
      },
      onConnection: () => () => {},
      watchLive(cb: (v: boolean) => void) {
        listeners.add(cb);
        cb(live);
        return () => void listeners.delete(cb);
      },
      dispose: vi.fn(),
    };
    const setLive = (next: boolean) => {
      live = next;
      listeners.forEach(cb => cb(next));
    };
    vi.spyOn(NotebookRoom, 'join').mockResolvedValue(room as unknown as NotebookRoom);
    serverSettings = ServerConnection.makeSettings({ baseUrl: 'http://127.0.0.1:1/' });
    const view = setup(
      vi.fn(async () => ({ path: 'moons/Io.ipynb', content })),
      'moons/Io.ipynb',
      config,
    );
    await waitFor(() => expect(view.latest()).toBeDefined());
    const model = (fakes.notebooks[0] as { model: NotebookModel }).model;
    return { ...view, model, setLive };
  }

  afterEach(() => vi.restoreAllMocks());

  it('goes read-only with a banner while a non-machine room reconnects, and back when live', async () => {
    const { latest, model, setLive } = await joinWithLive();
    const runAllSpy = vi.spyOn(NotebookActions, 'runAll').mockResolvedValue(true);
    const insertSpy = vi.spyOn(NotebookActions, 'insertBelow');
    const cellTypeSpy = vi.spyOn(NotebookActions, 'changeCellType');

    expect(model.readOnly).toBe(false);
    expect(document.querySelector('.machine-banner')).not.toBeInTheDocument();

    act(() => setLive(false));
    const banner = await screen.findByRole('status');
    expect(banner).toHaveTextContent(
      'Reconnecting… The notebook is read-only until the connection returns.',
    );
    expect(model.readOnly).toBe(true);

    // Mutating and run controller actions are ignored while reconnecting.
    await act(() => latest()!.runAll());
    act(() => latest()!.insert('code'));
    act(() => latest()!.changeCellType('markdown'));
    act(() => latest()!.clearOutputs());
    expect(latest()!.command('notebook:run-cell')).toBe(false);
    expect(runAllSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(cellTypeSpy).not.toHaveBeenCalled();
    expect(fakes.execute).not.toHaveBeenCalled();
    expect((model.cells.get(0) as ICodeCellModel).outputs.length).toBe(1);

    // Switching to Journal view while offline shows only the journal banner, not a duplicate machine-banner.
    act(() => latest()!.toggleJournal());
    expect(
      await screen.findByText(
        'Reconnecting… The journal is read-only until the connection returns.',
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.machine-banner')).not.toBeInTheDocument();

    // Back to Notebook view and back online: editable and banner clears.
    act(() => latest()!.toggleJournal());
    act(() => setLive(true));
    await waitFor(() => expect(document.querySelector('.machine-banner')).not.toBeInTheDocument());
    expect(model.readOnly).toBe(false);
    expect(latest()!.command('notebook:run-cell')).toBe(true);
    expect(fakes.execute).toHaveBeenCalledWith('notebook:run-cell');
  });

  it('keeps the machine-specific banner wording for a connected machine', async () => {
    const { model, setLive } = await joinWithLive({
      kind: 'ganymede',
      url: '',
      token: '',
      machine: 'm1',
      machineName: 'Studio',
    });
    act(() => setLive(false));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Studio went offline · Reconnecting…',
    );
    expect(model.readOnly).toBe(true);
    act(() => setLive(true));
    await waitFor(() => expect(document.querySelector('.machine-banner')).not.toBeInTheDocument());
    expect(model.readOnly).toBe(false);
  });
});
