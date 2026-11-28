import { URLExt } from '@jupyterlab/coreutils';
import type * as nbformat from '@jupyterlab/nbformat';
import { ServerConnection, type Contents } from '@jupyterlab/services';
import type { YNotebook } from '@jupyter/ydoc';
import { hasDotSegment } from './launch';

/**
 * Room saving and server-side recovery copies (ganymede PR #960, #831).
 *
 * Older or remote servers may not expose `/api/collaboration/recovery` or the
 * room `state` keys (`save`, `save_error`, `recovery`), so HTTP callers return
 * `'unsupported'` on 404 and state readers tolerate absent keys.
 */

export type RecoveryReason =
  'save_failed' | 'file_gone' | 'read_only' | 'merge_conflict' | (string & {});

export type RoomRecoverySummary = {
  id: string;
  at: string;
  reason: RecoveryReason;
  cells: string[];
};

export type RoomSaveState = {
  save?: 'saved' | 'failed';
  saveError?: string;
  recovery?: RoomRecoverySummary;
};

export type RecoveryCopyMeta = {
  id: string;
  path: string;
  at: string;
  reason: RecoveryReason;
  detail?: string;
  cells: string[];
  notebook?: string;
};

export type RecoveryCopy = RecoveryCopyMeta & {
  content: nbformat.INotebookContent;
};

export type RecoveryListResult =
  | { kind: 'copies'; copies: RecoveryCopyMeta[] }
  | { kind: 'unsupported' }
  | { kind: 'error'; message: string };

export type RecoveryGetResult =
  { kind: 'copy'; copy: RecoveryCopy } | { kind: 'not-found' } | { kind: 'error'; message: string };

export type RecoveryDeleteResult =
  { kind: 'deleted' } | { kind: 'not-found' } | { kind: 'error'; message: string };

export type RecoveryResolveResult =
  | { kind: 'copy'; copy: RecoveryCopy }
  | { kind: 'gone'; list: RecoveryListResult }
  | { kind: 'error'; message: string };

export type RecoveryRestoreResult =
  | { kind: 'restored'; discarded: boolean; discardError?: string }
  | { kind: 'error'; message: string };

export type SaveAttentionDescription = {
  headline: string;
  detail?: string;
  summary?: RoomRecoverySummary;
  copiesCount: number;
};

export type RecoveryCellDiffStatus = 'changed' | 'added' | 'removed' | 'unchanged';

export type RecoveryCellDiff = {
  key: string;
  cellId?: string;
  copyIndex?: number;
  currentIndex?: number;
  cellType: string;
  currentCellType?: string;
  status: RecoveryCellDiffStatus;
  conflict: boolean;
  reordered: boolean;
  copySource: string;
  currentSource?: string;
  copyOutputs?: string;
  currentOutputs?: string;
  sourceChanged: boolean;
  outputsChanged: boolean;
};

export type RecoveryNotebookDiff = {
  cells: RecoveryCellDiff[];
  changedCount: number;
  addedCount: number;
  removedCount: number;
  unchangedCount: number;
  reorderedCount: number;
  conflictCells: string[];
  metadataChanged: boolean;
};

export type DiffLine = {
  kind: 'context' | 'removed' | 'added';
  text: string;
};

type ObservableNotebook = Pick<YNotebook, 'getState' | 'changed'> & {
  isDisposed?: boolean;
};

const SAVE_STATE_KEYS = new Set(['save', 'save_error', 'recovery']);

function unwrapValue(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'toJSON' in raw) {
    const fn = (raw as { toJSON?: unknown }).toJSON;
    if (typeof fn === 'function') {
      return (raw as { toJSON: () => unknown }).toJSON();
    }
  }
  return raw;
}

