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
import { AUTOSAVE_INTERVAL_MS, NotebookSaver, SaveConflict } from '../lib/saver';
import { hasUntrustedOutputs } from '../lib/trust';
import type { NotebookWidgets } from '../lib/widgets';

export type CellType = nbformat.CellType;

/** `none`: no kernel yet; one starts on the first run. */
export type KernelState = Kernel.Status | 'connecting' | 'none';

/** What the toolbar needs from the open notebook. */
export type NotebookController = {
  path: string;
  name: string;
  status: KernelState;
  /** The running kernel, or the one the first run will start. */
  kernelName?: string;
  /**
   * The kernel the file asks for when it isn't installed here (its display
   * name): running needs another one picked first.
   */
  missingKernel?: string;
  dirty: boolean;
  /** False while code cells show outputs from a file nobody trusted. */
  trusted: boolean;
  /** Saves the notebook; false when it wasn't (the pane says why). */
  save(): Promise<boolean>;
  /** Download the notebook as it is now, unsaved edits included, as .ipynb. */
  download(): void;
  /** Trust the notebook: render its outputs in full, and sign it on the server. */
  trust(): Promise<void>;
  run(): Promise<void>;
  runAll(): Promise<void>;
  insert(type: 'code' | 'markdown'): void;
  /** The active cell's type. */
  cellType: CellType;
  /** Change the selected cells (or the active one) to `type`. */
  changeCellType(type: CellType): void;
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
  saver: NotebookSaver;
  /**
   * Before a run of the selected cells (or `all`): starts the kernel when
   * none is running and they include a code cell. False when there is none
   * to start.
   */
  ensureKernel(all?: boolean): Promise<boolean>;
  disposables: IDisposable[];
};

