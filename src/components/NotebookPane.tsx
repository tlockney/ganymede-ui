import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { SessionContext } from '@jupyterlab/apputils';
import type * as nbformat from '@jupyterlab/nbformat';
import { type Notebook, NotebookActions, NotebookModel } from '@jupyterlab/notebook';
import type { Contents, Kernel, KernelSpec } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';
import type { CommandRegistry } from '@lumino/commands';
import { Widget } from '@lumino/widgets';
import { type Backend, trustNotebook } from '../lib/backends';
import { attachEditing, createCommands, createNotebook, createRendermime } from '../lib/jupyterlab';
import { attachCellControls } from '../lib/cell-controls';
import { CellMenu } from './CellMenu';
import { KeyboardBar } from './KeyboardBar';
import type { Cell } from '@jupyterlab/cells';
import { downloadFile } from '../lib/download';
import {
  AUTOSAVE_INTERVAL_MS,
  DISK_CHECK_INTERVAL_MS,
  NotebookSaver,
  SaveConflict,
} from '../lib/saver';
import {
  type Problem,
  changedOnDisk,
  connectionLost,
  failed,
  isStaleBundle,
  isUnreachable,
  kernelDead,
  messageOf,
  missingKernel,
  saveFailed,
  unreachable,
} from '../lib/problems';
import { type RunStatus, attachRunStatus } from '../lib/run-status';
import { ProblemNotice } from './ProblemNotice';
import { useSignals } from '../lib/useSignal';
import { hasUntrustedOutputs } from '../lib/trust';
import { seedLanguage } from '../lib/language';
import { handOff, handedOff, renameFile, renamedPath } from '../lib/rename';
import type { NotebookWidgets } from '../lib/widgets';
import { type OutlineItem, outlineOf } from '../lib/outline';
import { attachDevice } from '../lib/device-remote';
import { guardReload, reloadPage } from '../lib/reload';

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
  /**
   * The file changed on disk since it was opened or last saved here, so
   * no save writes until {@link reload} or {@link unlock} (#367).
   */
  locked: boolean;
  /**
   * Load the file again from the server, keeping the kernel. Asks first
   * when there are unsaved edits, which it drops; false when the user
   * said no.
   */
  reload(): boolean;
  /**
   * Let saves write over the version on disk that locked it. A newer
   * change locks it again.
   */
  unlock(): Promise<void>;
  /** False while code cells show outputs from a file nobody trusted. */
  trusted: boolean;
  /** Saves the notebook; false when it wasn't (the pane says why, or it is locked). */
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
  /**
   * Runs one of the notebook's commands by its id in the shortcuts table
   * (`move-up`, `to-markdown`, …); false when there is no such command.
   */
  command(id: string): boolean;
  /**
   * Rename the file to what the user typed (`.ipynb` added), in the same
   * folder; false when it wasn't (the pane says why). With `throws`, a
   * failure also rejects with why, for a caller that shows it too (the
   * sidebar, which can cover the pane).
   */
  rename(input: string, options?: { throws?: boolean }): Promise<boolean>;
  /**
   * Stop saving: the file is being deleted from under the notebook (the
   * sidebar), and a save would write it back. The function it returns
   * undoes that, for when the delete failed.
   */
  discard(): () => void;
  /**
   * Move the file to `next` with `move` (its folder's rename in the
   * sidebar). Saves wait for it and then go to `next`, edits made since
   * are saved there, and the session moves so the kernel follows when
   * the file reopens. Rejects, with nothing moved, when `move` does.
   */
  moved(next: string, move: () => Promise<unknown>): Promise<void>;
  /** The running kernel's connection, for the Variables view (#242); none before the first run. */
  kernel?: Kernel.IKernelConnection;
  /** The Markdown cells' headings, in order (#212). */
  outline: OutlineItem[];
  /** Selects the cell at `index` and scrolls it to the top; false when there is none. */
  goToCell(index: number): boolean;
};

type Props = {
  backend: Backend;
  path: string;
  onController(c: NotebookController | undefined): void;
  /** The file at `from` was renamed to `to`: open it there, if it is still the one open. */
  onRenamed?(from: string, to: string): void;
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
  /** The notebook's commands, which its keys run. */
  commands: CommandRegistry;
  /** Which cells run and wait, shown on them. */
  runStatus: RunStatus;
  /** Settles once the session has rejoined the file's kernel, if any. */
  joining: Promise<unknown>;
  disposables: IDisposable[];
};

