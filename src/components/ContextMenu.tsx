import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type MenuItem =
  | {
      label: string;
      onSelect(): void;
      destructive?: boolean;
      disabled?: boolean;
      /** One of a set to pick from (a cell's type): checked when it is the one. */
      checked?: boolean;
    }
  | 'separator'
  /** A label over the items after it. */
  | { heading: string };

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
 * touch where the pointer is coarse. Escape, a pick or a tap outside closes it;
 * the arrow keys, Home and End move between its items.
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

  // Where focus was when it opened (the "…" button, or the row): it goes
  // back there when the menu is dismissed. A pick leaves focus to what the
  // pick opens (a rename field, a dialog).
  const opener = useRef<Element | null>(null);
  const dismiss = () => {
    onClose();
    const back = opener.current;
    if (back instanceof HTMLElement && back.isConnected) back.focus();
  };
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;

  useEffect(() => {
    opener.current = document.activeElement;
    const enabled = () =>
      Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
    enabled()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      const items = enabled();
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      const to: Record<string, number> = {
        ArrowDown: at < 0 ? 0 : (at + 1) % items.length,
        ArrowUp: at < 0 ? items.length - 1 : (at - 1 + items.length) % items.length,
        Home: 0,
        End: items.length - 1,
      };
      if (e.key === 'Escape') dismissRef.current();
      else if (e.key in to) items[to[e.key]]?.focus();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Items line up past the check marks' column, when there is one.
  const checks = items.some(i => typeof i === 'object' && 'label' in i && i.checked !== undefined);

  return (
    <div
      className="popup-menu-backdrop"
      onPointerDown={dismiss}
      onContextMenu={e => {
        e.preventDefault();
        dismiss();
      }}
    >
      <div
        ref={menu}
        className={`popup-menu ${checks ? 'with-checks' : ''}`}
        role="menu"
        aria-label={label}
        style={place ?? { visibility: 'hidden' }}
        onPointerDown={e => e.stopPropagation()}
      >
        {items.map((item, i) =>
          item === 'separator' ? (
            <div key={i} className="popup-menu-separator" role="separator" />
          ) : 'heading' in item ? (
            <div key={i} className="popup-menu-heading" role="presentation">
              {item.heading}
            </div>
          ) : (
            <button
              key={i}
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              className={`popup-menu-item ${item.destructive ? 'destructive' : ''}`}
              disabled={item.disabled}
              onClick={() => {
                onClose();
                item.onSelect();
              }}
            >
              {checks && (
                <span className="popup-menu-check" aria-hidden>
                  {item.checked ? '✓' : ''}
                </span>
              )}
              {item.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