function stringList(raw: unknown): string[] {
  const value = unwrapValue(raw);
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/** Parse the room `ystate` `'recovery'` summary object. */
export function parseRoomRecoverySummary(raw: unknown): RoomRecoverySummary | undefined {
  const value = unwrapValue(raw);
  if (!value || typeof value !== 'object') return undefined;
  const r = value as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return undefined;
  if (typeof r.reason !== 'string' || !r.reason) return undefined;
  return {
    id: r.id,
    at: typeof r.at === 'string' ? r.at : '',
    reason: r.reason,
    cells: stringList(r.cells),
  };
}

/** Read save/recovery status from a room's `YNotebook` shared state. */
export function readRoomSaveState(
  notebook: Pick<YNotebook, 'getState'> | undefined,
): RoomSaveState {
  if (!notebook || typeof notebook.getState !== 'function') return {};
  const rawSave = notebook.getState('save');
  const save = rawSave === 'saved' || rawSave === 'failed' ? rawSave : undefined;
  const rawError = notebook.getState('save_error');
  const saveError = typeof rawError === 'string' && rawError.length > 0 ? rawError : undefined;
  const recovery = parseRoomRecoverySummary(notebook.getState('recovery'));
  return {
    ...(save ? { save } : {}),
    ...(saveError ? { saveError } : {}),
    ...(recovery ? { recovery } : {}),
  };
}

/**
 * Watch a room's `YNotebook` shared state for `save`, `save_error`, and
 * `recovery` changes, invoking `onChange` immediately with the current state.
 */
export function watchRoomSaveState(
  notebook: ObservableNotebook | undefined,
  onChange: (state: RoomSaveState) => void,
): () => void {
  if (!notebook || notebook.isDisposed) {
    onChange({});
    return () => {};
  }
  onChange(readRoomSaveState(notebook));
  const changed = notebook.changed;
  if (!changed || typeof changed.connect !== 'function') {
    return () => {};
  }
  const onChanged = (
    _: unknown,
    change: { stateChange?: Array<{ name: string; oldValue?: unknown; newValue?: unknown }> },
  ) => {
    if (notebook.isDisposed) return;
    if (!change.stateChange?.some(c => SAVE_STATE_KEYS.has(c.name))) return;
    onChange(readRoomSaveState(notebook));
  };
  changed.connect(onChanged);
  return () => {
    changed.disconnect(onChanged);
  };
}

function recoveryBaseUrl(settings: ServerConnection.ISettings): string {
  return URLExt.join(settings.baseUrl, 'api/collaboration/recovery');
}

function recoveryCopyUrl(settings: ServerConnection.ISettings, id: string): string {
  return URLExt.join(recoveryBaseUrl(settings), encodeURIComponent(id));
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown } | null;
    if (body && typeof body.message === 'string' && body.message) {
      return body.message;
    }
  } catch {
    // Non-JSON error body: fall back to status text.
  }
  return `The server answered ${res.status}.`;
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Parse metadata for a recovery copy; returns undefined for invalid entries. */
export function parseRecoveryCopyMeta(raw: unknown): RecoveryCopyMeta | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !r.id) return undefined;
  if (typeof r.path !== 'string' || !r.path) return undefined;
  if (hasDotSegment(r.path) || r.path.includes('\\')) return undefined;
  if (typeof r.reason !== 'string' || !r.reason) return undefined;
  return {
    id: r.id,
    path: r.path,
    at: typeof r.at === 'string' ? r.at : '',
    reason: r.reason,
    ...(typeof r.detail === 'string' && r.detail ? { detail: r.detail } : {}),
    cells: stringList(r.cells),
    ...(typeof r.notebook === 'string' && r.notebook ? { notebook: r.notebook } : {}),
  };
}

function isNotebookContent(raw: unknown): raw is nbformat.INotebookContent {
  if (!raw || typeof raw !== 'object') return false;
  const n = raw as { cells?: unknown };
  return Array.isArray(n.cells);
}

/**
 * List recovery copies for `path` (`GET /api/collaboration/recovery?path=...`).
 * Returns `{ kind: 'unsupported' }` on 404 (older servers or disabled recovery).
 */
export async function listRecoveryCopies(
  settings: ServerConnection.ISettings,
  path: string,
): Promise<RecoveryListResult> {
  const url = `${recoveryBaseUrl(settings)}?${new URLSearchParams({ path })}`;
  try {
    const res = await ServerConnection.makeRequest(url, { method: 'GET' }, settings);
    if (res.status === 404) return { kind: 'unsupported' };
    if (!res.ok) return { kind: 'error', message: await readErrorMessage(res) };
    const body = (await res.json().catch(() => null)) as { copies?: unknown } | null;
    const rawCopies = Array.isArray(body?.copies) ? body.copies : [];
    const copies: RecoveryCopyMeta[] = [];
    for (const item of rawCopies) {
      const parsed = parseRecoveryCopyMeta(item);
      if (parsed) copies.push(parsed);
    }
    return { kind: 'copies', copies };
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) };
  }
}