function activeType(notebook: Notebook): CellType | undefined {
  const cells = notebook.model?.cells;
  const i = notebook.activeCellIndex;
  return cells && i >= 0 && i < cells.length ? cells.get(i).type : undefined;
}

/** A notice: what went wrong, and what Retry runs again, if it is offered. */
type Notice = { problem: Problem; retry?: () => void };

/** Why a run failed: the kernel died under it, or something else. */
function runFailed(
  session: SessionContext,
  kernelspecs: KernelSpec.IManager,
  e: unknown,
  what = 'run',
  retry = false,
): Problem {
  const kernel = session.session?.kernel;
  if (kernel?.status === 'dead') {
    const spec = kernelspecs.specs?.kernelspecs[kernel.name];
    return kernelDead(spec?.display_name ?? kernel.name);
  }
  return failed(what, e, { retry });
}

/**
 * One notebook file: loads it through the contents API, joins or starts its
 * session, and shows JupyterLab's `Notebook` widget for it. The file is
 * loaded and saved here (nbformat in, nbformat out) rather than by a
 * JupyterLab document context, so the same code saves to a Ganymede server
 * or to the browser's own storage.
 */
export function NotebookPane({ backend, path, onController, onRenamed }: Props) {
  // A ref, not a dependency of the controller effect: a parent that
  // passes a new function each render would otherwise loop (the effect
  // sets the parent's controller state, which renders it again).
  const onRenamedRef = useRef(onRenamed);
  onRenamedRef.current = onRenamed;
  const { services } = backend;
  // The problem notice's kernel list follows installs and removals (#350).
  useSignals(services.kernelspecs.specsChanged);
  const host = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<Open>();
  /** Why the file couldn't be opened. */
  const [error, setError] = useState<unknown>();
  /** Bumped by Retry after the file couldn't be opened, to load it again. */
  const [attempt, setAttempt] = useState(0);
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
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  /** Why the last notebook action failed, and what to do next, until dismissed. */
  const [notice, setNoticeState] = useState<Notice>();
  const setNotice = (problem: Problem | undefined, retry?: () => void) =>
    setNoticeState(problem && { problem, retry });
  /**
   * Set, to its notice, once the file changed on disk: no save writes
   * until a reload or Unlock clears it (#367).
   */
  const locked = useRef<Problem>(undefined);
  const [isLocked, setLocked] = useState(false);
  /** The file's time on disk when it locked, if known: what Unlock accepts. */
  const lockedAt = useRef<string>(undefined);
  /** Set by Reload: the teardown drops the edits instead of saving them. */
  const reloading = useRef(false);
  /**
   * Clear the notice if it is of one of these kinds. The lock outlasts
   * the notices shown over it, so its notice comes back when they clear.
   */
  const clearNotice = (...kinds: Problem['kind'][]) =>
    setNoticeState(n =>
      n && kinds.includes(n.problem.kind)
        ? locked.current && n.problem.kind !== 'save-conflict'
          ? { problem: locked.current }
          : undefined
        : n,
    );
  /**
   * Lock saving: the file changed on disk (#367). The notice offers Reload
   * and Unlock.
   */
  const lock = useCallback((o: Open, at?: string) => {
    if (locked.current) return;
    lockedAt.current = at;
    const problem = changedOnDisk(basename(o.saver.path), o.model.dirty);
    locked.current = problem;
    setLocked(true);
    setNoticeState({ problem });
  }, []);
  /** The latest controller, for the notice's buttons. */
  const controllerRef = useRef<NotebookController>(undefined);
  /** Whether the session has rejoined the file's running kernel, if any. */
  const [joined, setJoined] = useState(false);
  /** Set once the file is deleted from under the notebook: no save may put it back. */
  const gone = useRef(false);
  /** A rename in progress: the pane's teardown waits for it to move the session. */
  const renaming = useRef<{ done: Promise<void>; to: string }>(undefined);
  /** Why the edits typed during a rename weren't saved: shown when the file reopens. */
  const unsaved = useRef<string>(undefined);
  /** The cell menu (#200), open under a cell's "…" button. */
  const [menu, setMenu] = useState<{ cell: Cell; anchor: HTMLElement }>();

  // Load the file, build the notebook, and join its session.
  useEffect(() => {
    let cancelled = false;
    let current: Open | undefined;
    setJoined(false);
    setError(undefined);
    // A fresh copy of the file: nothing to lock against yet.
    locked.current = undefined;
    lockedAt.current = undefined;
    reloading.current = false;
    setLocked(false);
    setNoticeState(n => (n?.problem.kind === 'save-conflict' ? undefined : n));
    (async () => {
      // The last pane here (before a rename, say) may still be saving to
      // the file: load what it saved, and say if it couldn't.
      const handed = handedOff(path);
      const lastSave = handed && (await handed);
      if (cancelled) return;
      if (lastSave) setNotice({ kind: 'save-failed', message: lastSave, actions: [] });
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
      // The cells' language until the kernel starts and reports its own, so
      // they highlight while editing before the first run (#352).
      const intendedName = intendedRef.current.name;
      const fileLanguage = typeof wanted?.language === 'string' ? wanted.language : undefined;
      seedLanguage(
        model,
        fileLanguage ?? (intendedName ? specs?.kernelspecs[intendedName]?.language : undefined),
      );
      // Before the notebook gets its model, so saved widget outputs render
      // from the file's widget state.
      const notebookWidgets = widgets.attachWidgets(session, rendermime, model);
      notebook.model = model;

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
          setNotice(missingKernel(fileName, missing));
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
        setNotice(runFailed(session, services.kernelspecs, e)),
      );
      const editing = attachEditing(notebook, session, rendermime, commands);
      const cellControls = attachCellControls(notebook, (cell, anchor) =>
        setMenu({ cell, anchor }),
      );
      const runStatus = attachRunStatus(notebook, {
        interrupt: () =>
          void session.session?.kernel
            ?.interrupt()
            .catch(e => setNotice(failed('interrupt the kernel', e))),
      });
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
        commands,
        runStatus,
        joining,
        disposables: [
          editing,
          cellControls,
          runStatus,
          notebookWidgets,
          // `device` for cells on server kernels, in the app (ganymede-device#26).
          attachDevice(session),
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
    })().catch(e => !cancelled && setError(e ?? new Error('Unknown error')));
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
      // autosave would, then let it go. A rename in progress finishes
      // first: it needs the session, and the save goes to the new path.
      // The pane that opens the file next waits for the save, and shows
      // why it failed (#224).
      const save = () => {
        if (!done.model.dirty || locked.current || reloading.current || gone.current) {
          return undefined;
        }
        const to = done.saver.path;
        return done.saver.save({ ifDirty: true }).then(
          () => undefined,
          (e: unknown) => {
            console.error(`Couldn’t save ${to}:`, e);
            return `Couldn’t save the latest edits to ${basename(to)}: ${messageOf(e)}`;
          },
        );
      };
      const pending = renaming.current;
      const work = pending ? pending.done.then(() => save() ?? unsaved.current) : save();
      const next = pending?.to ?? done.saver.path;
      // If the pending rename fails, the save goes to the old path instead.
      const now = done.saver.path;
      if (work) {
        handOff(next, work);
        if (now !== next) handOff(now, work);
        void work.finally(teardown);
      } else {
        if (unsaved.current) handOff(next, Promise.resolve(unsaved.current));
        teardown();
      }
    };
  }, [services, path, attempt]);

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
    const { session, model, runStatus } = open;
    /** The kernel last seen dead or cut off, so each says so once. */
    let dead: unknown;
    let lost: unknown;
    const update = () => {
      const kernel = session.session?.kernel;
      const next: KernelState = !joined
        ? 'connecting'
        : !session.session
          ? 'none'
          : // A dead kernel disposes itself, which also closes its connection.
            kernel?.status === 'dead'
            ? 'dead'
            : kernel?.connectionStatus === 'connected'
              ? kernel.status
              : 'connecting';
      setStatus(next);
      if (kernel && next === 'dead') {
        if (dead !== kernel) {
          dead = kernel;
          runStatus.clear();
          setNotice(runFailed(session, services.kernelspecs, undefined));
        }
      } else if (dead) {
        dead = undefined;
        clearNotice('kernel-dead');
      }
      // The websocket gave up reconnecting (a live kernel's, not one that
      // died or was shut down or replaced).
      const cut =
        joined && !!kernel && !kernel.isDisposed && kernel.connectionStatus === 'disconnected';
      if (kernel && cut) {
        if (lost !== kernel) {
          lost = kernel;
          setNotice(connectionLost(), () => void kernel.reconnect().catch(() => {}));
        }
      } else if (lost) {
        lost = undefined;
        clearNotice('connection-lost');
      }
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
  }, [open, joined, services]);

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

  // The outline (#212), 300 ms after the cells stop changing: typing in
  // a cell changes the model on every key. Cells added, removed or moved
  // update it at once, so a heading never points at the wrong cell.
  useEffect(() => {
    if (!open) return;
    const { model } = open;
    let last = '';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      timer = undefined;
      const cells = Array.from({ length: model.cells.length }, (_, i) => {
        const cell = model.cells.get(i);
        // Only Markdown cells have headings: outputs streaming into a
        // code cell don't re-read every source.
        return {
          type: cell.type,
          source: cell.type === 'markdown' ? cell.sharedModel.getSource() : '',
        };
      });
      const next = outlineOf(cells);
      const key = JSON.stringify(next);
      if (key === last) return;
      last = key;
      setOutline(next);
    };
    const later = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(update, 300);
    };
    const now = () => {
      if (timer !== undefined) clearTimeout(timer);
      update();
    };
    update();
    model.contentChanged.connect(later);
    model.cells.changed.connect(now);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      model.contentChanged.disconnect(later);
      model.cells.changed.disconnect(now);
    };
  }, [open]);

  // Don't lose unsaved edits: save every few minutes and when the page is
  // hidden (an installed web app can be killed after that), and ask before
  // the page closes with edits that are not saved yet.
  useEffect(() => {
    if (!open) return;
    const { model, saver } = open;
    const autosave = () => {
      if (!model.dirty || locked.current || gone.current) return;
      saver.save({ ifDirty: true }).catch(e => {
        if (e instanceof SaveConflict) {
          lock(open, e.lastModified);
        } else {
          setNotice(saveFailed(basename(path), e, true), autosave);
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
    // A reload the page starts saves first: the Apple apps' web view
    // doesn't ask on beforeunload (#375).
    const unguard = guardReload(async () => {
      if (!model.dirty) return true;
      if (locked.current || gone.current) return false;
      await saver.save({ ifDirty: true });
      return !model.dirty;
    });
    const timer = setInterval(autosave, AUTOSAVE_INTERVAL_MS);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      unguard();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [open, path, lock]);

  // Notice a change on disk without waiting for a save (#367): every few
  // seconds while the page shows, and when it comes back. Another writer
  // (an agent editing through the server, say) is caught before any edit
  // here could replace its work.
  useEffect(() => {
    if (!open) return;
    const { saver } = open;
    let checking = false;
    let stopped = false;
    const check = () => {
      if (checking || locked.current || gone.current || renaming.current) return;
      if (document.visibilityState === 'hidden') return;
      checking = true;
      saver
        .changedOnDisk()
        .then(at => at && !stopped && lock(open, at))
        .catch(() => {})
        .finally(() => (checking = false));
    };
    const timer = setInterval(check, DISK_CHECK_INTERVAL_MS);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      clearInterval(timer);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [open, lock]);

  useEffect(() => {
    if (!open) return;
    const { notebook, model, session, saver } = open;
    const fileName = basename(path);
    // The toolbar and ⌘S fire these and forget them; a failure shows in the
    // pane instead of only in the console.
    // Retry runs the action again with the same arguments.
    const report = <A extends unknown[]>(what: string, action: (...args: A) => Promise<void>) => {
      const run = async (...args: A) => {
        try {
          await action(...args);
        } catch (e) {
          setNotice(failed(what, e, { retry: true }), () => void run(...args));
        }
      };
      return run;
    };
    // A run's failure: when the kernel died under it, say that instead.
    // Retry runs it again, on the cells selected then.
    const reportRun = (what: string, action: () => Promise<void>) => {
      const run = async () => {
        try {
          await action();
        } catch (e) {
          setNotice(runFailed(session, services.kernelspecs, e, what, true), () => void run());
        }
      };
      return run;
    };
    // Move the file to `to` with `rename` (the file's own rename, or its
    // folder's in the sidebar), taking the saves and the kernel along.
    const moved = async (to: string, rename: () => Promise<unknown>) => {
      const moving = (async () => {
        unsaved.current = undefined;
        // Once the session has joined the file's kernel, if any.
        await open.joining;
        // Saves (⌘S, autosave, quit) wait for the move and then go to the
        // new path, so none recreates the old file.
        await saver.move(async () => {
          const model = (await rename()) as Partial<Contents.IModel> | undefined;
          return { path: to, lastModified: model?.last_modified };
        });
        // The kernel follows the file, so reopening it there rejoins it.
        // Read now, not before the move: a run during it may have started
        // one (#224).
        const sessionToMove = session.session;
        try {
          await sessionToMove?.setPath(to);
          await sessionToMove?.setName(basename(to));
        } catch (e) {
          console.warn(`Couldn’t move the session to ${to}:`, e);
        }
        // Edits typed meanwhile go to the new file before it reopens there;
        // any typed during this save, by the teardown save as this pane
        // goes, which the reopened pane waits for. If this save fails, the
        // teardown tries again, and the reopened pane says why it failed.
        await saver.save({ ifDirty: true }).catch(e => {
          console.error(`Couldn’t save the latest edits to ${to}:`, e);
          unsaved.current = `Couldn’t save the latest edits to ${basename(to)}: ${messageOf(e)}`;
          setNotice({ kind: 'save-failed', message: unsaved.current, actions: [] });
        });
      })();
      renaming.current = { done: moving.catch(() => {}), to };
      try {
        await moving;
      } finally {
        renaming.current = undefined;
      }
    };
    const controller: NotebookController = {
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
      locked: isLocked,
      save: async () => {
        // Deleted: a save would put it back.
        if (gone.current) return false;
        // Changed on disk: say so again, with what unlocks it.
        if (locked.current) {
          locked.current = changedOnDisk(basename(saver.path), model.dirty);
          setNotice(locked.current);
          return false;
        }
        try {
          await saver.save();
        } catch (e) {
          if (e instanceof SaveConflict) {
            lock(open, e.lastModified);
            return false;
          }
          setNotice(saveFailed(fileName, e), () => void controller.save());
          return false;
        }
        clearNotice('save-conflict', 'save-failed');
        return true;
      },
      reload: () => {
        if (
          model.dirty &&
          !window.confirm(
            `Reload ${basename(saver.path)} from disk?\n\nYour unsaved edits here will be lost.`,
          )
        ) {
          return false;
        }
        // The teardown lets the edits go; the load rejoins the kernel.
        reloading.current = true;
        setOpen(undefined);
        setAttempt(a => a + 1);
        return true;
      },
      unlock: report(`unlock ${fileName}`, async () => {
        // Saves write over the version that locked it, and the checks go
        // on: a newer change locks it again.
        await saver.accept(lockedAt.current);
        locked.current = undefined;
        lockedAt.current = undefined;
        setLocked(false);
        clearNotice('save-conflict');
      }),
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
      run: reportRun('run the cell', async () => {
        if (await open.ensureKernel()) await NotebookActions.runAndAdvance(notebook, session);
      }),
      runAll: reportRun('run all cells', async () => {
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
        const kernel = session.session?.kernel;
        // A dead kernel can't restart (it disposed its connection): start
        // a new one of the same kind in its place.
        if (kernel && (kernel.status === 'dead' || kernel.isDisposed)) {
          await session.changeKernel({ name: kernel.name });
        } else {
          await kernel?.restart();
        }
        open.runStatus.clear();
      }),
      command: id => {
        const { commands } = open;
        if (!commands.hasCommand(id) || !commands.isEnabled(id)) return false;
        void commands.execute(id).catch(e => setNotice(failed(id, e)));
        return true;
      },
      rename: async (input: string, options?: { throws?: boolean }) => {
        let next: string | undefined;
        const clearRenameNotice = () => clearNotice('rename-failed');
        const renameFailed = (e: unknown) => {
          setNotice(failed(`rename ${fileName}`, e, { kind: 'rename-failed' }));
          if (options?.throws) throw e;
          return false;
        };
        try {
          next = renamedPath(path, input);
          if (!next) {
            clearRenameNotice();
            return true;
          }
          // The edits go with the file.
          if (model.dirty) await saver.save();
        } catch (e) {
          return renameFailed(e);
        }
        const to = next;
        try {
          await moved(to, () => renameFile(services.contents, path, to));
        } catch (e) {
          return renameFailed(e);
        }
        clearRenameNotice();
        onRenamedRef.current?.(path, to);
        return true;
      },
      discard: () => {
        const was = gone.current;
        gone.current = true;
        return () => {
          gone.current = was;
        };
      },
      moved,
      kernel: session.session?.kernel ?? undefined,
      outline,
      goToCell: index => {
        const cell = notebook.widgets[index];
        if (!cell) return false;
        notebook.mode = 'command';
        notebook.deselectAll();
        notebook.activeCellIndex = index;
        void notebook.scrollToCell(cell, 'start');
        notebook.activate();
        return true;
      },
      // With no kernel yet, this only picks the one the first run starts.
      changeKernel: report('change the kernel', async (name: string) => {
        if (session.session) await session.changeKernel({ name });
        // Also with a kernel running: if it is shut down, the next run
        // starts this one, as the file's metadata now says.
        setIntended({ name });
        // Only the missing-kernel notice: an autosave warning still holds.
        clearNotice('missing-kernel');
        const spec = services.kernelspecs.specs?.kernelspecs[name];
        if (spec) {
          model.setMetadata('kernelspec', {
            name,
            display_name: spec.display_name,
            language: spec.language,
          });
          // Before the first run, the cells switch to the new kernel's
          // language; a running kernel's info reply sets it otherwise.
          if (!session.session?.kernel) seedLanguage(model, spec.language, true);
        }
      }),
    };
    controllerRef.current = controller;
    onController(controller);
  }, [
    open,
    path,
    status,
    kernelName,
    intended,
    dirty,
    trusted,
    isLocked,
    lock,
    cellType,
    outline,
    backend,
    services,
    onController,
  ]);

  useEffect(() => () => onController(undefined), [onController]);

  if (error) {
    const offline = isUnreachable(error);
    // A chunk of the page didn't load: Retry would fail the same way, and
    // only a reload gets the current files (#364).
    const stale = isStaleBundle(error);
    return (
      <div className="pane-message" role="alert">
        <h2>Couldn’t open {basename(path)}</h2>
        <p>{offline ? unreachable(`open ${basename(path)}`).message : messageOf(error)}</p>
        {offline && <p>Check that it is running and the network is up.</p>}
        {stale && <p>Ganymede’s files changed since this window opened. Reload to load them.</p>}
        <p>
          <button
            type="button"
            className="pane-message-action"
            onClick={() => (stale ? void reloadPage() : setAttempt(a => a + 1))}
          >
            {stale ? 'Reload' : 'Retry'}
          </button>
        </p>
      </div>
    );
  }
  if (!open) {
    return <div className="pane-message subtle">Opening {basename(path)}…</div>;
  }
  return (
    <>
      <div className="notebook-page" ref={host} />
      <KeyboardBar notebook={open.notebook} commands={open.commands} />
      {menu && (
        <CellMenu
          notebook={open.notebook}
          cell={menu.cell}
          anchor={menu.anchor}
          run={async function run() {
            try {
              if (await open.ensureKernel()) {
                await NotebookActions.run(open.notebook, open.session);
              }
            } catch (e) {
              setNotice(
                runFailed(open.session, services.kernelspecs, e, 'run the cell', true),
                () => void run(),
              );
            }
          }}
          onClose={() => setMenu(undefined)}
        />
      )}
      {notice && (
        <ProblemNotice
          problem={notice.problem}
          specs={services.kernelspecs.specs}
          onDismiss={() => clearNotice(notice.problem.kind)}
          onPickKernel={name => void controllerRef.current?.changeKernel(name)}
          onAction={action => {
            const c = controllerRef.current;
            if (action === 'restart') void c?.restart();
            else if (action === 'save') void c?.save();
            else if (action === 'reload') c?.reload();
            else if (action === 'unlock') void c?.unlock();
            else if (notice.retry) {
              clearNotice(notice.problem.kind);
              notice.retry();
            }
          }}
        />
      )}
    </>
  );
}
