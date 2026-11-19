/**
 * Signature help, go to definition and rename across cells (#676):
 * cdp-kernel's language service answers them over the
 * `cdp-kernel.language.v1` comm (its `docs/notebooks.md`, "Signatures,
 * definitions and renames for frontends"). A request carries `request` (an
 * id the answer echoes) and `op`; every offset in either direction is in
 * code points.
 *
 * - `signature`: `{ code, cursor }` answers `{ signature }`, null when the
 *   cursor isn't inside a call or the kernel can't tell.
 * - `definition`: `{ cells, cell, cursor }` answers `{ locations }`.
 * - `rename`: `{ cells, cell, cursor, newName }` answers `{ edits }` or
 *   `{ error }`.
 *
 * `cells` is the notebook's code cells, in order, as they read now; `cell`
 * an index into it. Only code cells of a kernel that answers the comm are
 * served: any other asks nothing and shows nothing. The comm's lifecycle is
 * the one of type errors (`kernel-comm.ts`).
 */
import type { ISessionContext } from '@jupyterlab/apputils';
import type { Cell } from '@jupyterlab/cells';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import type { Notebook } from '@jupyterlab/notebook';
import type { IDisposable } from '@lumino/disposable';
import { codePointLength, codePointToOffset, offsetToCodePoint } from './code-points';
import { attachKernelComm } from './kernel-comm';

/** The comm target cdp-kernel answers these requests on. */
export const LANGUAGE_TARGET = 'cdp-kernel.language.v1';
/** How long a request waits for its answer before it counts as unanswered. */
export const LANGUAGE_TIMEOUT_MS = 10_000;

export type SignatureHelp = {
  label: string;
  documentation: string;
  parameters: { label: string; documentation: string }[];
  /** The index in `parameters` of the argument at the cursor; may be past the end. */
  activeParameter: number;
};

/** A span of one code cell, in UTF-16 units of that cell's text. */
export type Span = { cell: number; from: number; to: number };
export type CellEdit = Span & { text: string };

export type RenameAnswer =
  { kind: 'edits'; edits: CellEdit[] } | { kind: 'error'; message: string } | null;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

/** The signature the kernel answered, or null when it isn't one. */
export function toSignature(raw: unknown): SignatureHelp | null {
  if (!isObject(raw) || typeof raw.label !== 'string' || raw.label === '') return null;
  const parameters: SignatureHelp['parameters'] = [];
  if (Array.isArray(raw.parameters)) {
    for (const p of raw.parameters as unknown[]) {
      if (!isObject(p) || typeof p.label !== 'string') return null;
      parameters.push({
        label: p.label,
        documentation: typeof p.documentation === 'string' ? p.documentation : '',
      });
    }
  }
  return {
    label: raw.label,
    documentation: typeof raw.documentation === 'string' ? raw.documentation : '',
    parameters,
    activeParameter:
      typeof raw.activeParameter === 'number' && Number.isInteger(raw.activeParameter)
        ? raw.activeParameter
        : -1,
  };
}

/**
 * The signature's label in three parts, the active parameter in the
 * middle: each parameter's label is looked for in turn, after the one
 * before it, so a name that is also in the function's own name isn't
 * marked. All of it is `before` when the active parameter is past the end
 * or can't be found.
 */
export function signatureParts(sig: SignatureHelp): {
  before: string;
  active: string;
  after: string;
} {
  const whole = { before: sig.label, active: '', after: '' };
  let at = Math.max(sig.label.indexOf('('), 0);
  for (let i = 0; i < sig.parameters.length; i++) {
    const found = sig.label.indexOf(sig.parameters[i]!.label, at);
    if (found < 0) return whole;
    if (i === sig.activeParameter) {
      const end = found + sig.parameters[i]!.label.length;
      return {
        before: sig.label.slice(0, found),
        active: sig.label.slice(found, end),
        after: sig.label.slice(end),
      };
    }
    at = found + sig.parameters[i]!.label.length;
  }
  return whole;
}

/** The text of the code cell in `cells` that `loc` names, when it is one and the offsets fit. */
function span(cells: string[], cell: unknown, start: unknown, end: unknown): Span | null {
  if (!Number.isInteger(cell) || !Number.isInteger(start) || !Number.isInteger(end)) return null;
  const code = cells[cell as number];
  if (code === undefined) return null;
  const length = codePointLength(code);
  if ((start as number) < 0 || (end as number) < (start as number) || (end as number) > length) {
    return null;
  }
  return {
    cell: cell as number,
    from: codePointToOffset(code, start as number),
    to: codePointToOffset(code, end as number),
  };
}

/**
 * The definition's locations, in UTF-16 units of their cells; null when
 * the kernel can't tell (`locations` null or not a list). A location that
 * doesn't fit its cell is left out.
 */
