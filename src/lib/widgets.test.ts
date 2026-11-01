import '../test/notebook-env';
import { describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Signal } from '@lumino/signaling';

// ipywidgets' managers need a live kernel or real widget modules; fakes
// stand in, so this tests the wiring: one manager per kernel or for the
// saved state, the widget-view renderer, the saved state each manager
// loads, and what goes into the notebook's metadata on save.
interface FakeManager {
  kernel: unknown;
  state: unknown;
  loaded: unknown[];
  restoredStatus: boolean;
  dispose: () => void;
  finishRestore(): void;
}
const fakes = vi.hoisted(() => ({ managers: [] as FakeManager[] }));

vi.mock('@jupyter-widgets/jupyterlab-manager/lib/manager', () => {
  class LabWidgetManager {
    state: unknown = { version_major: 2, version_minor: 0, state: {} };
    loaded: unknown[] = [];
    register = vi.fn();
    dispose = vi.fn();
    _restoredStatus = false;
    private listeners: (() => void)[] = [];
    _restored = {
      connect: (f: () => void) => this.listeners.push(f),
      emit: () => this.listeners.forEach(f => f()),
    };
    constructor() {
      fakes.managers.push(this as unknown as FakeManager);
    }
    get restored() {
      return this._restored;
    }
    get restoredStatus() {
      return this._restoredStatus;
    }
    get_state_sync() {
      return this.state;
    }
    async set_state(state: unknown) {
      this.loaded.push(state);
    }
    filterExistingModelState(state: unknown) {
      return state;
    }
    /** What a restore from the kernel ends with. */
    finishRestore() {
      this._restoredStatus = true;
      this._restored.emit();
    }
  }
  class KernelWidgetManager extends LabWidgetManager {
    constructor(readonly kernel: unknown) {
      super();
    }
  }
  return {
    WIDGET_VIEW_MIMETYPE: 'application/vnd.jupyter.widget-view+json',
    WIDGET_STATE_MIMETYPE: 'application/vnd.jupyter.widget-state+json',
    LabWidgetManager,
    KernelWidgetManager,
  };
});
vi.mock('@jupyter-widgets/jupyterlab-manager/lib/renderer', () => ({ WidgetRenderer: class {} }));
vi.mock('@jupyter-widgets/jupyterlab-manager/lib/output', () => ({
  OUTPUT_WIDGET_VERSION: '1.0.0',
  OutputModel: class {},
  OutputView: class {},
}));
vi.mock('@jupyter-widgets/base', () => {
  const names = ['WidgetModel', 'WidgetView', 'DOMWidgetView', 'DOMWidgetModel', 'LayoutModel'];
  names.push('LayoutView', 'StyleModel', 'StyleView', 'ErrorWidgetView');
  return {
    JUPYTER_WIDGETS_VERSION: '2.0.0',
    ...Object.fromEntries(names.map(n => [n, class {}])),
  };
});
vi.mock('@jupyter-widgets/controls/lib/version', () => ({ JUPYTER_CONTROLS_VERSION: '2.0.0' }));

const { attachWidgets } = await import('./widgets');
const { NotebookModel } = await import('@jupyterlab/notebook');

const STATE_KEY = 'application/vnd.jupyter.widget-state+json';

const SAVED = {
  version_major: 2,
  version_minor: 0,
  state: { s1: { model_name: 'IntSliderModel', state: { value: 4 } } },
};

function setup({ kernel = { id: 'k1' } as unknown, saved = undefined as unknown } = {}) {
  const owner = {};
  const session = {
    session: { kernel },
    kernelChanged: new Signal(owner),
  };
  const rendermime = { addFactory: vi.fn(), removeMimeType: vi.fn() };
  const model = new NotebookModel();
  if (saved) model.setMetadata('widgets', { [STATE_KEY]: saved });
  fakes.managers.length = 0;
  const widgets = attachWidgets(
    session as unknown as ISessionContext,
    rendermime as unknown as IRenderMimeRegistry,
    model,
  );
  return { session, rendermime, model, widgets };
}

const VIEW = expect.objectContaining({
  mimeTypes: ['application/vnd.jupyter.widget-view+json'],
});

