import { useEffect, useRef } from 'react';
import { GROUPS, SHORTCUTS, formatKeys } from '../lib/shortcuts';

type Props = {
  onClose(): void;
};

/** Every keyboard shortcut, grouped by where it applies. */
export function ShortcutsSheet({ onClose }: Props) {
  const done = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    done.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    // Capture phase, ahead of the notebook's own Escape binding.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet shortcuts-sheet" role="dialog" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
        <div className="shortcuts-list">
          {GROUPS.map(group => (
            <section key={group}>
              <h3>{group}</h3>
              <dl>
                {SHORTCUTS.filter(s => s.group === group).map(s => (
                  <div className="shortcut-row" key={s.id}>
                    <dt>{s.label}</dt>
                    <dd>
                      {s.keys.map(keys => (
                        <kbd key={keys.join(',')}>{formatKeys(keys)}</kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="sheet-buttons">
          <button ref={done} type="button" className="push-button primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
