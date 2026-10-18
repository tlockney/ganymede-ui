/**
 * ipywidgets, loaded only when a notebook opens (its own chunk).
 *
 * JupyterLab's widget plugin (`@jupyter-widgets/jupyterlab-manager/lib/plugin`)
 * needs the application, a notebook tracker and a document context. The app
 * has none of those, so this uses the same manager JupyterLab uses for
 * consoles, `KernelWidgetManager`, which needs only the kernel: one per
 * kernel, with the widget-view renderer swapped in the notebook's rendermime.
 * `saveState` writes the live widgets' state into the notebook's metadata
 * before a save, as JupyterLab's notebook manager does with its "Save
 * Widget State Automatically" setting on.
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

function createManager(kernel: Kernel.IKernelConnection, rendermime: IRenderMimeRegistry) {
  const manager = new KernelWidgetManager(kernel, rendermime);
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

export interface NotebookWidgets extends IDisposable {
  /**
   * Put the state of the live widgets into the notebook's metadata
   * (`metadata.widgets["application/vnd.jupyter.widget-state+json"]`), for
   * renderers that show widgets without a kernel. Does nothing in a notebook
   * that has no widgets and no saved state.
   */
  saveState(model: INotebookModel): void;
}

/** Render ipywidgets in this notebook, following its session's kernel. */
export function attachWidgets(
  session: ISessionContext,
  rendermime: IRenderMimeRegistry,
): NotebookWidgets {
  let manager: KernelWidgetManager | undefined;
  let disposed = false;
  const update = () => {
    const kernel = session.session?.kernel;
    if (manager && manager.kernel === kernel) return;
    manager?.dispose();
    manager = kernel ? createManager(kernel, rendermime) : undefined;
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
      if (!manager) return;
      const state = manager.get_state_sync({ drop_defaults: true });
      const live = Object.keys((state as { state?: object }).state ?? {}).length > 0;
      if (!live && model.getMetadata('widgets') === undefined) return;
      model.setMetadata('widgets', { [WIDGET_STATE_MIMETYPE]: state });
    },
  };
}