function activeType(notebook: Notebook): CellType | undefined {
  const cells = notebook.model?.cells;
  const i = notebook.activeCellIndex;
  return cells && i >= 0 && i < cells.length ? cells.get(i).type : undefined;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

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
  /** The kernel the first run starts, or the uninstalled one the file names. */
  const [intended, setIntendedState] = useState<{ name?: string; missing?: string }>({});
  const intendedRef = useRef(intended);
  const setIntended = (next: { name?: string; missing?: string }) => {
    intendedRef.current = next;
    setIntendedState(next);
  };
  const [dirty, setDirty] = useState(false);
  const [trusted, setTrusted] = useState(true);
  const [cellType, setCellType] = useState<CellType>('code');
  /** Why the last notebook action failed, until dismissed. */
  const [notice, setNotice] = useState<string>();
  /** The notice saying the file's kernel is missing; picking one clears it. */
  const kernelNotice = useRef<string>(undefined);
  /** Whether the session has rejoined the file's running kernel, if any. */
  const [joined, setJoined] = useState(false);
  /** Set when autosave met a file changed on disk; a save clears it. */
  const autosaveOff = useRef(false);

  // Load the file, build the notebook, and join its session.
  useEffect(() => {
    let cancelled = false;
    let current: Open | undefined;
    setJoined(false);
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
      // page), but starts none: opening a notebook to read it shouldn't
      // start a kernel. The first run starts the one the file names, or the
      // default when it names none. A kernel it names that isn't installed
      // here (a Python notebook with no Python) is not swapped for another.
      const specs = services.kernelspecs.specs;
      const wanted = content.metadata?.kernelspec;
      const installed = !!wanted?.name && !!specs?.kernelspecs[wanted.name];
      setIntended(
        wanted?.name && !installed
          ? { missing: wanted.display_name || wanted.name }
          : { name: installed ? wanted!.name : (specs?.default ?? undefined) },
      );
      const session = new SessionContext({
        sessionManager: services.sessions,
        specsManager: services.kernelspecs,
        path,
        name: basename(path),
        type: 'notebook',
        kernelPreference: { shouldStart: false, autoStartDefault: false },
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

      const fileName = basename(path);
      // Rejoin before anything decides there is no kernel: a run before
      // that would replace the kernel already running for this file.
      const joining = session.initialize();
      const startKernel = async () => {
        const { name, missing } = intendedRef.current;
        if (!name) {
          kernelNotice.current = missing
            ? `${fileName} uses ${missing}, which isn’t installed here. Pick a kernel in the toolbar to run it.`
            : 'There is no kernel to run this notebook. Pick one in the toolbar.';
          setNotice(kernelNotice.current);
          return false;
        }
        await session.changeKernel({ name });
        return true;
      };
      // Markdown and raw cells render without a kernel.
      const needsKernel = (all: boolean) =>
        notebook.widgets.some(
          cell => cell.model.type === 'code' && (all || notebook.isSelectedOrActive(cell)),
        );
      // Runs that come in while the kernel starts share that start.
      let starting: Promise<boolean> | undefined;
      const ensureKernel = async (all = false) => {
        await joining;
        if (session.session?.kernel || !needsKernel(all)) return true;
        starting ??= startKernel().finally(() => (starting = undefined));
        return starting;
      };
      const commands = createCommands(notebook, session, ensureKernel, e =>
        setNotice(`Couldn’t run: ${messageOf(e)}`),
      );
      const editing = attachEditing(notebook, session, rendermime, commands);
      const notebookWidgets = widgets.attachWidgets(session, rendermime);
      const saver = new NotebookSaver({
        contents: services.contents,
        path,
        model,
        lastModified: file.last_modified,
        beforeSave: () => notebookWidgets.saveState(model),
      });
      const onKey = (e: KeyboardEvent) => commands.processKeydownEvent(e);
      // Capture phase, as a Lumino application does, so a notebook shortcut
      // (Shift+Enter) wins over the editor's own binding for the key.
      document.addEventListener('keydown', onKey, true);

      current = {
        notebook,
        model,
        session,
        widgets: notebookWidgets,
        saver,
        ensureKernel,
        disposables: [
          editing,
          notebookWidgets,
          { dispose: () => saver.dispose(), isDisposed: false },
          {
            dispose: () => document.removeEventListener('keydown', onKey, true),
            isDisposed: false,
          },
        ],
      };
      setOpen(current);
      await joining;
      if (cancelled) return;
      setJoined(true);
      await syncLanguage();
    })().catch(e => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
      const done = current;
      if (!done) return;
      const teardown = () => {
        done.disposables.forEach(d => d.dispose());
        // After React's commit: JupyterLab's React-based widgets unmount
        // their own roots on dispose, which React refuses mid-render.
        setTimeout(() => {
          done.notebook.dispose();
          holderOf(done.notebook).remove();
          done.model.dispose();
          // Leave the kernel running; the sidebar lists it under Running.
          done.session.dispose();
        });
      };
      // Opening another file keeps this one's edits: save them first, as
      // autosave would, then let it go.
      if (done.model.dirty && !autosaveOff.current) {
        void done.saver
          .save({ ifDirty: true })
          .catch(e => console.error(`Couldn’t save ${path}:`, e))
          .finally(teardown);
      } else {
        teardown();
      }
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
      setStatus(
        !joined
          ? 'connecting'
          : !session.session
            ? 'none'
            : kernel?.connectionStatus === 'connected'
              ? kernel.status
              : 'connecting',
      );
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
  }, [open, joined]);

  // The active cell's type for the toolbar. Changing a cell's type replaces
  // its widget, which makes the new one active.
  useEffect(() => {
    if (!open) return;
    const { notebook } = open;
    const update = () => setCellType(activeType(notebook) ?? 'code');
    update();
    notebook.activeCellChanged.connect(update);
    return () => {
      notebook.activeCellChanged.disconnect(update);
    };
  }, [open]);

  // Don't lose unsaved edits: save every few minutes and when the page is
  // hidden (an installed web app can be killed after that), and ask before
  // the page closes with edits that are not saved yet.
  useEffect(() => {
    if (!open) return;
    const { model, saver } = open;
    const autosave = () => {
      if (!model.dirty || autosaveOff.current) return;
      saver.save({ ifDirty: true }).catch(e => {
        if (e instanceof SaveConflict) {
          autosaveOff.current = true;
          setNotice(
            `${basename(path)} changed on disk since it was opened. ` +
              'Autosave is off until you save it.',
          );
        } else {
          setNotice(`Couldn’t autosave ${basename(path)}: ${messageOf(e)}`);
        }
      });
    };
    const onHidden = () => document.visibilityState === 'hidden' && autosave();
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!model.dirty) return;
      e.preventDefault();
      // Older browsers ask only when returnValue is set.
      e.returnValue = '';
    };
    const timer = setInterval(autosave, AUTOSAVE_INTERVAL_MS);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [open, path]);

  useEffect(() => {
    if (!open) return;
    const { notebook, model, session, saver } = open;
    const fileName = basename(path);
    // The toolbar and ⌘S fire these and forget them; a failure shows in the
    // pane instead of only in the console.
    const report =
      <A extends unknown[]>(what: string, action: (...args: A) => Promise<void>) =>
      async (...args: A) => {
        try {
          await action(...args);
        } catch (e) {
          setNotice(`Couldn’t ${what}: ${messageOf(e)}`);
        }
      };
    onController({
      path,
      name: basename(path),
      status,
      kernelName: kernelName ?? intended.name,
      missingKernel: kernelName ? undefined : intended.missing,
      dirty,
      trusted,
      cellType,
      changeCellType: type => {
        NotebookActions.changeCellType(notebook, type);
        setCellType(activeType(notebook) ?? type);
        // Back to the notebook, so its shortcuts work after the picker.
        notebook.activate();
      },
      save: async () => {
        try {
          try {
            await saver.save();
          } catch (e) {
            if (!(e instanceof SaveConflict)) throw e;
            if (
              !window.confirm(
                `${fileName} changed on disk since it was opened or last saved.\n\nOverwrite it with this copy?`,
              )
            )
              return false;
            await saver.save({ overwrite: true });
          }
        } catch (e) {
          setNotice(`Couldn’t save ${fileName}: ${messageOf(e)}`);
          return false;
        }
        autosaveOff.current = false;
        setNotice(undefined);
        return true;
      },
      download: () => {
        // Widget state goes in, as on save; that is not an edit.
        const wasDirty = model.dirty;
        open.widgets.saveState(model);
        model.dirty = wasDirty;
        // As nbformat writes it: one-space indent, trailing newline.
        const text = JSON.stringify(model.toJSON(), null, 1) + '\n';
        downloadFile(basename(path), text, 'application/x-ipynb+json');
      },
      trust: report(`trust ${fileName}`, async () => {
        // As NotebookActions.trust, without its dialog: trusting a cell
        // re-renders its outputs. The cells' `trusted` metadata is not an
        // edit of the user's.
        const wasDirty = model.dirty;
        for (let i = 0; i < model.cells.length; i++) model.cells.get(i).trusted = true;
        model.dirty = wasDirty;
        setTrusted(true);
        // Unsaved changes are signed on the next save: every cell is trusted.
        await trustNotebook(backend, path);
      }),
      run: report('run the cell', async () => {
        if (await open.ensureKernel()) await NotebookActions.runAndAdvance(notebook, session);
      }),
      runAll: report('run all cells', async () => {
        if (await open.ensureKernel(true)) await NotebookActions.runAll(notebook, session);
      }),
      insert: type => {
        NotebookActions.insertBelow(notebook);
        if (type !== 'code') NotebookActions.changeCellType(notebook, type);
        notebook.mode = 'edit';
      },
      interrupt: report('interrupt the kernel', async () => {
        await session.session?.kernel?.interrupt();
      }),
      restart: report('restart the kernel', async () => {
        await session.session?.kernel?.restart();
      }),
      // With no kernel yet, this only picks the one the first run starts.
      changeKernel: report('change the kernel', async (name: string) => {
        if (session.session) await session.changeKernel({ name });
        // Also with a kernel running: if it is shut down, the next run
        // starts this one, as the file's metadata now says.
        setIntended({ name });
        // Only the missing-kernel notice: an autosave warning still holds.
        setNotice(n => (n === kernelNotice.current ? undefined : n));
        const spec = services.kernelspecs.specs?.kernelspecs[name];
        if (spec) {
          model.setMetadata('kernelspec', {
            name,
            display_name: spec.display_name,
            language: spec.language,
          });
        }
      }),
    });
  }, [
    open,
    path,
    status,
    kernelName,
    intended,
    dirty,
    trusted,
    cellType,
    backend,
    services,
    onController,
  ]);

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
  return (
    <>
      <div className="notebook-page" ref={host} />
      {notice && (
        <div className="pane-notice" role="alert">
          <span>{notice}</span>
          <button className="pane-notice-dismiss" onClick={() => setNotice(undefined)}>
            Dismiss
          </button>
        </div>
      )}
    </>
  );
}
