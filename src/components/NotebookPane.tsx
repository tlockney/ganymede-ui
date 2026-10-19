import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SessionContext } from '@jupyterlab/apputils';
import type * as nbformat from '@jupyterlab/nbformat';
import { type Notebook, NotebookActions, NotebookModel } from '@jupyterlab/notebook';
import type { Kernel } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';
import { Widget } from '@lumino/widgets';
import { type Backend, trustNotebook } from '../lib/backends';
import { attachEditing, createCommands, createNotebook, createRendermime } from '../lib/jupyterlab';
import { downloadFile } from '../lib/download';
import { hasUntrustedOutputs } from '../lib/trust';
import type { NotebookWidgets } from '../lib/widgets';

export type KernelState = Kernel.Status | 'connecting';

/** What the toolbar needs from the open notebook. */
export type NotebookController = {
  path: string;
  name: string;
  status: KernelState;
  kernelName?: string;
  dirty: boolean;
  /** False while code cells show outputs from a file nobody trusted. */
  trusted: boolean;
  save(): Promise<void>;
  /** Download the notebook as it is now, unsaved edits included, as .ipynb. */
  download(): void;
  /** Trust the notebook: render its outputs in full, and sign it on the server. */
  trust(): Promise<void>;
  run(): Promise<void>;
  runAll(): Promise<void>;
  insert(type: 'code' | 'markdown'): void;
  interrupt(): Promise<void>;
  restart(): Promise<void>;
  changeKernel(name: string): Promise<void>;
};

type Props = {
  backend: Backend;
  path: string;
  onController(c: NotebookController | undefined): void;
};

const basename = (p: string) => p.split('/').pop() ?? p;

/** The node each notebook widget is attached to; see the attach effect. */
const holders = new WeakMap<Notebook, HTMLDivElement>();
function holderOf(notebook: Notebook): HTMLDivElement {
  let holder = holders.get(notebook);
  if (!holder) {
    holder = document.createElement('div');
    // `jp-MainAreaWidget` as in JupyterLab, where the notebook sits in one:
    // the completer sizes its popup to the main-area widget's child, and
    // without one it fits the popup inside the cell's editor.
    holder.className = 'notebook-holder jp-MainAreaWidget';
    holders.set(notebook, holder);
  }
  return holder;
}

/** A hidden place in the document for notebooks on their way out. */
function parking(): HTMLElement {
  let node = document.getElementById('notebook-parking');
  if (!node) {
    node = document.createElement('div');
    node.id = 'notebook-parking';
    node.hidden = true;
    document.body.append(node);
  }
  return node;
}

/** Everything one open notebook holds, built once per file. */
type Open = {
  notebook: Notebook;
  model: NotebookModel;
  session: SessionContext;
  widgets: NotebookWidgets;
  disposables: IDisposable[];
};

/**
 * One notebook file: loads it through the contents API, joins or starts its
 * session, and shows JupyterLab's `Notebook` widget for it. The file is
 * loaded and saved here (nbformat in, nbformat out) rather than by a
 * JupyterLab document context, so the same code saves to a Ganymede server
 * or to the browser's own storage.
 */