export function toLocations(cells: string[], raw: unknown): Span[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Span[] = [];
  for (const entry of raw as unknown[]) {
    if (!isObject(entry)) continue;
    const found = span(cells, entry.cell, entry.start, entry.end);
    if (found) out.push(found);
  }
  return out;
}

/**
 * The kernel's answer to a rename: the edits in UTF-16 units, the refusal's
 * message, or null when it can't tell or the answer can't be trusted. All
 * of the edits are used or none: one that doesn't fit its cell, or
 * overlaps another, makes the whole answer null, since a part of a rename
 * would leave the notebook half renamed.
 */
export function toRenameAnswer(cells: string[], data: Record<string, unknown>): RenameAnswer {
  if (typeof data.error === 'string') return { kind: 'error', message: data.error };
  if (!Array.isArray(data.edits)) return null;
  const edits: CellEdit[] = [];
  for (const entry of data.edits as unknown[]) {
    if (!isObject(entry) || typeof entry.text !== 'string') return null;
    const found = span(cells, entry.cell, entry.start, entry.end);
    if (!found) return null;
    edits.push({ ...found, text: entry.text });
  }
  edits.sort((a, b) => a.cell - b.cell || a.from - b.from || a.to - b.to);
  for (let i = 1; i < edits.length; i++) {
    const [a, b] = [edits[i - 1]!, edits[i]!];
    if (a.cell === b.cell && b.from < a.to) return null;
  }
  return { kind: 'edits', edits };
}

/** The word (a name, `$` and `_` included) at `offset` in `code`, '' when there is none. */
export function wordAt(code: string, offset: number): string {
  const part = /[\p{ID_Continue}$‌‍]/u;
  const chars = Array.from(code);
  let i = offsetToCodePoint(code, offset);
  let start = i;
  while (start > 0 && part.test(chars[start - 1]!)) start--;
  while (i < chars.length && part.test(chars[i]!)) i++;
  const word = chars.slice(start, i).join('');
  return /^\p{ID_Start}|^[$_]/u.test(word) ? word : '';
}

/**
 * Apply `edits` to the cells of `notebook`, one change per cell, so an
 * undo in a cell takes back that cell's part of the rename. `cells` are
 * the code cells the edits' indexes name. Through the cell's editor when it
 * has one (its undo history), through the model otherwise.
 */
export function applyEdits(cells: Cell[], edits: CellEdit[]): void {
  const byCell = new Map<number, CellEdit[]>();
  for (const edit of edits) byCell.set(edit.cell, [...(byCell.get(edit.cell) ?? []), edit]);
  for (const [index, list] of byCell) {
    const cell = cells[index];
    if (!cell || cell.isDisposed) continue;
    const view = (cell.editor as CodeMirrorEditor | null | undefined)?.editor;
    if (view) {
      // Positions of the text before any of the edits, as one change.
      view.dispatch({
        changes: list.map(e => ({ from: e.from, to: e.to, insert: e.text })),
        userEvent: 'input.rename',
      });
    } else {
      const shared = cell.model.sharedModel;
      shared.transact(() => {
        for (const e of [...list].reverse()) shared.updateSource(e.from, e.to, e.text);
      });
    }
  }
}

/** What the notebook's UI gives the service: asking for a name, and saying why it can't. */
export type LanguageHooks = {
  /** The new name for the symbol at the cursor of `cell`, or null when it was cancelled. */
  askName(cell: Cell, current: string): Promise<string | null>;
  /** A message for the person: a refusal, or that the answer can't be used. */
  notify(message: string): void;
};

export interface LanguageService extends IDisposable {
  /** A kernel answers the comm now. */
  readonly available: boolean;
  /** The signature of the call the cursor of `cell` is in, null for none or no answer. */
  signature(cell: Cell, cursor: number): Promise<SignatureHelp | null>;
  /**
   * Jump to the definition of the name at the cursor of `cell` (the active
   * cell by default); false when nothing happened: no answer, or a
   * definition outside the notebook.
   */
  goToDefinition(cell?: Cell): Promise<boolean>;
  /**
   * Rename the name at the cursor of `cell` (the active cell by default),
   * asking for the new name unless `newName` is given; false when nothing
   * changed.
   */
  rename(newName?: string, cell?: Cell): Promise<boolean>;
}

/** Whether `cell` is one the service serves. */
const servable = (cell: Cell | null | undefined): cell is Cell =>
  !!cell && !cell.isDisposed && cell.model.type === 'code';

