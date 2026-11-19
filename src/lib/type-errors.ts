/**
 * Type errors as you type (#669): cdp-kernel's language service checks the
 * cell being edited against the cells that ran and answers over the
 * `cdp-kernel.diagnostics.v1` comm (its `docs/notebooks.md`, "Type errors
 * for frontends"). Each answer becomes CodeMirror lint marks on that cell,
 * with the message and `TS<code>` on hover.
 *
 * Only code cells of a TypeScript or JavaScript kernel are checked. A
 * kernel that doesn't answer the comm closes it, and nothing is shown for
 * that kernel: the in-app kernel, other languages, and a cdp-kernel started
 * with `--no-language-service`. A restart closes the comm without telling
 * us; it opens again once the kernel is back. The switch ("Show or Hide
 * Type Errors") is the app's, kept in local storage and on by default.
 */
import { setDiagnostics, type Diagnostic } from '@codemirror/lint';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { Cell } from '@jupyterlab/cells';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { Text } from '@jupyterlab/coreutils';
import type { Notebook } from '@jupyterlab/notebook';
import type { Kernel } from '@jupyterlab/services';
import { DisposableDelegate, type IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';

/** The comm target cdp-kernel answers checks on. */
export const TYPE_ERRORS_TARGET = 'cdp-kernel.diagnostics.v1';
/** How long an edit pauses before the cell is sent for a check. */
export const TYPE_ERRORS_DELAY_MS = 400;

const KEY = 'ganymede-ui:type-errors';
/** The switch for this page when local storage can't hold it. */
let fallback: boolean | undefined;
const changed = new Signal<object, boolean>({});
// Another window (each Mac window is its own web view) changed the switch.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === KEY || e.key === null) changed.emit(typeErrorsEnabled());
  });
}

/** Whether type errors show; on unless the person turned them off. */
export function typeErrorsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return fallback ?? true;
  }
}

/** Turn type errors on or off, for every open notebook, and remember it. */
export function setTypeErrorsEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, 'off');
    fallback = undefined;
  } catch {
    // Private mode: for this page only.
    fallback = on;
  }
  changed.emit(on);
}

/** For tests: forget a switch kept only in this page. */
export function resetTypeErrorsForTests(): void {
  fallback = undefined;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}

/**
 * A code point offset into `code` as a string offset: the kernel counts
 * code points, as `cursor_pos` does, and CodeMirror counts UTF-16 units, so
 * every character outside the Basic Multilingual Plane (emoji, `𝐚`) is two
 * units. Clamped to the text.
 */
export function codePointToOffset(code: string, offset: number): number {
  if (offset <= 0) return 0;
  return Math.min(Text.charIndexToJsIndex(offset, code), code.length);
}

/**
 * The kernel's diagnostics as lint marks on `code`. Entries that aren't
 * well formed are left out. An empty range is widened to the character at
 * it (or before it, at the end), so it shows.
 */
export function toDiagnostics(code: string, raw: unknown): Diagnostic[] {
  if (!Array.isArray(raw)) return [];
  const out: Diagnostic[] = [];
  for (const entry of raw as unknown[]) {
    if (!entry || typeof entry !== 'object') continue;
    const d = entry as Record<string, unknown>;
    if (!Number.isInteger(d.start) || !Number.isInteger(d.end) || typeof d.message !== 'string') {
      continue;
    }
    let from = codePointToOffset(code, d.start as number);
    let to = Math.max(from, codePointToOffset(code, d.end as number));
    if (from === to) {
      if (to < code.length) {
        // The whole character: a surrogate pair is one.
        to += code.codePointAt(to)! > 0xffff ? 2 : 1;
      } else if (from > 0) {
        from -= code.codePointAt(from - 2)! > 0xffff ? 2 : 1;
      } else {
        continue;
      }
    }
    out.push({
      from,
      to,
      severity: d.severity === 'warning' ? 'warning' : d.severity === 'error' ? 'error' : 'info',
      message: d.message,
      ...(typeof d.code === 'number' ? { source: `TS${d.code}` } : {}),
    });
  }
  return out;
}

/** The kernel languages the language service checks. */
const LANGUAGES = /^(typescript|javascript)$/i;

