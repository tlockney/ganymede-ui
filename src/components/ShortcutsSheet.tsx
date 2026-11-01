import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CommandRegistry } from '@lumino/commands';
import {
  GROUPS,
  GROUP_NOTES,
  SHORTCUTS,
  type Shortcut,
  customizations,
  formatKeys,
  isCustomized,
  keysFor,
  problemWith,
  resetKeys,
  setKeys,
  subscribe,
} from '../lib/shortcuts';

type Props = {
  onClose(): void;
};

/**
 * Every keyboard shortcut, grouped by where it applies. Each can be
 * rebound: + records a keystroke to add, × removes a binding, Reset puts
 * the defaults back.
 */
export function ShortcutsSheet({ onClose }: Props) {
  const done = useRef<HTMLButtonElement>(null);
  const overrides = useSyncExternalStore(subscribe, customizations);
  const [recording, setRecording] = useState<string>();
  const [problem, setProblem] = useState<{ id: string; text: string }>();

  useEffect(() => {
    done.current?.focus();
  }, []);

  useEffect(() => {
    // Capture phase, ahead of the notebook's bindings and the app's ⌘S.
    const onKey = (e: KeyboardEvent) => {
      if (!recording) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setRecording(undefined);
        return;
      }
      if (CommandRegistry.isModifierKeyPressed(e)) return;
      const keystroke = CommandRegistry.keystrokeForKeydownEvent(e);
      // A key the keyboard layout doesn't know: keep listening.
      if (!keystroke) return;
      setRecording(undefined);
      const text = problemWith(recording, [keystroke]);
      if (text) {
        setProblem({ id: recording, text });
        return;
      }
      setProblem(undefined);
      const current = keysFor(recording);
      const known = current.some(
        k => k.length === 1 && CommandRegistry.normalizeKeystroke(k[0]!) === keystroke,
      );
      if (!known) setKeys(recording, [...current, [keystroke]]);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recording, onClose]);

  const record = (id: string) => {
    setProblem(undefined);
    setRecording(id);
  };

  const row = (s: Shortcut) => {
    const keys = keysFor(s.id);
    return (
      <div className="shortcut-row" key={s.id}>
        <div className="shortcut-main">
          <dt>{s.label}</dt>
          <dd>
            {keys.length === 0 && recording !== s.id && <span className="key-none">None</span>}
            {keys.map(k => (
              <span className="key-cap" key={k.join(',')}>
                <kbd>{formatKeys(k)}</kbd>
                <button
                  type="button"
                  className="key-remove"
                  aria-label={`Remove ${formatKeys(k)} from ${s.label}`}
                  onClick={() =>
                    setKeys(
                      s.id,
                      keys.filter(other => other !== k),
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
            {recording === s.id ? (
              <kbd className="key-recording">Type a shortcut…</kbd>
            ) : (
              <button
                type="button"
                className="key-add"
                aria-label={`Add a shortcut to ${s.label}`}
                onClick={() => record(s.id)}
              >
                +
              </button>
            )}
            {isCustomized(s.id) && (
              <button type="button" className="link-button" onClick={() => resetKeys(s.id)}>
                Reset
              </button>
            )}
          </dd>
        </div>
        {problem?.id === s.id && (
          <p className="shortcut-problem" role="alert">
            {problem.text}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="sheet-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="sheet shortcuts-sheet" role="dialog" aria-labelledby="shortcuts-title">
        <h2 id="shortcuts-title">Keyboard Shortcuts</h2>
        <div className="shortcuts-list">
          {GROUPS.map(group => (
            <section key={group}>
              <h3>{group}</h3>
              {GROUP_NOTES[group] && <p className="shortcut-group-note">{GROUP_NOTES[group]}</p>}
              <dl>{SHORTCUTS.filter(s => s.group === group).map(row)}</dl>
            </section>
          ))}
        </div>
        <div className="sheet-buttons">
          {Object.keys(overrides).length > 0 && (
            <button type="button" className="push-button reset-all" onClick={() => resetKeys()}>
              Reset All
            </button>
          )}
          <button ref={done} type="button" className="push-button primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
