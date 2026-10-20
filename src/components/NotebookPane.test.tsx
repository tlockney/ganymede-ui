import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import type { NotebookModel } from '@jupyterlab/notebook';
import '../test/notebook-env';
import { fakeBackend, fakeServices } from '../test/fakes';
import type { NotebookController } from './NotebookPane';

// No kernel and no real notebook widget: the pane's loading, dirty state and
// saving are tested here with JupyterLab's real NotebookModel. Rendering,
// running cells and the keyboard are left to the end-to-end suite.
const fakes = vi.hoisted(() => ({
  sessions: [] as unknown[],
  notebooks: [] as unknown[],
  widgets: [] as { dispose: () => void; saveState: (m: unknown) => void }[],
  editing: [] as { dispose: () => void }[],
}));

vi.mock('../lib/jupyterlab', async () => {
  const { Widget } = await import('@lumino/widgets');
  return {
    createRendermime: vi.fn(() => ({})),
    createNotebook: vi.fn(() => {
      // A plain Lumino widget stands in for JupyterLab's Notebook.
      const w = new Widget() as InstanceType<typeof Widget> & {
        model?: NotebookModel;
        activeCellIndex?: number;
      };
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
    initialize = vi.fn(async () => false);
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
const { NotebookModel: RealNotebookModel } = await import('@jupyterlab/notebook');

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
  const utils = render(
    <NotebookPane
      backend={fakeBackend(fake.services)}
      path="moons/Io.ipynb"
      onController={onController}
    />,
  );
  const latest = () => controllers[controllers.length - 1];
  return { ...utils, fake, onController, latest };
}

beforeEach(() => {
  fakes.sessions.length = 0;
  fakes.notebooks.length = 0;
  fakes.widgets.length = 0;
  fakes.editing.length = 0;
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
      status: 'connecting',
    });
    expect(modelOf().cells.length).toBe(1);
    expect(modelOf().cells.get(0).sharedModel.getSource()).toBe('print(1)');
    expect(document.querySelector('.notebook-page .notebook-holder')).toBeInTheDocument();

    // One session per file, named by path, with the kernel the file asks for.
    const session = fakes.sessions[0] as {
      options: Record<string, unknown>;
      initialize: () => void;
    };
    expect(session.options).toMatchObject({
      path: 'moons/Io.ipynb',
      name: 'Io.ipynb',
      type: 'notebook',
      kernelPreference: { name: 'python3', autoStartDefault: true },
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

  it('records the kernel in the notebook when it is changed', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    await act(() => latest()!.changeKernel('python3'));
    const session = fakes.sessions[0] as { changeKernel: () => void };
    expect(session.changeKernel).toHaveBeenCalledWith({ name: 'python3' });
    expect(modelOf().getMetadata('kernelspec')).toEqual({
      name: 'python3',
      display_name: 'Python 3',
      language: 'python',
    });
  });

  it('falls back to the default kernel for a kernel the backend lacks', async () => {
    const nb = structuredClone(NOTEBOOK);
    nb.metadata.kernelspec = { name: 'julia', display_name: 'Julia' };
    const { latest } = setup(vi.fn(async () => ({ path: 'moons/Io.ipynb', content: nb })));
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as { options: { kernelPreference: { name: string } } };
    expect(session.options.kernelPreference.name).toBe('python3');
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
    expect(latest()!.dirty).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows why a kernel action failed', async () => {
    const { latest } = setup();
    await waitFor(() => expect(latest()).toBeDefined());
    const session = fakes.sessions[0] as { changeKernel: ReturnType<typeof vi.fn> };
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
