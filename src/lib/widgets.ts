/**
 * ipywidgets, loaded only when a notebook opens (its own chunk).
 *
 * JupyterLab's widget plugin (`@jupyter-widgets/jupyterlab-manager/lib/plugin`)
 * needs the application, a notebook tracker and a document context. The app
 * has none of those, so this uses the same manager JupyterLab uses for
 * consoles, `KernelWidgetManager`, which needs only the kernel: one per
 * kernel, with the widget-view renderer swapped in the notebook's rendermime.
 * Widget state is not saved into the notebook (JupyterLab's `saveState`
 * setting, off by default there too).
 */
import type { ISessionContext } from '@jupyterlab/apputils';
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import type { Kernel } from '@jupyterlab/services';
import * as base from '@jupyter-widgets/base';
import { JUPYTER_CONTROLS_VERSION } from '@jupyter-widgets/controls/lib/version';
import {
  KernelWidgetManager,
  WIDGET_VIEW_MIMETYPE,
} from '@jupyter-widgets/jupyterlab-manager/lib/manager';
import { WidgetRenderer } from '@jupyter-widgets/jupyterlab-manager/lib/renderer';
import {
  OUTPUT_WIDGET_VERSION,
  OutputModel,
  OutputView,
} from '@jupyter-widgets/jupyterlab-manager/lib/output';
import { DisposableDelegate, type IDisposable } from '@lumino/disposable';

import '@jupyter-widgets/base/css/index.css';
import '@jupyter-widgets/controls/css/widgets-base.css';

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
    } as any,
  });
  // The controls are the bulk of ipywidgets; fetch them on first use.
  manager.register({
    name: '@jupyter-widgets/controls',
    version: JUPYTER_CONTROLS_VERSION,
    exports: () => import('@jupyter-widgets/controls') as any,
  });
  manager.register({
    name: '@jupyter-widgets/output',
    version: OUTPUT_WIDGET_VERSION,
    exports: { OutputModel, OutputView } as any,
  });
  return manager;
}

/** Render ipywidgets in this notebook, following its session's kernel. */
export function attachWidgets(
  session: ISessionContext,
  rendermime: IRenderMimeRegistry,
): IDisposable {
  let manager: KernelWidgetManager | undefined;
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
  return new DisposableDelegate(() => {
    session.kernelChanged.disconnect(update);
    rendermime.removeMimeType(WIDGET_VIEW_MIMETYPE);
    manager?.dispose();
  });
}
