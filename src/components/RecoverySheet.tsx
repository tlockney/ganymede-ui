import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Contents, ServerConnection } from '@jupyterlab/services';
import { downloadFile } from '../lib/download';
import {
  LOCAL_RECOVERY_COPY_ID,
  type LocalRecoverySnapshot,
  localRecoveryReasonLabel,
} from '../lib/local-recovery';
import { useModalFocus } from '../lib/modal-focus';
import {
  type RecoveryCellDiff,
  type RecoveryCopy,
  type RecoveryCopyMeta,
  type RoomRecoverySummary,
  computeLineDiff,
  diffRecoveryNotebook,
  discardRecoveryCopy,
  fetchRecoveryCopyOrRefresh,
  formatRecoveryTimestamp,
  listRecoveryCopies,
  recoveryReasonLabel,
  restoreRecoveryCopy,
} from '../lib/room-recovery';

export type RecoverySheetProps = {
  path: string;
  name: string;
  settings?: ServerConnection.ISettings;
  /** Whether to query `/api/collaboration/recovery` on the server. Defaults to `Boolean(settings)`. */
  hasServerRecovery?: boolean;
  contents: Pick<Contents.IManager, 'save'>;
  initialSummary?: RoomRecoverySummary;
  /** Local unsaved copy held in this browser's IndexedDB (#808). */
  localCopy?: LocalRecoverySnapshot;
  currentNotebook?: nbformat.INotebookContent;
  hasUnsavedEdits?: boolean;
  roomClosed?: boolean;
  onCopiesChanged(copies: RecoveryCopyMeta[]): void;
  onRestored(copy: RecoveryCopy): Promise<void> | void;
  onRestoreLocal?(copy: LocalRecoverySnapshot): Promise<void> | void;
  onDiscardLocal?(): Promise<void> | void;
  onClose(): void;
};

type PickerEntry = {
  kind: 'local' | 'server';
  id: string;
  label: string;
  at: string;
};

type ActiveRecoveryView = {
  kind: 'local' | 'server';
  label: string;
  at: string;
  detail?: string;
  cells: string[];
  content: nbformat.INotebookContent;
};

function recoveryDownloadName(name: string): string {
  const base = name.endsWith('.ipynb') ? name.slice(0, -6) : name;
  return `${base || 'notebook'}-recovery.ipynb`;
}

function cellHeading(cell: RecoveryCellDiff): string {
  if (cell.copyIndex !== undefined && cell.currentIndex !== undefined) {
    return cell.copyIndex === cell.currentIndex
      ? `Cell #${cell.copyIndex + 1}`
      : `Recovery #${cell.copyIndex + 1} · Current #${cell.currentIndex + 1}`;
  }
  if (cell.copyIndex !== undefined) return `Recovery cell #${cell.copyIndex + 1}`;
  if (cell.currentIndex !== undefined) return `Current cell #${cell.currentIndex + 1}`;
  return 'Cell';
}

function statusBadgeLabel(status: RecoveryCellDiff['status']): string {
  switch (status) {
    case 'changed':
      return 'Changed';
    case 'added':
      return 'Added in recovery';
    case 'removed':
      return 'Missing from recovery';
    case 'unchanged':
      return 'Unchanged';
  }
}

/**
 * Sheet to inspect, diff, download, restore, or discard server-saved recovery
 * copies (#831) and/or a local unsaved copy kept in IndexedDB (#808).
 */
