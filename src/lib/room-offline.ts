import type { Notebook, NotebookModel } from '@jupyterlab/notebook';
import type { NotebookRoom } from './room';

/** Keys that move or leave without changing a notebook; the rest are edits. */
const SAFE_KEYS = /^(Arrow|Page|Home$|End$|Escape$|Tab$|Shift$|Meta$|Control$|Alt$)/;

/**
 * A connected machine that stops answering (#701): while its room is down,
 * the notebook is read-only (the model and each cell's editor, and the
 * command-mode keys that edit cells), and `onOffline` says so for the
 * banner. It is editable again when the room is back; nothing is edited
 * while the room is away, so there is no offline editing to merge.
 * Returns the stop function.
 */
export function watchOffline(
  room: Pick<NotebookRoom, 'connected' | 'onConnection'>,
  notebook: Pick<Notebook, 'widgets' | 'node'>,
  model: Pick<NotebookModel, 'readOnly'>,
  onOffline: (offline: boolean) => void,
): () => void {
  const apply = (connected: boolean) => {
    onOffline(!connected);
    model.readOnly = !connected;
    for (const cell of notebook.widgets) cell.readOnly = !connected;
  };
  apply(room.connected);
  // Command-mode keys (dd, a, b, Enter…) don't go through the editors'
  // read-only state; browser shortcuts (copy, find) are left alone.
  const blockEdits = (e: KeyboardEvent) => {
    if (room.connected || e.metaKey || e.ctrlKey || e.altKey || SAFE_KEYS.test(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  notebook.node.addEventListener('keydown', blockEdits, true);
  const off = room.onConnection(apply);
  return () => {
    off();
    notebook.node.removeEventListener('keydown', blockEdits, true);
  };
}