/**
 * Fetch one recovery copy including its notebook JSON (`GET /api/collaboration/recovery/<id>`).
 * Returns `{ kind: 'not-found' }` when the server answers 404.
 */
export async function getRecoveryCopy(
  settings: ServerConnection.ISettings,
  id: string,
): Promise<RecoveryGetResult> {
  if (!id) return { kind: 'not-found' };
  const url = recoveryCopyUrl(settings, id);
  try {
    const res = await ServerConnection.makeRequest(url, { method: 'GET' }, settings);
    if (res.status === 404) return { kind: 'not-found' };
    if (!res.ok) return { kind: 'error', message: await readErrorMessage(res) };
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    const meta = parseRecoveryCopyMeta(body);
    if (!meta || !body || !isNotebookContent(body.content)) {
      return { kind: 'error', message: 'The recovery copy is not a valid notebook.' };
    }
    return {
      kind: 'copy',
      copy: {
        ...meta,
        content: body.content,
      },
    };
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) };
  }
}

/**
 * Discard a recovery copy (`DELETE /api/collaboration/recovery/<id>`).
 */
export async function discardRecoveryCopy(
  settings: ServerConnection.ISettings,
  id: string,
): Promise<RecoveryDeleteResult> {
  if (!id) return { kind: 'not-found' };
  const url = recoveryCopyUrl(settings, id);
  try {
    const res = await ServerConnection.makeRequest(url, { method: 'DELETE' }, settings);
    if (res.status === 404) return { kind: 'not-found' };
    if (res.status === 204 || res.ok) return { kind: 'deleted' };
    return { kind: 'error', message: await readErrorMessage(res) };
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) };
  }
}

/**
 * Fetch a recovery copy by id, and if it returns 404 re-read the copy list for
 * `path` (another server sharing the data dir may have discarded or pruned it).
 */
export async function fetchRecoveryCopyOrRefresh(
  settings: ServerConnection.ISettings,
  path: string,
  id: string,
): Promise<RecoveryResolveResult> {
  const fetched = await getRecoveryCopy(settings, id);
  if (fetched.kind === 'copy') return fetched;
  if (fetched.kind === 'error') return fetched;
  const list = await listRecoveryCopies(settings, path);
  return { kind: 'gone', list };
}

/**
 * Restore a recovery copy by writing its notebook over `path` through the
 * contents API first, then discarding the copy. Never discards if saving fails.
 */
export async function restoreRecoveryCopy(options: {
  settings: ServerConnection.ISettings;
  contents: Pick<Contents.IManager, 'save'>;
  path: string;
  copy: RecoveryCopy;
}): Promise<RecoveryRestoreResult> {
  const { settings, contents, path, copy } = options;
  try {
    await contents.save(path, {
      type: 'notebook',
      format: 'json',
      content: copy.content,
    });
  } catch (e) {
    return { kind: 'error', message: errorMessage(e) };
  }
  const discarded = await discardRecoveryCopy(settings, copy.id);
  if (discarded.kind === 'error') {
    return { kind: 'restored', discarded: false, discardError: discarded.message };
  }
  return { kind: 'restored', discarded: true };
}

/** Plain-language label for a recovery copy reason. */
export function recoveryReasonLabel(reason: RecoveryReason): string {
  switch (reason) {
    case 'save_failed':
      return 'Save failed on the server';
    case 'file_gone':
      return 'File deleted or moved';
    case 'read_only':
      return 'File is read-only';
    case 'merge_conflict':
      return 'Merge conflict';
    default:
      return reason;
  }
}

/** Format an RFC 3339 recovery timestamp for display. */
export function formatRecoveryTimestamp(at: string): string {
  if (!at) return 'Unknown time';
  const parsed = Date.parse(at);
  if (Number.isNaN(parsed)) return at;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(parsed));
}

function formatConflictCellsSummary(cells: readonly string[]): string {
  if (cells.length === 0) return '';
  if (cells.length <= 3) {
    return cells.length === 1 ? `cell ${cells[0]}` : `cells ${cells.join(', ')}`;
  }
  return `cells ${cells.slice(0, 3).join(', ')} (+${cells.length - 3} more)`;
}

/**
 * Build the summary for the "Save needs attention" banner/status indicator, or
 * undefined when the room has neither failed saves nor a recovery copy.
 */
