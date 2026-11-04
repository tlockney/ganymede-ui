import { act, render, screen, waitFor } from '@testing-library/react';
import { useCallback, useState } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import type { NotebookModel } from '@jupyterlab/notebook';
import '../test/notebook-env';
import { entry, fakeBackend, fakeServices } from '../test/fakes';
import type { NotebookController } from './NotebookPane';

// No kernel and no real notebook widget: the pane's loading, dirty state and
// saving are tested here with JupyterLab's real NotebookModel. Rendering,
// running cells and the keyboard are left to the end-to-end suite.
const fakes = vi.hoisted(() => ({
  sessions: [] as unknown[],
  notebooks: [] as unknown[],
  widgets: [] as { dispose: () => void; saveState: (m: unknown) => void }[],
  editing: [] as { dispose: () => void }[],
  /** How the next session rejoins; by default at once, finding none. */
  initialize: undefined as undefined | ((session: { session: unknown }) => Promise<boolean>),
}));

vi.mock('../lib/jupyterlab', async () => {
  const { Widget } = await import('@lumino/widgets');
  const { Signal } = await import('@lumino/signaling');
  return {
    createRendermime: vi.fn(() => ({})),
    createNotebook: vi.fn(() => {
      // A plain Lumino widget stands in for JupyterLab's Notebook.
      const w = new Widget() as InstanceType<typeof Widget> & {
        model?: NotebookModel;
        activeCellIndex?: number;
        widgets: { model: { type: string } }[];
        isSelectedOrActive(cell: unknown): boolean;
        activeCellChanged: InstanceType<typeof Signal>;
        stateChanged: InstanceType<typeof Signal>;
      };
      // Its cells, with the active one selected, for what a run needs.
      Object.defineProperty(w, 'widgets', {
        get: () =>
          Array.from({ length: w.model!.cells.length }, (_, i) => ({
            model: w.model!.cells.get(i),
          })),
      });
      w.isSelectedOrActive = cell =>
        (cell as { model: unknown }).model === w.model!.cells.get(w.activeCellIndex ?? 0);
      w.activeCellChanged = new Signal(w);
      // The keyboard bar (#209) follows the mode.
      w.stateChanged = new Signal(w);
      fakes.notebooks.push(w);
      return w;
    }),
    createCommands: vi.fn(() => ({ processKeydownEvent: vi.fn() })),
    attachEditing: vi.fn(() => {
      const editing = { dispose: vi.fn(), isDisposed: false };
      fakes.editing.push(editing);
      return editing;
    }),
  };
});

// The touch cell controls need JupyterLab's cells; cell-controls.test.ts
// covers them.
vi.mock('../lib/cell-controls', () => ({
  attachCellControls: vi.fn(() => ({ dispose: vi.fn(), isDisposed: false })),
}));

// The running and queued lines need JupyterLab's cells; run-status.test.ts
// covers them.
const runStatus = vi.hoisted(() => ({
  clear: vi.fn(),
  options: undefined as { interrupt(): void } | undefined,
}));
vi.mock('../lib/run-status', () => ({
  attachRunStatus: vi.fn((_: unknown, options: { interrupt(): void }) => {
    runStatus.options = options;
    return { clear: runStatus.clear, dispose: vi.fn(), isDisposed: false };
  }),
}));
/** What the pane gave the running line: its Interrupt. */
const runStatusOptions = () => runStatus.options!;

