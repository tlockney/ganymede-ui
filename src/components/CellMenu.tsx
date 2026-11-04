import { useEffect } from 'react';
import type { Cell } from '@jupyterlab/cells';
import type { Notebook } from '@jupyterlab/notebook';
import { CELL_MENU, type CellMenuAction, applyCellAction } from '../lib/cell-controls';
import { ContextMenu, type MenuItem } from './ContextMenu';

type Props = {
  notebook: Notebook;
  cell: Cell;
  /** The "…" button the menu opens under. */
  anchor: HTMLElement;
  /** Runs the active cell, starting a kernel when there is none. */
  run(): Promise<void>;
  onClose(): void;
};

/**
 * One cell's menu (#200): Run, Cell Type, Move Up/Down, Duplicate, Delete,
 * in the shared popup menu (#203), so it is sized for touch and a tap
 * outside it or Escape closes it.
 */
export function CellMenu({ notebook, cell, anchor, run, onClose }: Props) {
  const index = notebook.widgets.indexOf(cell);
  const count = notebook.widgets.length;
  const type = cell.model.type;

  // Any change to the cells (an undo, another window) closes it: the cell
  // may be gone, and Move Up/Down may no longer apply.
  useEffect(() => {
    const cells = notebook.model?.cells;
    if (!cells) return;
    const close = () => onClose();
    cells.changed.connect(close);
    return () => void cells.changed.disconnect(close);
  }, [notebook, onClose]);

  const pick = (action: CellMenuAction) => {
    void applyCellAction(notebook, cell, action, run).finally(() => {
      // Back to the notebook, so its shortcuts work after the menu.
      if (!notebook.isDisposed) notebook.activate();
    });
  };

  const item = ({ action, label, type: isType }: (typeof CELL_MENU)[number]): MenuItem => ({
    label,
    onSelect: () => pick(action),
    checked: isType ? type === action : undefined,
    destructive: action === 'delete',
    disabled:
      (action === 'move-up' && index <= 0) || (action === 'move-down' && index >= count - 1),
  });

  const types = CELL_MENU.filter(i => i.type);
  const [first, ...rest] = CELL_MENU.filter(i => !i.type);

  return (
    <ContextMenu
      at={anchor}
      label="Cell Actions"
      items={[
        item(first!),
        'separator',
        { heading: 'Cell Type' },
        ...types.map(item),
        'separator',
        ...rest.map(item),
      ]}
      onClose={onClose}
    />
  );
}