export function createLanguageService(
  notebook: Notebook,
  session: ISessionContext,
  hooks: LanguageHooks,
  timeout = LANGUAGE_TIMEOUT_MS,
): LanguageService {
  let nextRequest = 0;
  const pending = new Map<
    number,
    {
      resolve: (data: Record<string, unknown> | null) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let disposed = false;

  const settleAll = () => {
    for (const { resolve, timer } of pending.values()) {
      clearTimeout(timer);
      resolve(null);
    }
    pending.clear();
  };

  const link = attachKernelComm(session, {
    target: LANGUAGE_TARGET,
    onMessage: data => {
      if (!isObject(data) || typeof data.request !== 'number') return;
      const wait = pending.get(data.request);
      if (!wait) return;
      pending.delete(data.request);
      clearTimeout(wait.timer);
      wait.resolve(data);
    },
    // A request that waits on a comm that went is never answered.
    onClosed: settleAll,
  });

  /** The kernel's answer to `op`; null when it can't be asked or didn't answer. */
  const ask = (op: string, payload: Record<string, unknown>) =>
    new Promise<Record<string, unknown> | null>(resolve => {
      const request = ++nextRequest;
      const timer = setTimeout(() => {
        pending.delete(request);
        resolve(null);
      }, timeout);
      pending.set(request, { resolve, timer });
      if (!link.send({ request, op, ...payload })) {
        pending.delete(request);
        clearTimeout(timer);
        resolve(null);
      }
    });

  /** The code cells, in order. */
  const codeCells = () => notebook.widgets.filter(w => w.model.type === 'code');
  const source = (cell: Cell) => cell.model.sharedModel.getSource();
  const viewOf = (cell: Cell) => (cell.editor as CodeMirrorEditor | null | undefined)?.editor;
  /** The notebook's code cells are still `cells`, in order, with `texts` as their text. */
  const sameSources = (cells: Cell[], texts: string[]) => {
    const current = codeCells();
    return (
      current.length === cells.length &&
      current.every((c, i) => c === cells[i] && !c.isDisposed && source(c) === texts[i])
    );
  };

  /** What a definition or rename request sends, and what the answer is read against. */
  const snapshot = (cell: Cell | undefined) => {
    const target = cell ?? notebook.activeCell;
    const view = target && viewOf(target);
    if (!link.isOpen || !servable(target) || !view) return null;
    const cells = codeCells();
    const index = cells.indexOf(target);
    if (index < 0) return null;
    const texts = cells.map(source);
    const head = view.state.selection.main.head;
    return {
      target,
      view,
      cells,
      texts,
      index,
      head,
      cursor: offsetToCodePoint(texts[index]!, head),
    };
  };

  const service: LanguageService = {
    get available() {
      return link.isOpen;
    },
    get isDisposed() {
      return disposed;
    },

    async signature(cell, cursor) {
      if (!link.isOpen || !servable(cell)) return null;
      const code = source(cell);
      const data = await ask('signature', { code, cursor: offsetToCodePoint(code, cursor) });
      return data ? toSignature(data.signature) : null;
    },

    async goToDefinition(cell) {
      const snap = snapshot(cell);
      if (!snap) return false;
      const data = await ask('definition', {
        cells: snap.texts,
        cell: snap.index,
        cursor: snap.cursor,
      });
      if (!data || disposed) return false;
      // The text moved on: the offsets are for what was sent.
      if (!sameSources(snap.cells, snap.texts)) return false;
      const found = toLocations(snap.texts, data.locations)?.[0];
      const target = found && snap.cells[found.cell];
      const view = target && viewOf(target);
      if (!found || !target || !view) return false;
      notebook.mode = 'command';
      notebook.deselectAll();
      notebook.activeCellIndex = notebook.widgets.indexOf(target);
      void notebook.scrollToCell(target, 'center');
      notebook.mode = 'edit';
      view.dispatch({
        selection: { anchor: found.from, head: found.to },
        scrollIntoView: true,
        userEvent: 'select.definition',
      });
      view.focus();
      return true;
    },

    async rename(newName, cell) {
      const snap = snapshot(cell);
      if (!snap) return false;
      const current = wordAt(snap.texts[snap.index]!, snap.head);
      let name = newName;
      if (name === undefined) {
        const asked = await hooks.askName(snap.target, current);
        if (asked === null) return false;
        name = asked;
      }
      name = name.trim();
      if (!name || name === current) return false;
      // The text may have changed while the name was typed: ask for what is there now.
      const now = snapshot(snap.target);
      if (!now || now.head !== snap.head) return false;
      const data = await ask('rename', {
        cells: now.texts,
        cell: now.index,
        cursor: now.cursor,
        newName: name,
      });
      if (!data || disposed) return false;
      const answer = toRenameAnswer(now.texts, data);
      if (!answer) {
        hooks.notify('Rename isn’t available yet: the language service can’t tell.');
        return false;
      }
      if (answer.kind === 'error') {
        hooks.notify(`Can’t rename: ${answer.message}`);
        return false;
      }
      if (!sameSources(now.cells, now.texts)) {
        hooks.notify('The notebook changed while renaming, so nothing was renamed.');
        return false;
      }
      if (!answer.edits.length) return false;
      applyEdits(now.cells, answer.edits);
      return true;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      link.dispose();
      settleAll();
    },
  };
  return service;
}
