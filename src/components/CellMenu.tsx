import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Cell } from '@jupyterlab/cells';
import type { Notebook } from '@jupyterlab/notebook';
import { CELL_MENU, type CellMenuAction, applyCellAction } from '../lib/cell-controls';

type Props = {
  notebook: Notebook;
  cell: Cell;
  /** The "…" button the menu opens under. */
  anchor: HTMLElement;
  /** Runs the active cell, starting a kernel when there is none. */
  run(): Promise<void>;
  onClose(): void;
};

const MARGIN = 8;

/**
 * One cell's menu (#200): Run, Cell Type, Move Up/Down, Duplicate, Delete.
 * Sized for touch; a tap outside it or Escape closes it.
 */
export function CellMenu({ notebook, cell, anchor, run, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number }>();
  const index = notebook.widgets.indexOf(cell);
  const count = notebook.widgets.length;
  const type = cell.model.type;

  // Under the button, right edges lined up, kept inside the window; above
  // it when there is no room below.
  useLayoutEffect(() => {
    const m = menu.current;
    if (!m) return;
    const a = anchor.getBoundingClientRect();
    const { width, height } = m.getBoundingClientRect();
    const below = a.bottom + 4;
    const top =
      below + height + MARGIN <= window.innerHeight ? below : Math.max(MARGIN, a.top - 4 - height);
    const left = Math.min(
      Math.max(MARGIN, a.right - width),
      Math.max(MARGIN, window.innerWidth - width - MARGIN),
    );
    setPlace({ top, left });
  }, [anchor]);

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

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
    onClose();
    void applyCellAction(notebook, cell, action, run).finally(() => {
      // Back to the notebook, so its shortcuts work after the menu.
      if (!notebook.isDisposed) notebook.activate();
    });
  };

  const disabled = (action: CellMenuAction) =>
    (action === 'move-up' && index <= 0) || (action === 'move-down' && index >= count - 1);

  const item = ({ action, label, type: isType }: (typeof CELL_MENU)[number]) => (
    <button
      key={action}
      type="button"
      role={isType ? 'menuitemradio' : 'menuitem'}
      aria-checked={isType ? type === action : undefined}
      className={`cell-menu-item ${action === 'delete' ? 'destructive' : ''}`}
      disabled={disabled(action)}
      onClick={() => pick(action)}
    >
      <span className="cell-menu-check" aria-hidden>
        {isType && type === action ? '✓' : ''}
      </span>
      {label}
    </button>
  );

  const types = CELL_MENU.filter(i => i.type);
  const [first, ...rest] = CELL_MENU.filter(i => !i.type);

  return (
    <div className="cell-menu-backdrop" onPointerDown={onClose}>
      <div
        ref={menu}
        className="cell-menu"
        role="menu"
        aria-label="Cell Actions"
        style={place ? { top: place.top, left: place.left } : { visibility: 'hidden' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {item(first!)}
        <div className="cell-menu-separator" role="separator" />
        <div className="cell-menu-heading">Cell Type</div>
        {types.map(item)}
        <div className="cell-menu-separator" role="separator" />
        {rest.map(item)}
      </div>
    </div>
  );
}
