import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem =
  { label: string; onSelect(): void; destructive?: boolean; disabled?: boolean } | 'separator';

type Props = {
  /** Where it opens: a point (right-click, long-press) or under an element. */
  at: { x: number; y: number } | HTMLElement;
  label: string;
  items: MenuItem[];
  onClose(): void;
};

const MARGIN = 8;

/**
 * A menu at a point or under a button, kept inside the window, sized for
 * touch where the pointer is coarse. Escape, a pick or a tap outside closes it.
 */
export function ContextMenu({ at, label, items, onClose }: Props) {
  const menu = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number }>();

  useLayoutEffect(() => {
    const m = menu.current;
    if (!m) return;
    const { width, height } = m.getBoundingClientRect();
    let top: number, left: number, above: number;
    if (at instanceof HTMLElement) {
      const r = at.getBoundingClientRect();
      top = r.bottom + 4;
      above = r.top - 4 - height;
      left = r.right - width;
    } else {
      top = at.y;
      above = at.y - height;
      left = at.x;
    }
    if (top + height + MARGIN > window.innerHeight) top = Math.max(MARGIN, above);
    left = Math.min(Math.max(MARGIN, left), Math.max(MARGIN, window.innerWidth - width - MARGIN));
    setPlace({ top, left });
  }, [at]);

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

  return (
    <div
      className="popup-menu-backdrop"
      onPointerDown={onClose}
      onContextMenu={e => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menu}
        className="popup-menu"
        role="menu"
        aria-label={label}
        style={place ?? { visibility: 'hidden' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {items.map((item, i) =>
          item === 'separator' ? (
            <div key={i} className="popup-menu-separator" role="separator" />
          ) : (
            <button
              key={i}
              type="button"
              role="menuitem"
              className={`popup-menu-item ${item.destructive ? 'destructive' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