export function NotebookPane({ backend, path, onController }: Props) {
  const { services } = backend;
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Open>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<KernelState>('connecting');
  const [kernelName, setKernelName] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const [trusted, setTrusted] = useState(true);

  // Load the file, build the notebook, and join its session.
  useEffect(() => {
    let cancelled = false;
    let current: Open | undefined;
    (async () => {
      const [file, widgets] = await Promise.all([
        services.contents.get(path, { type: 'notebook', content: true }),
        // ipywidgets live in their own chunk; load them alongside the file so
        // the comm target is there before the kernel can open a widget.
        import('../lib/widgets'),
        services.kernelspecs.ready,
      ]);
      if (cancelled) return;
      const content = file.content as nbformat.INotebookContent;

      const rendermime = createRendermime(path, services.contents);
      // As JupyterLab's model factory does by default: undo per cell.
      const model = new NotebookModel({ disableDocumentWideUndoRedo: true });
      model.fromJSON(content);
      model.dirty = false;
      const notebook = createNotebook(rendermime);
      notebook.model = model;

      // One session per notebook, found by path. `initialize` rejoins the
      // session already running for this file (on the server or in this
      // page), or starts one with the kernel the file names.
      const specs = services.kernelspecs.specs;
      const wanted = content.metadata?.kernelspec?.name;
      const name = wanted && specs?.kernelspecs[wanted] ? wanted : specs?.default;
      const session = new SessionContext({
        sessionManager: services.sessions,
        specsManager: services.kernelspecs,
        path,
        name: basename(path),
        type: 'notebook',
        kernelPreference: { name, autoStartDefault: true },
      });

      // Without JupyterLab's NotebookPanel, keep its habit of copying the
      // kernel's language_info into the notebook: the editors take their
      // language (and highlighting) from it.
      const syncLanguage = async () => {
        const kernel = session.session?.kernel;
        const info = kernel && (await kernel.info);
        if (!info || model.isDisposed) return;
        const before = model.getMetadata('language_info');
        if (JSON.stringify(before) === JSON.stringify(info.language_info)) return;
        const wasDirty = model.dirty;
        model.setMetadata('language_info', info.language_info);
        // Not an edit of the user's: don't mark the file "Edited" for it.
        model.dirty = wasDirty;
      };
      session.kernelChanged.connect(() => void syncLanguage());

      const commands = createCommands(notebook, session);
      const editing = attachEditing(notebook, session, rendermime, commands);
      const notebookWidgets = widgets.attachWidgets(session, rendermime);
      const onKey = (e: KeyboardEvent) => commands.processKeydownEvent(e);
      // Capture phase, as a Lumino application does, so a notebook shortcut
      // (Shift+Enter) wins over the editor's own binding for the key.
      document.addEventListener('keydown', onKey, true);

      current = {
        notebook,
        model,
        session,
        widgets: notebookWidgets,
        disposables: [
          editing,
          notebookWidgets,
          {
            dispose: () => document.removeEventListener('keydown', onKey, true),
            isDisposed: false,
          },
        ],
      };
      setOpen(current);
      await session.initialize();
      await syncLanguage();
    })().catch(e => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      const done = current;
      if (!done) return;
      done.disposables.forEach(d => d.dispose());
      // After React's commit: JupyterLab's React-based widgets unmount their
      // own roots on dispose, which React refuses mid-render.
      setTimeout(() => {
        done.notebook.dispose();
        holderOf(done.notebook).remove();
        done.model.dispose();
        // Leave the kernel running; the sidebar lists it under Running.
        done.session.dispose();
      });
    };
  }, [services, path]);

  // Put the Lumino widget in the page. The widget lives in a holder node
  // that moves in and out of the pane: when the pane goes, the holder is
  // parked off-screen (still in the document) instead of detaching there and
  // then, because detaching unmounts JupyterLab's React-based parts (the
  // collapsers), which React refuses in the middle of its own commit, and
  // Lumino refuses to detach a widget whose node has left the document.
  // Disposing the notebook later detaches it.
  useLayoutEffect(() => {
    const node = host.current;
    if (!open || !node) return;
    const holder = holderOf(open.notebook);
    node.append(holder);
    if (!open.notebook.isAttached) {
      Widget.attach(open.notebook, holder);
      // Start with the first cell active, ready for the keyboard.
      open.notebook.activeCellIndex = 0;
    }
    const observer = new ResizeObserver(() => open.notebook.update());
    observer.observe(node);
    return () => {
      observer.disconnect();
      parking().append(holder);
    };
  }, [open]);

  // Kernel status and dirty state for the toolbar.
  useEffect(() => {
    if (!open) return;
    const { session, model } = open;
    const update = () => {
      const kernel = session.session?.kernel;
      setStatus(kernel?.connectionStatus === 'connected' ? kernel.status : 'connecting');
      setKernelName(kernel?.name);
      setDirty(model.dirty);
      setTrusted(!hasUntrustedOutputs(model));
    };
    update();
    session.statusChanged.connect(update);
    session.connectionStatusChanged.connect(update);
    session.kernelChanged.connect(update);
    model.stateChanged.connect(update);
    model.contentChanged.connect(update);
    return () => {
      session.statusChanged.disconnect(update);
      session.connectionStatusChanged.disconnect(update);
      session.kernelChanged.disconnect(update);
      model.stateChanged.disconnect(update);
      model.contentChanged.disconnect(update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const { notebook, model, session, widgets } = open;
    onController({
      path,
      name: basename(path),
      status,
      kernelName,
      dirty,
      trusted,
      save: async () => {
        widgets.saveState(model);
        await services.contents.save(path, {
          type: 'notebook',
          format: 'json',
          content: model.toJSON(),
        });
        model.dirty = false;
      },
      download: () => {
        // Widget state goes in, as on save; that is not an edit.
        const wasDirty = model.dirty;
        widgets.saveState(model);
        model.dirty = wasDirty;
        // As nbformat writes it: one-space indent, trailing newline.
        const text = JSON.stringify(model.toJSON(), null, 1) + '\n';
        downloadFile(basename(path), text, 'application/x-ipynb+json');
      },
      trust: async () => {
        // As NotebookActions.trust, without its dialog: trusting a cell
        // re-renders its outputs. The cells' `trusted` metadata is not an
        // edit of the user's.
        const wasDirty = model.dirty;
        for (let i = 0; i < model.cells.length; i++) model.cells.get(i).trusted = true;
        model.dirty = wasDirty;
        setTrusted(true);
        // Unsaved changes are signed on the next save: every cell is trusted.
        await trustNotebook(backend, path);
      },
      run: async () => void (await NotebookActions.runAndAdvance(notebook, session)),
      runAll: async () => void (await NotebookActions.runAll(notebook, session)),
      insert: type => {
        NotebookActions.insertBelow(notebook);
        if (type !== 'code') NotebookActions.changeCellType(notebook, type);
        notebook.mode = 'edit';
      },
      interrupt: async () => void (await session.session?.kernel?.interrupt()),
      restart: async () => void (await session.session?.kernel?.restart()),
      changeKernel: async name => {
        await session.changeKernel({ name });
        const spec = services.kernelspecs.specs?.kernelspecs[name];
        if (spec) {
          model.setMetadata('kernelspec', {
            name,
            display_name: spec.display_name,
            language: spec.language,
          });
        }
      },
    });
  }, [open, path, status, kernelName, dirty, trusted, backend, services, onController]);

  useEffect(() => () => onController(undefined), [onController]);

  if (error) {
    return (
      <div className="pane-message">
        <h2>Couldn’t open {basename(path)}</h2>
        <p>{error}</p>
      </div>
    );
  }
  if (!open) {
    return <div className="pane-message subtle">Opening {basename(path)}…</div>;
  }
  return <div className="notebook-page" ref={host} />;
}
