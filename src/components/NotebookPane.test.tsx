import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import type { NotebookModel } from '@jupyterlab/notebook';
import { fakeBackend, fakeServices } from '../test/fakes';
import type { NotebookController } from './NotebookPane';

// No kernel and no real notebook widget: the pane's loading, dirty state and
// saving are tested here with JupyterLab's real NotebookModel. Rendering,
// running cells and the keyboard are left to the end-to-end suite.
const fakes = vi.hoisted(() => {
  // @lumino/dragdrop subclasses DragEvent when it loads; jsdom has none.
  globalThis.DragEvent ??= class extends MouseEvent {} as unknown as typeof DragEvent;
  // @jupyterlab/notebook subclasses IntersectionObserver and ResizeObserver
  // when it loads.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  // JupyterLab's web components read the color scheme when they load.
  window.matchMedia ??= (media: string) =>
    ({
      media,
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }) as unknown as MediaQueryList;
  return { sessions: [] as unknown[], notebooks: [] as unknown[] };
});

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
  };
});

vi.mock('../lib/widgets', () => ({
  attachWidgets: vi.fn(() => ({ dispose: vi.fn(), isDisposed: false })),
}));

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
});

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
  });
});