export function describeSaveAttention({
  saveState,
  copies,
}: {
  saveState?: RoomSaveState;
  copies?: readonly RecoveryCopyMeta[];
}): SaveAttentionDescription | undefined {
  const failed = saveState?.save === 'failed';
  const summary: RoomRecoverySummary | undefined =
    saveState?.recovery ??
    (copies && copies.length > 0
      ? {
          id: copies[0].id,
          at: copies[0].at,
          reason: copies[0].reason,
          cells: copies[0].cells,
        }
      : undefined);
  const copiesCount = copies?.length ?? (summary ? 1 : 0);
  if (!failed && !summary && copiesCount === 0) return undefined;

  let detail: string | undefined;
  if (failed && saveState?.saveError) {
    if (summary?.reason === 'merge_conflict' && summary.cells.length > 0) {
      detail = `${saveState.saveError} · Merge conflict (${formatConflictCellsSummary(summary.cells)})`;
    } else {
      detail = saveState.saveError;
    }
  } else if (summary) {
    const label = recoveryReasonLabel(summary.reason);
    if (summary.reason === 'merge_conflict' && summary.cells.length > 0) {
      detail = `${label}: ${formatConflictCellsSummary(summary.cells)}`;
    } else {
      const matched = copies?.find(c => c.id === summary.id);
      detail =
        matched?.detail && summary.reason !== 'merge_conflict'
          ? `${label}: ${matched.detail}`
          : label;
    }
  } else if (failed) {
    detail = 'The server could not save the notebook.';
  }

  return {
    headline: 'Save needs attention',
    ...(detail ? { detail } : {}),
    ...(summary ? { summary } : {}),
    copiesCount,
  };
}

function cellSourceText(source: unknown): string {
  if (typeof source === 'string') return source;
  if (Array.isArray(source)) {
    return source.filter((part): part is string => typeof part === 'string').join('');
  }
  return '';
}

function cellOutputsFingerprint(cell: nbformat.ICell): string {
  if (cell.cell_type !== 'code') return '';
  const outputs = (cell as nbformat.ICodeCell).outputs;
  if (!Array.isArray(outputs) || outputs.length === 0) return '';
  return JSON.stringify(outputs);
}

function cellOutputsSummary(cell: nbformat.ICell): string | undefined {
  if (cell.cell_type !== 'code') return undefined;
  const outputs = (cell as nbformat.ICodeCell).outputs;
  if (!Array.isArray(outputs) || outputs.length === 0) return undefined;
  return outputs.length === 1 ? '1 output' : `${outputs.length} outputs`;
}

/**
 * Diff a recovery copy against the currently open notebook, matching cells by
 * id (with positional fallback when neither side has cell ids) and marking any
 * conflicting cell ids reported by the server.
 */