describe('attachWidgets', () => {
  it('renders widget views with a manager for the session’s kernel', () => {
    const { session, rendermime, widgets } = setup();
    expect(fakes.managers).toHaveLength(1);
    expect(fakes.managers[0]!.kernel).toBe(session.session.kernel);
    expect(rendermime.addFactory).toHaveBeenCalledWith(
      expect.objectContaining({ mimeTypes: ['application/vnd.jupyter.widget-view+json'] }),
      -10,
    );

    // A new kernel gets a new manager.
    session.session.kernel = { id: 'k2' };
    session.kernelChanged.emit(undefined);
    expect(fakes.managers).toHaveLength(2);
    expect(fakes.managers[0]!.dispose).toHaveBeenCalled();

    widgets.dispose();
    expect(widgets.isDisposed).toBe(true);
    expect(fakes.managers[1]!.dispose).toHaveBeenCalled();
    expect(rendermime.removeMimeType).toHaveBeenLastCalledWith(
      'application/vnd.jupyter.widget-view+json',
    );
  });

  it('saves the live widgets’ state into the notebook metadata', () => {
    const { widgets } = setup();
    const state = {
      version_major: 2,
      version_minor: 0,
      state: { abc: { model_name: 'ButtonModel', state: { icon: 'check' } } },
    };
    fakes.managers[0]!.state = state;
    const model = new NotebookModel();
    widgets.saveState(model);
    expect(model.getMetadata('widgets')).toEqual({ [STATE_KEY]: state });
  });

  it('leaves a notebook without widgets alone, but clears stale state', () => {
    const { widgets } = setup();
    const model = new NotebookModel();
    widgets.saveState(model);
    expect(model.getMetadata('widgets')).toBeUndefined();

    model.setMetadata('widgets', { [STATE_KEY]: { state: { old: {} } } });
    widgets.saveState(model);
    expect(model.getMetadata('widgets')).toEqual({ [STATE_KEY]: fakes.managers[0]!.state });
  });

  it('saves nothing without a kernel', () => {
    const { session, widgets } = setup();
    session.session.kernel = undefined;
    session.kernelChanged.emit(undefined);
    const model = new NotebookModel();
    widgets.saveState(model);
    expect(model.getMetadata('widgets')).toBeUndefined();
  });

  it('renders saved widgets without a kernel, from the notebook’s state', async () => {
    const { rendermime, model, widgets } = setup({ kernel: null, saved: SAVED });
    expect(fakes.managers).toHaveLength(1);
    const saved = fakes.managers[0]!;
    expect(saved.kernel).toBeNull();
    expect(rendermime.addFactory).toHaveBeenCalledWith(VIEW, -10);
    await vi.waitFor(() => expect(saved.restoredStatus).toBe(true));
    expect(saved.loaded).toEqual([SAVED]);

    // A save without a kernel keeps the state the file came with.
    widgets.saveState(model);
    expect(model.getMetadata('widgets')).toEqual({ [STATE_KEY]: SAVED });
  });

  it('has no manager without a kernel or saved widgets', () => {
    const { rendermime } = setup({ kernel: null });
    expect(fakes.managers).toHaveLength(0);
    expect(rendermime.addFactory).not.toHaveBeenCalled();
  });

  it('hands saved widgets over to the kernel’s manager when one starts', () => {
    const { session, rendermime } = setup({ kernel: null, saved: SAVED });
    const saved = fakes.managers[0]!;
    session.session.kernel = { id: 'k1' };
    session.kernelChanged.emit(undefined);

    expect(saved.dispose).toHaveBeenCalled();
    expect(fakes.managers).toHaveLength(2);
    const live = fakes.managers[1]!;
    expect(live.kernel).toBe(session.session.kernel);
    expect(rendermime.addFactory).toHaveBeenLastCalledWith(VIEW, -10);
    // The saved models come after the kernel's own, on every restore.
    expect(live.loaded).toEqual([]);
    live.finishRestore();
    expect(live.loaded).toEqual([SAVED]);

    // Back to the saved state when the kernel goes.
    session.session.kernel = null;
    session.kernelChanged.emit(undefined);
    expect(live.dispose).toHaveBeenCalled();
    expect(fakes.managers).toHaveLength(3);
    expect(fakes.managers[2]!.kernel).toBeNull();
  });
});
