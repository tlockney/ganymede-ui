/**
 * ipywidgets, loaded only when a notebook opens (its own chunk).
 *
 * JupyterLab's widget plugin (`@jupyter-widgets/jupyterlab-manager/lib/plugin`)
 * needs the application, a notebook tracker and a document context. The app
 * has none of those, so this uses the same manager JupyterLab uses for
 * consoles, `KernelWidgetManager`, which needs only the kernel: one per
 * kernel, with the widget-view renderer swapped in the notebook's rendermime.
 *
 * Without a kernel, widgets render from the state saved in the notebook's
 * metadata, as nbviewer and VS Code show them: a manager with no kernel
 * builds the models from that state, with no comms, so the views work in
 * the page (a slider moves, `jslink` holds) but nothing reaches Python.
 * When a kernel starts, its manager takes over for new outputs and loads
 * the saved models that the kernel doesn't have, as JupyterLab's notebook
 * manager does. `saveState` writes the widgets' state into the metadata
 * before a save, as JupyterLab does with its "Save Widget State
 * Automatically" setting on.
 *
 * The widget-view renderer is not safe (as in JupyterLab), so outputs of a
 * notebook nobody trusted show their text until it is trusted.
 */
import type { ISessionContext } from '@jupyterlab/apputils';
import type { INotebookModel } from '@jupyterlab/notebook';
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import type { Kernel } from '@jupyterlab/services';
import * as base from '@jupyter-widgets/base';
import type { ExportMap } from '@jupyter-widgets/base/lib/registry';
import { JUPYTER_CONTROLS_VERSION } from '@jupyter-widgets/controls/lib/version';
import {
  KernelWidgetManager,
  LabWidgetManager,
  WIDGET_STATE_MIMETYPE,
  WIDGET_VIEW_MIMETYPE,
} from '@jupyter-widgets/jupyterlab-manager/lib/manager';
import { WidgetRenderer } from '@jupyter-widgets/jupyterlab-manager/lib/renderer';
import {
  OUTPUT_WIDGET_VERSION,
  OutputModel,
  OutputView,
} from '@jupyter-widgets/jupyterlab-manager/lib/output';
import type { IDisposable } from '@lumino/disposable';

import '@jupyter-widgets/base/css/index.css';
import '@jupyter-widgets/controls/css/widgets-base.css';
// Icons on buttons and other controls (`icon='check'`), loaded with this
// chunk; see the stylesheet.
import '../styles/fontawesome.css';

/** `metadata.widgets[WIDGET_STATE_MIMETYPE]`, as nbformat saves it. */
type SavedState = Parameters<LabWidgetManager['set_state']>[0];

function savedState(model: INotebookModel): SavedState | undefined {
  const widgets = model.getMetadata('widgets') as Record<string, unknown> | undefined;
  const state = widgets?.[WIDGET_STATE_MIMETYPE] as SavedState | undefined;
  return state && typeof state.state === 'object' && Object.keys(state.state).length > 0
    ? state
    : undefined;
}

/** A kernel's manager, which can also take the notebook's saved widgets. */
class NotebookKernelWidgetManager extends KernelWidgetManager {
  /** Build the saved models the kernel doesn't have, without comms. */
  async loadSaved(state: SavedState): Promise<void> {
    await this.set_state(this.filterExistingModelState(state));
  }
}

/** Widgets from the notebook's saved state, for when there is no kernel. */
class SavedStateWidgetManager extends LabWidgetManager {
  get kernel(): Kernel.IKernelConnection | null {
    return null;
  }

  // No comms: `set_state` builds every model without one.
  async _get_comm_info(): Promise<object> {
    return {};
  }

  async _create_comm(): Promise<never> {
    throw new Error('There is no kernel for this widget to talk to.');
  }

  /** Build the models, then let renderers waiting for them try again. */
  async load(state: SavedState): Promise<void> {
    await this.set_state(state);
    this._restoredStatus = true;
    this._restored.emit();
  }
}

