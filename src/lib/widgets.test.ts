import '../test/notebook-env';
import { describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import { Signal } from '@lumino/signaling';

// ipywidgets' manager needs a live kernel; a fake one stands in, so this
// tests the wiring: one manager per kernel, the widget-view renderer, and
// what goes into the notebook's metadata on save.
const fakes = vi.hoisted(() => ({
  managers: [] as { kernel: unknown; state: unknown; dispose: () => void }[],
}));

vi.mock('@jupyter-widgets/jupyterlab-manager/lib/manager', () => ({
  WIDGET_VIEW_MIMETYPE: 'application/vnd.jupyter.widget-view+json',
  WIDGET_STATE_MIMETYPE: 'application/vnd.jupyter.widget-state+json',
  KernelWidgetManager: class {
    state: unknown = { version_major: 2, version_minor: 0, state: {} };
    register = vi.fn();
    dispose = vi.fn();
    constructor(readonly kernel: unknown) {
      fakes.managers.push(this);
    }
    get_state_sync() {
      return this.state;
    }
  },
}));
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

function setup() {
  const owner = {};
  const session = {
    session: { kernel: { id: 'k1' } as unknown },
    kernelChanged: new Signal(owner),
  };
  const rendermime = { addFactory: vi.fn(), removeMimeType: vi.fn() };
  fakes.managers.length = 0;
  const widgets = attachWidgets(
    session as unknown as ISessionContext,
    rendermime as unknown as IRenderMimeRegistry,
  );
  return { session, rendermime, widgets };
}

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
});