export function diffRecoveryNotebook(
  copyContent: nbformat.INotebookContent,
  currentContent: nbformat.INotebookContent | undefined,
  conflictCellIds: readonly string[] = [],
): RecoveryNotebookDiff {
  const copyCells = Array.isArray(copyContent.cells) ? copyContent.cells : [];
  const currentCells = Array.isArray(currentContent?.cells) ? currentContent.cells : [];
  const conflictSet = new Set(conflictCellIds);

  const currentById = new Map<string, { cell: nbformat.ICell; index: number }>();
  currentCells.forEach((cell, index) => {
    const id = typeof cell.id === 'string' && cell.id ? cell.id : undefined;
    if (id && !currentById.has(id)) currentById.set(id, { cell, index });
  });

  const usedCurrent = new Set<number>();
  const cells: RecoveryCellDiff[] = [];
  let changedCount = 0;
  let addedCount = 0;
  let removedCount = 0;
  let unchangedCount = 0;
  let reorderedCount = 0;

  copyCells.forEach((copyCell, copyIndex) => {
    const cellId = typeof copyCell.id === 'string' && copyCell.id ? copyCell.id : undefined;
    let match: { cell: nbformat.ICell; index: number } | undefined;
    if (cellId) {
      match = currentById.get(cellId);
    } else if (!currentContent) {
      match = undefined;
    } else {
      const candidate = currentCells[copyIndex];
      const candidateId = candidate && typeof candidate.id === 'string' ? candidate.id : undefined;
      if (candidate && !candidateId && !usedCurrent.has(copyIndex)) {
        match = { cell: candidate, index: copyIndex };
      }
    }

    const copySource = cellSourceText(copyCell.source);
    const copyOutputs = cellOutputsSummary(copyCell);
    const conflict = !!cellId && conflictSet.has(cellId);

    if (!match) {
      addedCount++;
      cells.push({
        key: cellId ? `copy-${cellId}` : `copy-idx-${copyIndex}`,
        ...(cellId ? { cellId } : {}),
        copyIndex,
        cellType: copyCell.cell_type,
        status: 'added',
        conflict,
        reordered: false,
        copySource,
        ...(copyOutputs ? { copyOutputs } : {}),
        sourceChanged: true,
        outputsChanged: Boolean(copyOutputs),
      });
      return;
    }

    usedCurrent.add(match.index);
    const currentCell = match.cell;
    const currentSource = cellSourceText(currentCell.source);
    const currentOutputs = cellOutputsSummary(currentCell);
    const sourceChanged = copySource !== currentSource;
    const outputsChanged = cellOutputsFingerprint(copyCell) !== cellOutputsFingerprint(currentCell);
    const typeChanged = copyCell.cell_type !== currentCell.cell_type;
    const reordered = copyIndex !== match.index;
    if (reordered) reorderedCount++;

    const status: RecoveryCellDiffStatus =
      sourceChanged || outputsChanged || typeChanged || conflict ? 'changed' : 'unchanged';
    if (status === 'changed') changedCount++;
    else unchangedCount++;

    cells.push({
      key: cellId ? `cell-${cellId}` : `pair-${copyIndex}-${match.index}`,
      ...(cellId ? { cellId } : {}),
      copyIndex,
      currentIndex: match.index,
      cellType: copyCell.cell_type,
      ...(typeChanged ? { currentCellType: currentCell.cell_type } : {}),
      status,
      conflict,
      reordered,
      copySource,
      currentSource,
      ...(copyOutputs ? { copyOutputs } : {}),
      ...(currentOutputs ? { currentOutputs } : {}),
      sourceChanged,
      outputsChanged,
    });
  });

  if (currentContent) {
    currentCells.forEach((currentCell, currentIndex) => {
      if (usedCurrent.has(currentIndex)) return;
      const cellId =
        typeof currentCell.id === 'string' && currentCell.id ? currentCell.id : undefined;
      const conflict = !!cellId && conflictSet.has(cellId);
      const currentSource = cellSourceText(currentCell.source);
      const currentOutputs = cellOutputsSummary(currentCell);
      removedCount++;
      cells.push({
        key: cellId ? `current-${cellId}` : `current-idx-${currentIndex}`,
        ...(cellId ? { cellId } : {}),
        currentIndex,
        cellType: currentCell.cell_type,
        currentCellType: currentCell.cell_type,
        status: 'removed',
        conflict,
        reordered: false,
        copySource: '',
        currentSource,
        ...(currentOutputs ? { currentOutputs } : {}),
        sourceChanged: true,
        outputsChanged: Boolean(currentOutputs),
      });
    });
  }

  const metadataChanged = currentContent
    ? JSON.stringify(copyContent.metadata ?? {}) !== JSON.stringify(currentContent.metadata ?? {})
    : false;

  return {
    cells,
    changedCount,
    addedCount,
    removedCount,
    unchangedCount,
    reorderedCount,
    conflictCells: [...conflictSet],
    metadataChanged,
  };
}

const MAX_DIFF_LINES = 400;

/**
 * Simple line-level diff between `current` (before) and `copy` (after) for
 * cell source inspection. Falls back to removed/added blocks on very large cells.
 */
export function computeLineDiff(current: string, copy: string): DiffLine[] {
  if (current === copy) {
    if (!copy) return [];
    return copy.split('\n').map(text => ({ kind: 'context', text }));
  }
  const a = current ? current.split('\n') : [];
  const b = copy ? copy.split('\n') : [];
  if (a.length * b.length > MAX_DIFF_LINES * MAX_DIFF_LINES) {
    return [
      ...a.map(text => ({ kind: 'removed' as const, text })),
      ...b.map(text => ({ kind: 'added' as const, text })),
    ];
  }

  const m = a.length;
  const n = b.length;
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'context', text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ kind: 'removed', text: a[i] });
      i++;
    } else {
      lines.push({ kind: 'added', text: b[j] });
      j++;
    }
  }
  while (i < m) {
    lines.push({ kind: 'removed', text: a[i] });
    i++;
  }
  while (j < n) {
    lines.push({ kind: 'added', text: b[j] });
    j++;
  }
  return lines;
}