vi.mock('../lib/widgets', () => ({
  attachWidgets: vi.fn(() => {
    const widgets = { dispose: vi.fn(), isDisposed: false, saveState: vi.fn() };
    fakes.widgets.push(widgets);
    return widgets;
  }),
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

function setup(
  get = vi.fn(async () => ({ path: 'moons/Io.ipynb', content: structuredClone(NOTEBOOK) })),
) {
  const fake = fakeServices();
  fake.contents.get = get as never;
  const controllers: (NotebookController | undefined)[] = [];
  const onController = vi.fn((c: NotebookController | undefined) => controllers.push(c));
  const onRenamed = vi.fn();
  const utils = render(
    <NotebookPane
      backend={fakeBackend(fake.services)}
      path="moons/Io.ipynb"
      onController={onController}
      onRenamed={onRenamed}
    />,
  );
  const latest = () => controllers[controllers.length - 1];
  return { ...utils, fake, onController, onRenamed, latest };
}

beforeEach(() => {
  fakes.sessions.length = 0;
  fakes.notebooks.length = 0;
  fakes.widgets.length = 0;
  fakes.editing.length = 0;
  fakes.initialize = undefined;
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

describe('NotebookPane', () => {
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

  it('starts the kernel the file names on the first run', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    expect(session.changeKernel).not.toHaveBeenCalled();
    await act(() => latest()!.run());
    expect(session.changeKernel).toHaveBeenCalledWith({ name: 'python3' });
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
      const { latest } = setup(get);
      expect(await screen.findByText('Couldn’t open Io.ipynb')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Couldn’t reach the server to open Io.ipynb.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(latest()).toBeDefined());
      expect(get).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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

    it('shows the save conflict again once a kernel notice over it clears', async () => {
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
      expect(screen.getByRole('alert')).toHaveTextContent('Autosave is off until you save it');

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
      await waitFor(() =>
        expect(screen.getByRole('alert')).toHaveTextContent('Autosave is off until you save it'),
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
          session.session = { kernel: { name: 'python3' } };
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

  it('starts one kernel for runs that come in while it starts', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()?.status).toBe('none'));
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
    await act(() => Promise.all([latest()!.run(), latest()!.runAll()]));
    expect(session.changeKernel).toHaveBeenCalledTimes(1);
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

  it('asks before saving over a file that changed on disk', async () => {
    const loaded = '2026-10-20T10:00:00Z';
    const { fake, latest } = setup(
      vi.fn(async () => ({
        path: 'moons/Io.ipynb',
        last_modified: loaded,
        content: structuredClone(NOTEBOOK),
      })),
    );
    await waitFor(() => expect(latest()).toBeDefined());
    // Now someone else saves it.
    fake.contents.get.mockResolvedValue({ last_modified: '2026-10-20T10:05:00Z' } as never);
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));
    const confirm = vi.spyOn(window, 'confirm');

    confirm.mockReturnValueOnce(false);
    await act(() => latest()!.save());
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Io.ipynb changed on disk'));
    expect(fake.contents.save).not.toHaveBeenCalled();
    expect(latest()!.dirty).toBe(true);

    confirm.mockReturnValueOnce(true);
    await act(() => latest()!.save());
    expect(fake.contents.save).toHaveBeenCalledOnce();
    await waitFor(() => expect(latest()!.dirty).toBe(false));
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

  it('turns autosave off when the file changed on disk, until a save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fake, latest } = setup(
      vi.fn(async () => ({
        path: 'moons/Io.ipynb',
        last_modified: '2026-10-20T10:00:00Z',
        content: structuredClone(NOTEBOOK),
      })),
    );
    await waitFor(() => expect(latest()).toBeDefined());
    fake.contents.get.mockResolvedValue({ last_modified: '2026-10-20T10:05:00Z' } as never);
    act(() => modelOf().cells.get(0).sharedModel.setSource('print(2)'));

    await act(() => vi.advanceTimersByTimeAsync(120_000));
    expect(fake.contents.save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Autosave is off until you save it');
    await act(() => vi.advanceTimersByTimeAsync(120_000));
    // Checked once, not every two minutes.
    expect(fake.contents.get).toHaveBeenCalledTimes(2);
    // Picking a kernel doesn't hide it.
    await act(() => latest()!.changeKernel('ts'));
    expect(screen.getByRole('alert')).toHaveTextContent('Autosave is off until you save it');
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