export function RecoverySheet({
  path,
  name,
  settings,
  hasServerRecovery,
  contents,
  initialSummary,
  localCopy,
  currentNotebook,
  hasUnsavedEdits = false,
  roomClosed = false,
  onCopiesChanged,
  onRestored,
  onRestoreLocal,
  onDiscardLocal,
  onClose,
}: RecoverySheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useModalFocus(sheetRef, () => closeRef.current);

  const queryServer = Boolean(settings && (hasServerRecovery ?? true));

  const [copies, setCopies] = useState<RecoveryCopyMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(() =>
    queryServer
      ? (initialSummary?.id ?? (localCopy ? LOCAL_RECOVERY_COPY_ID : undefined))
      : localCopy
        ? LOCAL_RECOVERY_COPY_ID
        : undefined,
  );
  const [copy, setCopy] = useState<RecoveryCopy>();
  const [loadingList, setLoadingList] = useState(queryServer);
  const [loadingCopy, setLoadingCopy] = useState(false);
  const [busyAction, setBusyAction] = useState<'restore' | 'discard'>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [showAllCells, setShowAllCells] = useState(false);

  const onCopiesChangedRef = useRef(onCopiesChanged);
  useEffect(() => {
    onCopiesChangedRef.current = onCopiesChanged;
  }, [onCopiesChanged]);

  const localCopyRef = useRef(localCopy);
  localCopyRef.current = localCopy;

  const busy = Boolean(busyAction);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (!busy) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onClose]);

  const loadSelectedCopy = useCallback(
    async (id: string, cancelledRef: { cancelled: boolean }) => {
      if (!settings) return;
      setLoadingCopy(true);
      setError(undefined);
      const result = await fetchRecoveryCopyOrRefresh(settings, path, id);
      if (cancelledRef.cancelled) return;
      setLoadingCopy(false);
      if (result.kind === 'copy') {
        setCopy(result.copy);
        return;
      }
      if (result.kind === 'error') {
        setCopy(undefined);
        setError(result.message);
        return;
      }
      // GET /{id} returned 404: show the refreshed copy list from the server.
      setCopy(undefined);
      if (result.list.kind === 'unsupported') {
        setCopies([]);
        onCopiesChangedRef.current([]);
        setSelectedId(localCopyRef.current ? LOCAL_RECOVERY_COPY_ID : undefined);
        if (!localCopyRef.current) setNotice('No recovery copies remain for this notebook.');
        return;
      }
      if (result.list.kind === 'error') {
        setError(result.list.message);
        return;
      }
      const next = result.list.copies;
      setCopies(next);
      onCopiesChangedRef.current(next);
      setNotice(
        next.length > 0
          ? 'That recovery copy was already removed on the server. Showing the updated list.'
          : 'That recovery copy was already removed on the server.',
      );
      setSelectedId(next[0]?.id ?? (localCopyRef.current ? LOCAL_RECOVERY_COPY_ID : undefined));
    },
    [path, settings],
  );

  // Initial list load on mount / path change.
  useEffect(() => {
    if (!queryServer || !settings) {
      setLoadingList(false);
      setCopies([]);
      setCopy(undefined);
      setError(undefined);
      setNotice(undefined);
      setSelectedId(localCopyRef.current ? LOCAL_RECOVERY_COPY_ID : undefined);
      return;
    }
    const state = { cancelled: false };
    setLoadingList(true);
    setError(undefined);
    setNotice(undefined);
    setCopy(undefined);
    void listRecoveryCopies(settings, path).then(res => {
      if (state.cancelled) return;
      setLoadingList(false);
      if (res.kind === 'unsupported') {
        setCopies([]);
        onCopiesChangedRef.current([]);
        setSelectedId(localCopyRef.current ? LOCAL_RECOVERY_COPY_ID : undefined);
        if (!localCopyRef.current) {
          setNotice('Recovery copies are not available on this server.');
        }
        return;
      }
      if (res.kind === 'error') {
        setError(res.message);
        if (localCopyRef.current) setSelectedId(LOCAL_RECOVERY_COPY_ID);
        return;
      }
      setCopies(res.copies);
      onCopiesChangedRef.current(res.copies);
      const preferred =
        initialSummary?.id && res.copies.some(c => c.id === initialSummary.id)
          ? initialSummary.id
          : (res.copies[0]?.id ?? (localCopyRef.current ? LOCAL_RECOVERY_COPY_ID : undefined));
      setSelectedId(preferred);
      // If the room summary named a copy ID that isn't in the list, trigger a
      // GET /{id} 404 -> list re-read flow so the server clears stale state.
      if (!res.copies.some(c => c.id === initialSummary?.id) && initialSummary?.id) {
        void loadSelectedCopy(initialSummary.id, state);
      }
    });
    return () => {
      state.cancelled = true;
    };
  }, [initialSummary?.id, loadSelectedCopy, path, queryServer, settings]);

  // Load server copy details whenever selectedId changes to a server copy.
  useEffect(() => {
    if (!selectedId || selectedId === LOCAL_RECOVERY_COPY_ID || loadingList || !queryServer) return;
    if (copy?.id === selectedId) return;
    const state = { cancelled: false };
    void loadSelectedCopy(selectedId, state);
    return () => {
      state.cancelled = true;
    };
  }, [copy?.id, loadSelectedCopy, loadingList, queryServer, selectedId]);

  // If the selected local copy was removed externally, move selection to any server copy.
  useEffect(() => {
    if (selectedId === LOCAL_RECOVERY_COPY_ID && !localCopy) {
      setSelectedId(copies[0]?.id);
    }
  }, [copies, localCopy, selectedId]);

  const pickerEntries = useMemo<PickerEntry[]>(() => {
    const entries: PickerEntry[] = [];
    if (localCopy) {
      entries.push({
        kind: 'local',
        id: LOCAL_RECOVERY_COPY_ID,
        label: 'Local unsaved copy',
        at: localCopy.at,
      });
    }
    for (const item of copies) {
      entries.push({
        kind: 'server',
        id: item.id,
        label: recoveryReasonLabel(item.reason),
        at: item.at,
      });
    }
    return entries;
  }, [copies, localCopy]);

  const activeView = useMemo<ActiveRecoveryView | undefined>(() => {
    if (selectedId === LOCAL_RECOVERY_COPY_ID && localCopy) {
      return {
        kind: 'local',
        label: localRecoveryReasonLabel(localCopy.reason),
        at: localCopy.at,
        detail: localCopy.detail,
        cells: [],
        content: localCopy.content,
      };
    }
    if (copy && copy.id === selectedId) {
      return {
        kind: 'server',
        label: recoveryReasonLabel(copy.reason),
        at: copy.at,
        detail: copy.detail,
        cells: copy.cells,
        content: copy.content,
      };
    }
    return undefined;
  }, [copy, localCopy, selectedId]);

  const diff = useMemo(() => {
    if (!activeView) return undefined;
    return diffRecoveryNotebook(activeView.content, currentNotebook, activeView.cells);
  }, [activeView, currentNotebook]);

  const visibleCells = useMemo(() => {
    if (!diff) return [];
    if (showAllCells || !currentNotebook) return diff.cells;
    const changed = diff.cells.filter(c => c.status !== 'unchanged' || c.conflict || c.reordered);
    return changed.length > 0 ? changed : diff.cells;
  }, [currentNotebook, diff, showAllCells]);

  const hasDiffChanges = Boolean(
    diff &&
    (diff.changedCount > 0 ||
      diff.addedCount > 0 ||
      diff.removedCount > 0 ||
      diff.reorderedCount > 0 ||
      diff.conflictCells.length > 0),
  );

  const restore = async () => {
    if (!activeView || busy) return;
    if (activeView.kind === 'local' && localCopy) {
      setBusyAction('restore');
      setError(undefined);
      setNotice(undefined);
      try {
        if (onRestoreLocal) {
          await onRestoreLocal(localCopy);
        } else {
          await contents.save(path, {
            type: 'notebook',
            format: 'json',
            content: localCopy.content,
          });
        }
        setBusyAction(undefined);
        onClose();
      } catch (e) {
        setBusyAction(undefined);
        setError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    if (!copy || !settings) return;
    setBusyAction('restore');
    setError(undefined);
    setNotice(undefined);
    const res = await restoreRecoveryCopy({ settings, contents, path, copy });
    if (res.kind === 'error') {
      setBusyAction(undefined);
      setError(res.message);
      return;
    }
    const refreshed = await listRecoveryCopies(settings, path);
    if (refreshed.kind === 'copies') {
      setCopies(refreshed.copies);
      onCopiesChangedRef.current(refreshed.copies);
    } else if (refreshed.kind === 'unsupported') {
      setCopies([]);
      onCopiesChangedRef.current([]);
    }
    setBusyAction(undefined);
    if (!res.discarded) {
      setError(
        `Restored ${name}, but couldn’t discard the recovery copy: ${res.discardError ?? 'unknown error'}`,
      );
      return;
    }
    await onRestored(copy);
    onClose();
  };

  const discard = async () => {
    if (!activeView || busy) return;
    if (activeView.kind === 'local') {
      setBusyAction('discard');
      setError(undefined);
      setNotice(undefined);
      try {
        await onDiscardLocal?.();
      } catch (e) {
        setBusyAction(undefined);
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      setBusyAction(undefined);
      if (copies.length > 0) {
        setSelectedId(copies[0].id);
      } else {
        onClose();
      }
      return;
    }

    if (!copy || !settings) return;
    setBusyAction('discard');
    setError(undefined);
    setNotice(undefined);
    const res = await discardRecoveryCopy(settings, copy.id);
    if (res.kind === 'error') {
      setBusyAction(undefined);
      setError(res.message);
      return;
    }
    const refreshed = await listRecoveryCopies(settings, path);
    setBusyAction(undefined);
    if (refreshed.kind === 'copies') {
      setCopies(refreshed.copies);
      onCopiesChangedRef.current(refreshed.copies);
      setCopy(undefined);
      const nextId =
        refreshed.copies[0]?.id ?? (localCopyRef.current ? LOCAL_RECOVERY_COPY_ID : undefined);
      setSelectedId(nextId);
      if (!nextId) onClose();
      return;
    }
    if (refreshed.kind === 'unsupported') {
      onCopiesChangedRef.current([]);
      if (localCopyRef.current) {
        setSelectedId(LOCAL_RECOVERY_COPY_ID);
      } else {
        onClose();
      }
      return;
    }
    setError(refreshed.message);
  };

  const download = () => {
    if (!activeView) return;
    const text = JSON.stringify(activeView.content, null, 1) + '\n';
    downloadFile(recoveryDownloadName(name), text, 'application/x-ipynb+json');
  };

  const title =
    pickerEntries.length === 1 && pickerEntries[0].kind === 'local' && !queryServer
      ? `Local recovery copy for ${name}`
      : `Recovery copies for ${name}`;

  return (
    <div className="sheet-backdrop">
      <div
        ref={sheetRef}
        className="sheet recovery-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-sheet-title"
      >
        <h2 id="recovery-sheet-title">{title}</h2>

        {loadingList && <p role="status">Loading recovery copies…</p>}

        {notice && (
          <p className="recovery-note" role="status">
            {notice}
          </p>
        )}

        {pickerEntries.length > 1 && (
          <div
            className="recovery-copy-picker"
            role="listbox"
            aria-label="Available recovery copies"
          >
            {pickerEntries.map(item => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === selectedId}
                className={`recovery-copy-tab${item.id === selectedId ? ' selected' : ''}`}
                disabled={busy}
                onClick={() => {
                  setNotice(undefined);
                  setError(undefined);
                  setSelectedId(item.id);
                }}
              >
                <span className="recovery-copy-tab-reason">{item.label}</span>
                <span className="recovery-copy-tab-time">{formatRecoveryTimestamp(item.at)}</span>
              </button>
            ))}
          </div>
        )}

        {!loadingList && pickerEntries.length === 0 && !loadingCopy && !error && (
          <p className="hint recovery-empty">No recovery copies remain for this notebook.</p>
        )}

        {loadingCopy && selectedId !== LOCAL_RECOVERY_COPY_ID && (
          <p role="status">Loading recovery copy…</p>
        )}

        {activeView && diff && (
          <div className="recovery-copy-body">
            <div className="recovery-meta">
              <div className="recovery-meta-row">
                <span
                  className={`recovery-reason-pill${activeView.kind === 'local' ? ' is-local' : ''}`}
                >
                  {activeView.label}
                </span>
                <span className="recovery-timestamp">{formatRecoveryTimestamp(activeView.at)}</span>
              </div>
              {activeView.detail && (
                <p className="recovery-detail-line">
                  Details: <span>{activeView.detail}</span>
                </p>
              )}
              {activeView.cells.length > 0 && (
                <div className="recovery-conflict-cells" role="note">
                  <strong>Conflicting cells:</strong>{' '}
                  {activeView.cells.map(id => (
                    <code key={id} className="recovery-cell-id">
                      {id}
                    </code>
                  ))}
                </div>
              )}
              <div className="recovery-diff-summary">
                <span>
                  {[
                    diff.changedCount > 0 ? `${diff.changedCount} changed` : '',
                    diff.addedCount > 0 ? `${diff.addedCount} added` : '',
                    diff.removedCount > 0 ? `${diff.removedCount} removed` : '',
                    diff.reorderedCount > 0 ? `${diff.reorderedCount} moved` : '',
                    diff.unchangedCount > 0 ? `${diff.unchangedCount} unchanged` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'No cell changes against current notebook'}
                  {diff.metadataChanged ? ' · Metadata changed' : ''}
                </span>
                {currentNotebook && hasDiffChanges && diff.unchangedCount > 0 && (
                  <label className="recovery-toggle">
                    <input
                      type="checkbox"
                      checked={showAllCells}
                      onChange={e => setShowAllCells(e.target.checked)}
                    />
                    <span>Show unchanged cells</span>
                  </label>
                )}
              </div>
            </div>

            <div className="recovery-cells">
              {visibleCells.map(cell => {
                const lines =
                  cell.status === 'changed' && cell.currentSource !== undefined
                    ? computeLineDiff(cell.currentSource, cell.copySource)
                    : undefined;
                return (
                  <div
                    key={cell.key}
                    className={`recovery-cell-card status-${cell.status}${
                      cell.conflict ? ' conflict' : ''
                    }`}
                  >
                    <div className="recovery-cell-header">
                      <span className="recovery-cell-title">
                        {cellHeading(cell)} · {cell.cellType}
                        {cell.cellId && <code className="recovery-cell-id">{cell.cellId}</code>}
                      </span>
                      <span className="recovery-cell-badges">
                        {cell.conflict && <span className="recovery-badge conflict">Conflict</span>}
                        {cell.reordered && <span className="recovery-badge">Moved</span>}
                        <span className={`recovery-badge status-${cell.status}`}>
                          {statusBadgeLabel(cell.status)}
                        </span>
                      </span>
                    </div>

                    {lines ? (
                      <pre className="recovery-cell-diff">
                        {lines.map((line, idx) => (
                          <span key={idx} className={`diff-line diff-${line.kind}`}>
                            {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  '}
                            {line.text}
                            {'\n'}
                          </span>
                        ))}
                      </pre>
                    ) : (
                      <pre className="recovery-cell-diff">
                        {cell.status === 'removed' ? cell.currentSource : cell.copySource}
                      </pre>
                    )}

                    {cell.outputsChanged && (
                      <p className="recovery-outputs-note">
                        Outputs: {cell.currentOutputs ?? 'none'} → {cell.copyOutputs ?? 'none'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {(hasUnsavedEdits || roomClosed) && (
              <p className="hint recovery-restore-note">
                {roomClosed
                  ? 'Restoring writes this copy back to the file and reopens the notebook.'
                  : 'Restoring writes this copy over the file on disk and replaces unsaved edits.'}
              </p>
            )}
          </div>
        )}

        {error && <p className="sheet-error">{error}</p>}

        <div className="sheet-buttons recovery-sheet-buttons">
          <button
            ref={closeRef}
            type="button"
            className="push-button"
            onClick={onClose}
            disabled={busy}
          >
            Close
          </button>
          {activeView && (
            <>
              <button type="button" className="push-button" onClick={download} disabled={busy}>
                Download Copy
              </button>
              <button
                type="button"
                className="push-button"
                onClick={() => void discard()}
                disabled={busy}
              >
                {busyAction === 'discard' ? 'Discarding…' : 'Discard Copy'}
              </button>
              <button
                type="button"
                className="push-button primary"
                onClick={() => void restore()}
                disabled={busy}
              >
                {busyAction === 'restore' ? 'Restoring…' : 'Restore Copy'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