function register<T extends LabWidgetManager>(manager: T): T {
  manager.register({
    name: '@jupyter-widgets/base',
    version: base.JUPYTER_WIDGETS_VERSION,
    exports: {
      WidgetModel: base.WidgetModel,
      WidgetView: base.WidgetView,
      DOMWidgetView: base.DOMWidgetView,
      DOMWidgetModel: base.DOMWidgetModel,
      LayoutModel: base.LayoutModel,
      LayoutView: base.LayoutView,
      StyleModel: base.StyleModel,
      StyleView: base.StyleView,
      ErrorWidgetView: base.ErrorWidgetView,
    },
  });
  // The controls are the bulk of ipywidgets; fetch them on first use. The
  // module also exports non-widget values (`version`, `default`), which the
  // manager ignores.
  manager.register({
    name: '@jupyter-widgets/controls',
    version: JUPYTER_CONTROLS_VERSION,
    exports: () => import('@jupyter-widgets/controls') as unknown as Promise<ExportMap>,
  });
  manager.register({
    name: '@jupyter-widgets/output',
    version: OUTPUT_WIDGET_VERSION,
    exports: { OutputModel, OutputView },
  });
  return manager;
}

function createKernelManager(
  kernel: Kernel.IKernelConnection,
  rendermime: IRenderMimeRegistry,
  model: INotebookModel,
) {
  const manager = register(new NotebookKernelWidgetManager(kernel, rendermime));
  // After each restore from the kernel (it repeats on reconnect), so the
  // kernel's own models win.
  const loadSaved = () => {
    const state = savedState(model);
    if (state) manager.loadSaved(state).catch(e => console.error('Saved widget state:', e));
  };
  manager.restored.connect(loadSaved);
  if (manager.restoredStatus) loadSaved();
  return manager;
}

function createSavedStateManager(rendermime: IRenderMimeRegistry, state: SavedState) {
  const manager = register(new SavedStateWidgetManager(rendermime));
  manager.load(state).catch(e => console.error('Saved widget state:', e));
  return manager;
}

export interface NotebookWidgets extends IDisposable {
  /**
   * Put the state of the live widgets into the notebook's metadata
   * (`metadata.widgets["application/vnd.jupyter.widget-state+json"]`), for
   * renderers that show widgets without a kernel. Does nothing in a notebook
   * that has no widgets and no saved state.
   */
  saveState(model: INotebookModel): void;
}

/**
 * Render ipywidgets in this notebook, following its session's kernel, and
 * from the notebook's saved widget state while there is none. Call it before
 * the notebook widget gets `model`, so saved outputs render with it.
 */
export function attachWidgets(
  session: ISessionContext,
  rendermime: IRenderMimeRegistry,
  model: INotebookModel,
): NotebookWidgets {
  let manager: LabWidgetManager | undefined;
  let disposed = false;
  const update = () => {
    const kernel = session.session?.kernel ?? null;
    if (manager && manager.kernel === kernel) return;
    manager?.dispose();
    const state = kernel ? undefined : savedState(model);
    manager = kernel
      ? createKernelManager(kernel, rendermime, model)
      : state
        ? createSavedStateManager(rendermime, state)
        : undefined;
    rendermime.removeMimeType(WIDGET_VIEW_MIMETYPE);
    if (manager) {
      const m = manager;
      rendermime.addFactory(
        {
          safe: false,
          mimeTypes: [WIDGET_VIEW_MIMETYPE],
          createRenderer: options => new WidgetRenderer(options, m),
        },
        -10,
      );
    }
  };
  update();
  session.kernelChanged.connect(update);
  return {
    get isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session.kernelChanged.disconnect(update);
      rendermime.removeMimeType(WIDGET_VIEW_MIMETYPE);
      manager?.dispose();
    },
    saveState(model) {
      // Without a kernel the saved state is what there is: leave it.
      if (!(manager instanceof KernelWidgetManager)) return;
      const state = manager.get_state_sync({ drop_defaults: true });
      const live = Object.keys((state as { state?: object }).state ?? {}).length > 0;
      if (!live && model.getMetadata('widgets') === undefined) return;
      model.setMetadata('widgets', { [WIDGET_STATE_MIMETYPE]: state });
    },
  };
}
