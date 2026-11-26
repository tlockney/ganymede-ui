import { useEffect } from 'react';
import type { Cell, CodeCell, ICodeCellModel } from '@jupyterlab/cells';
import type { Notebook } from '@jupyterlab/notebook';
import {
  CELL_MENU,
  type CellMenuAction,
  applyCellAction,
  selectOnly,
  toggleOutputs,
} from '../lib/cell-controls';
import { canCollapse, setCollapsed } from '../lib/code-collapse';
import { setWrapCodeEnabled, wrapCodeEnabled } from '../lib/wrap-code';
import { ContextMenu, type MenuItem } from './ContextMenu';

type Props = {
  notebook: Notebook;
  cell: Cell;
  /** The "…" button the menu opens under. */
  anchor: HTMLElement;
  /** Runs the active cell, starting a kernel when there is none. */
  run(): Promise<void>;
  /** A machine that is away: nothing here edits or runs (#701). */
  away?: boolean;
  onClose(): void;
};

/**
 * One cell's menu (#200): Run, Collapse Code (#564), Collapse Output (#852),
 * Cell Type, Move Up/Down, Duplicate, Delete,
 * in the shared popup menu (#203), so it is sized for touch and a tap
 * outside it or Escape closes it.
 */
export function CellMenu({ notebook, cell, anchor, run, away = false, onClose }: Props) {
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
    if (away) return;
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
      away ||
      (action === 'move-up' && index <= 0) ||
      (action === 'move-down' && index >= count - 1),
  });

  const types = CELL_MENU.filter(i => i.type);
  const [first, ...rest] = CELL_MENU.filter(i => !i.type);

  return (
    <ContextMenu
      at={anchor}
      label="Cell Actions"
      items={[
        item(first!),
        // Collapsing code (#564), for touch: the button beside the cell is small.
        ...(canCollapse(cell) || cell.inputHidden
          ? [
              {
                label: cell.inputHidden ? 'Expand Code' : 'Collapse Code',
                disabled: away,
                onSelect: () => {
                  if (away) return;
                  // Its cell, as the other items act on it (`applyCellAction`).
                  if (selectOnly(notebook, cell)) setCollapsed(cell, !cell.inputHidden, notebook);
                  if (!notebook.isDisposed) notebook.activate();
                },
              },
            ]
          : []),
        // Collapsing a cell's outputs (#852): JupyterLab's button for it sits
        // on the output prompt, which the card hides. Only a cell with outputs
        // has anything to collapse.
        ...(cell.model.type === 'code' && (cell.model as ICodeCellModel).outputs.length
          ? [
              {
                label: (cell as CodeCell).outputHidden ? 'Show Output' : 'Collapse Output',
                disabled: away,
                onSelect: () => {
                  if (away) return;
                  toggleOutputs(notebook, cell);
                  if (!notebook.isDisposed) notebook.activate();
                },
              },
            ]
          : []),
        // A view setting (#813): wraps long lines in every cell, for touch.
        {
          label: 'Wrap Code',
          checked: wrapCodeEnabled(),
          toggle: true,
          disabled: away,
          onSelect: () => {
            if (away) return;
            setWrapCodeEnabled(!wrapCodeEnabled());
            if (!notebook.isDisposed) notebook.activate();
          },
        },
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
