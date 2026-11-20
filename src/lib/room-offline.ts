import type { Notebook, NotebookModel } from '@jupyterlab/notebook';
import type { NotebookRoom } from './room';

/** Keys that move or leave without changing a notebook; the rest are edits. */
const SAFE_KEYS = /^(Arrow|Page|Home$|End$|Escape$|Tab$|Shift$|Meta$|Control$|Alt$)/;

/**
 * Whether a keydown would edit or run: not browser shortcuts (copy, find)
 * and not keys that only move or leave.
 */
export function isEditKey(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>) {
  return !(e.metaKey || e.ctrlKey || e.altKey || SAFE_KEYS.test(e.key));
}

/**
 * A connected machine that stops answering (#701): while its room is down,
 * the notebook is read-only (the model and each cell's editor; the pane
 * stops the command-mode keys that edit cells), and `onOffline` says so for the
 * banner. It is editable again when the room is back; nothing is edited
 * while the room is away, so there is no offline editing to merge.
 * Returns the stop function.
 */
export function watchOffline(
  room: Pick<NotebookRoom, 'connected' | 'onConnection'>,
  notebook: Pick<Notebook, 'widgets'>,
  model: Pick<NotebookModel, 'readOnly'>,
  onOffline: (offline: boolean) => void,
): () => void {
  const before = new Map<unknown, boolean>();
  const apply = (connected: boolean) => {
    onOffline(!connected);
    model.readOnly = !connected;
    for (const cell of notebook.widgets) {
      if (!connected) {
        // Each cell's own state comes back when the room does.
        if (!before.has(cell)) before.set(cell, cell.readOnly);
        cell.readOnly = true;
      } else {
        cell.readOnly = before.get(cell) ?? false;
      }
    }
    if (connected) before.clear();
  };
  apply(room.connected);
  // Command-mode keys are stopped by the pane's own key handler, which
  // runs before the notebook's (`isEditKey`).
  return room.onConnection(apply);
}