/** Statuses of a kernel that has started and can answer. */
const READY = new Set<string>(['idle', 'busy']);

/** Statuses in which the kernel's comms are gone: a restart disposes them without closing. */
const RESET = new Set<string>(['restarting', 'autorestarting', 'dead']);

/** What the kernel answers: `diagnostics` is null when it can't tell. */
interface Answer {
  request?: unknown;
  diagnostics?: unknown;
}

/**
 * Check the code cells of `notebook` as they are edited, while its kernel
 * answers the diagnostics comm and the switch is on.
 */
export function attachTypeErrors(
  notebook: Notebook,
  session: ISessionContext,
  delay = TYPE_ERRORS_DELAY_MS,
): IDisposable {
  let kernel: Kernel.IKernelConnection | null = null;
  let comm: Kernel.IComm | null = null;
  /** The kernel has answered on the current comm: a later close is not a refusal. */
  let answered = false;
  /** The kernel closed the comm, or isn't a TypeScript one: nothing more for it. */
  let closed = false;
  /** Bumped whenever the comm is dropped, so an open still waiting for the kernel gives up. */
  let epoch = 0;
  let opening = -1;
  let nextRequest = 0;
  /** Each cell's latest request and the text it checked, by the cell model's id. */
  const latest = new Map<string, { request: number; code: string }>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Cells whose editor has marks of ours. */
  const marked = new Set<string>();
  const watched = new Map<string, () => void>();
  let disposed = false;

  const cellOf = (id: string): Cell | undefined =>
    notebook.isDisposed ? undefined : notebook.widgets.find(w => w.model.id === id);

  const mark = (id: string, diagnostics: Diagnostic[]) => {
    const cell = cellOf(id);
    const view = (cell?.editor as CodeMirrorEditor | null | undefined)?.editor;
    if (!cell || cell.isDisposed || !view) return;
    view.dispatch(setDiagnostics(view.state, diagnostics));
    if (diagnostics.length) marked.add(id);
    else marked.delete(id);
  };

  const clearMarks = () => {
    for (const id of [...marked]) mark(id, []);
    marked.clear();
  };

  const forgetRequests = () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    latest.clear();
  };

  /** Drop the comm and what hangs on it; marks go too. */
  const stop = () => {
    epoch++;
    answered = false;
    forgetRequests();
    const old = comm;
    comm = null;
    if (old) {
      // A close we make ourselves isn't the kernel refusing.
      old.onClose = () => {};
      old.onMsg = () => {};
      try {
        if (!old.isDisposed) old.close();
      } catch {
        // The kernel is gone already.
      }
    }
    clearMarks();
  };

  const check = (id: string) => {
    timers.delete(id);
    const cell = cellOf(id);
    if (!comm || !cell || cell.model.type !== 'code') return;
    const code = cell.model.sharedModel.getSource();
    const request = ++nextRequest;
    latest.set(id, { request, code });
    try {
      comm.send({ request, code });
    } catch {
      // The kernel's connection went; its status change reopens the comm.
      stop();
    }
  };

  const schedule = (id: string) => {
    if (!comm) return;
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => check(id), delay),
    );
  };

  const receive = (data: Answer) => {
    for (const [id, entry] of latest) {
      if (entry.request !== data.request) continue;
      latest.delete(id);
      // The cell changed since the request: its next check follows.
      if (cellOf(id)?.model.sharedModel.getSource() !== entry.code) return;
      // The kernel can't tell: the marks stay as they are.
      if (data.diagnostics === null || !Array.isArray(data.diagnostics)) return;
      mark(id, toDiagnostics(entry.code, data.diagnostics));
      return;
    }
    // Not the latest request for any cell: stale.
  };

  const checkActive = () => {
    const cell = notebook.activeCell;
    if (cell?.model.type === 'code') schedule(cell.model.id);
  };

  const open = async () => {
    const k = kernel;
    if (!k || comm || closed || disposed || !typeErrorsEnabled() || !READY.has(k.status)) return;
    if (opening === epoch) return;
    opening = epoch;
    const mine = epoch;
    let language: string | undefined;
    try {
      language = (await k.info).language_info?.name;
    } catch {
      opening = -1;
      return;
    }
    opening = -1;
    if (mine !== epoch || kernel !== k || disposed) return;
    if (!LANGUAGES.test(language ?? '')) {
      closed = true;
      return;
    }
    let c: Kernel.IComm;
    try {
      c = k.createComm(TYPE_ERRORS_TARGET);
      c.onMsg = msg => {
        answered = true;
        receive(msg.content.data as Answer);
      };
      c.onClose = () => {
        if (comm !== c) return;
        // A comm that never answered is a refusal: for this kernel, that's
        // all. One that did was closed under us, as when the runtime exits
        // ("restarting on next cell"): the next idle opens it again.
        const refused = !answered;
        stop();
        if (refused) closed = true;
      };
      comm = c;
    } catch {
      stop();
      return;
    }
    // The comm's per-target subshell starts as it is made. Until it has, a
    // message goes on the main shell, behind a running cell, and a check
    // sent on the subshell before the kernel handled the open is dropped.
    // `subshellStarted` is CommHandler's public getter; a kernel without
    // subshells never settles it, so wait only when it has them.
    const started = (c as { subshellStarted?: Promise<void> }).subshellStarted;
    if (k.supportsSubshells && started) {
      try {
        await started;
      } catch {
        // No subshell: the open goes on the main shell.
      }
      if (comm !== c || mine !== epoch) return;
    }
    try {
      c.open({});
    } catch {
      stop();
      return;
    }
    checkActive();
  };

  const onStatus = (k: Kernel.IKernelConnection, status: Kernel.Status) => {
    if (k !== kernel) return;
    if (RESET.has(status)) {
      stop();
      closed = false;
    } else {
      void open();
    }
  };
  const onDisposed = (k: Kernel.IKernelConnection) => {
    if (k !== kernel) return;
    stop();
    kernel = null;
  };

  const setKernel = () => {
    const next = session.session?.kernel ?? null;
    if (next === kernel) return;
    stop();
    kernel?.statusChanged.disconnect(onStatus);
    kernel?.disposed.disconnect(onDisposed);
    kernel = next;
    closed = false;
    kernel?.statusChanged.connect(onStatus);
    kernel?.disposed.connect(onDisposed);
    void open();
  };

  const onSwitch = (_: unknown, on: boolean) => {
    if (on) void open();
    else stop();
  };

  // Edits: one watcher per code cell of the model.
  const syncCells = () => {
    const cells = notebook.model?.cells;
    if (!cells || disposed) return;
    const present = new Set<string>();
    for (const model of cells) {
      if (model.type !== 'code') continue;
      const id = model.id;
      present.add(id);
      if (watched.has(id)) continue;
      const onChange = (_: unknown, change: { sourceChange?: unknown }) => {
        if (change.sourceChange) schedule(id);
      };
      model.sharedModel.changed.connect(onChange);
      watched.set(id, () => model.sharedModel.changed.disconnect(onChange));
    }
    // A cell that went, or is no longer code: its marks go with it.
    for (const [id, unwatch] of watched) {
      if (present.has(id)) continue;
      unwatch();
      watched.delete(id);
      clearTimeout(timers.get(id));
      timers.delete(id);
      latest.delete(id);
      if (marked.has(id)) mark(id, []);
    }
    for (const id of [...marked]) if (!present.has(id)) mark(id, []);
  };

  notebook.model?.cells.changed.connect(syncCells);
  session.kernelChanged.connect(setKernel);
  session.sessionChanged.connect(setKernel);
  changed.connect(onSwitch);
  syncCells();
  setKernel();

  return new DisposableDelegate(() => {
    disposed = true;
    stop();
    for (const unwatch of watched.values()) unwatch();
    watched.clear();
    kernel?.statusChanged.disconnect(onStatus);
    kernel?.disposed.disconnect(onDisposed);
    kernel = null;
    changed.disconnect(onSwitch);
    session.kernelChanged.disconnect(setKernel);
    session.sessionChanged.disconnect(setKernel);
    if (!notebook.isDisposed) notebook.model?.cells.changed.disconnect(syncCells);
  });
}
