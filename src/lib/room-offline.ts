import type { Cell, CodeCell } from '@jupyterlab/cells';
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

/** Turns on or off the syncing of a cell's view state to its metadata. */
function setSync(cell: Cell, on: boolean) {
  const code = 'syncScrolled' in cell ? (cell as CodeCell) : undefined;
  if (on) {
    // The sync setters read the metadata after setting the flag, so a
    // state that differs from what the cell shows is written straight back
    // as a Y-doc update on reconnect. That happens for a collapsed cell
    // (collapsed while away, the metadata says it isn't). Reading first,
    // while the sync is still off, writes nothing (a test of a real
    // notebook counts the updates). The editable and scrolled loads are
    // the same step for the other two flags; `scrolled: "auto"` is already
    // normalized when the notebook creates the cell, so it needs no reload
    // here.
    cell.loadEditableState?.();
    cell.loadCollapseState?.();
    code?.loadScrolledState?.();
  }
  cell.syncEditable = on;
  cell.syncCollapse = on;
  if (code) code.syncScrolled = on;
}

export type ReadOnlyGuard = {
  /** Lock the notebook read-only without writing to metadata, or unlock it. */
  set(readOnly: boolean): void;
  /** Stop watching for new cells. */
  dispose(): void;
};

type CellsSignal = {
  connect(slot: () => void): void;
  disconnect(slot: () => void): void;
};

/**
 * Make a notebook read-only without touching its shared cell metadata, and
 * restore each cell's own `metadata.editable` when unlocked (#701, #839).
 * Also locks cells added remotely while read-only (e.g. from another server's
 * saves arriving through the room).
 */
export function createReadOnlyGuard(
  notebook: Pick<Notebook, 'widgets'> & { mode?: string },
  model: Pick<NotebookModel, 'readOnly'> & { cells?: { changed: CellsSignal } },
): ReadOnlyGuard {
  let locked = false;
  let disposed = false;

  const lockCells = () => {
    if (!locked || disposed) return;
    for (const cell of notebook.widgets) {
      // A cell with `syncEditable` writes its read-only state to its
      // `editable` metadata, which is in the shared notebook: not an
      // edit to make for an outage or lock, nor one to save to the machine.
      // The same for collapsing the input and scrolling the output.
      if (cell.syncEditable !== false || !cell.readOnly) {
        setSync(cell, false);
        cell.readOnly = true;
      }
    }
  };

  // The notebook makes widgets for new cells in its own handler for the same
  // signal, which may run after this one: sync again in a microtask.
  const onCells = () => {
    lockCells();
    queueMicrotask(lockCells);
  };

  return {
    set(readOnly: boolean) {
      if (disposed) return;
      model.readOnly = readOnly;
      if (readOnly) {
        if (!locked) {
          locked = true;
          model.cells?.changed.connect(onCells);
        }
        if (notebook.mode === 'edit') notebook.mode = 'command';
        lockCells();
      } else if (locked) {
        locked = false;
        model.cells?.changed.disconnect(onCells);
        // Turned on again, each cell reads its state back from its metadata.
        for (const cell of notebook.widgets) setSync(cell, true);
      }
    },
    dispose() {
      disposed = true;
      if (locked) {
        locked = false;
        model.cells?.changed.disconnect(onCells);
      }
    },
  };
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
  notebook: Pick<Notebook, 'widgets'> & { mode?: string },
  model: Pick<NotebookModel, 'readOnly'> & { cells?: { changed: CellsSignal } },
  onOffline: (offline: boolean) => void,
): () => void {
  const guard = createReadOnlyGuard(notebook, model);
  const apply = (connected: boolean) => {
    onOffline(!connected);
    guard.set(!connected);
  };
  apply(room.connected);
  // Command-mode keys are stopped by the pane's own key handler, which
  // runs before the notebook's (`isEditKey`).
  const stop = room.onConnection(apply);
  return () => {
    stop();
    guard.dispose();
  };
}
