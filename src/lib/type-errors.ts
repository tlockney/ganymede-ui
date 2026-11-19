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
import type { Notebook } from '@jupyterlab/notebook';
import { DisposableDelegate, type IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';
import { codePointToOffset } from './code-points';
import { attachKernelComm } from './kernel-comm';

export { codePointToOffset };

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
  /** Each cell's latest request and the text it checked, by the cell model's id. */
  const latest = new Map<string, { request: number; code: string }>();
  let nextRequest = 0;
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

  const link = attachKernelComm(session, {
    target: TYPE_ERRORS_TARGET,
    enabled: typeErrorsEnabled,
    onMessage: data => receive(data as Answer),
    onOpened: checkActive,
    // The comm went: what waits on it, and the marks, go too.
    onClosed: () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      latest.clear();
      clearMarks();
    },
  });

  const check = (id: string) => {
    timers.delete(id);
    const cell = cellOf(id);
    if (!link.isOpen || !cell || cell.model.type !== 'code') return;
    const code = cell.model.sharedModel.getSource();
    const request = ++nextRequest;
    latest.set(id, { request, code });
    // A send that fails drops the comm, which clears what waited on it.
    link.send({ request, code });
  };

  function schedule(id: string) {
    if (!link.isOpen) return;
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => check(id), delay),
    );
  }

  const onSwitch = () => link.refresh();

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
  changed.connect(onSwitch);
  syncCells();

  return new DisposableDelegate(() => {
    disposed = true;
    link.dispose();
    for (const unwatch of watched.values()) unwatch();
    watched.clear();
    changed.disconnect(onSwitch);
    if (!notebook.isDisposed) notebook.model?.cells.changed.disconnect(syncCells);
  });
}
