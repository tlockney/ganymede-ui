import { useEffect, useId, useRef, useState } from 'react';
import type { BackendConfig } from '../lib/backends';
import { useModalFocus } from '../lib/modal-focus';
import { BrowserIcon, ServerIcon } from './Icons';

type Props = {
  initial?: BackendConfig;
  error?: string;
  connecting: boolean;
  canCancel: boolean;
  onCancel(): void;
  onConnect(config: BackendConfig): void;
};

const KINDS = ['ganymede', 'browser'] as const;

/** Where an arrow key, Home or End moves in the choices, wrapping. */
function step(key: string, at: number, count: number): number | undefined {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
      return (at + 1) % count;
    case 'ArrowLeft':
    case 'ArrowUp':
      return (at - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
  }
  return undefined;
}

/**
 * A macOS-style sheet: pick where kernels run. A modal dialog: focus starts
 * on the chosen kind, Tab stays in the sheet, and closing gives focus back
 * to the control that opened it. The kinds are a radio group: arrows move
 * and select, Tab leaves the group.
 */
export function ConnectSheet({
  initial,
  error,
  connecting,
  canCancel,
  onCancel,
  onConnect,
}: Props) {
  const [kind, setKind] = useState<BackendConfig['kind']>(initial?.kind ?? 'ganymede');
  const [url, setUrl] = useState(initial?.kind === 'ganymede' ? initial.url : '');
  const [token, setToken] = useState(initial?.kind === 'ganymede' ? initial.token : '');
  // 'both' (the Mac app's server plus its in-app kernels) shows as checked
  // and is kept as it is.
  const initialKernels = initial?.kind === 'ganymede' ? initial.kernels : undefined;
  const [pageKernels, setPageKernels] = useState(initialKernels !== undefined);
  const headingId = useId();
  const sheet = useRef<HTMLFormElement>(null);
  const choices = useRef<Partial<Record<BackendConfig['kind'], HTMLButtonElement | null>>>({});
  useModalFocus(sheet, () => sheet.current?.querySelector<HTMLElement>('[aria-checked="true"]'));

  useEffect(() => {
    if (!canCancel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing) return;
      e.preventDefault();
      // Only the sheet closes, not whatever listens for Escape behind it.
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [canCancel, onCancel]);

  const onChoiceKey = (e: React.KeyboardEvent) => {
    // Modified arrows are the system's (Cmd+Left, Alt+Arrow), not a choice.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const next = step(e.key, KINDS.indexOf(kind), KINDS.length);
    if (next === undefined) return;
    e.preventDefault();
    setKind(KINDS[next]);
    choices.current[KINDS[next]]?.focus();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect(
      kind === 'ganymede'
        ? {
            kind,
            url: url.trim(),
            token: token.trim(),
            ...(pageKernels ? { kernels: initialKernels ?? ('page' as const) } : {}),
          }
        : { kind },
    );
  };

  return (
    <div
      className="sheet-backdrop"
      // A click on the dimmed page keeps focus in the sheet.
      onMouseDown={e => e.target === e.currentTarget && e.preventDefault()}
    >
      <form
        ref={sheet}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onSubmit={submit}
      >
        <h2 id={headingId}>Where should kernels run?</h2>
        <div
          className="choice-grid"
          role="radiogroup"
          aria-labelledby={headingId}
          onKeyDown={onChoiceKey}
        >
          <button
            ref={el => {
              choices.current.ganymede = el;
            }}
            type="button"
            role="radio"
            aria-checked={kind === 'ganymede'}
            tabIndex={kind === 'ganymede' ? 0 : -1}
            className={`choice ${kind === 'ganymede' ? 'selected' : ''}`}
            onClick={() => setKind('ganymede')}
          >
            <ServerIcon width={28} height={28} />
            <span className="choice-title">Ganymede server</span>
            <span className="choice-detail">Any installed kernel; files on disk.</span>
          </button>
          <button
            ref={el => {
              choices.current.browser = el;
            }}
            type="button"
            role="radio"
            aria-checked={kind === 'browser'}
            tabIndex={kind === 'browser' ? 0 : -1}
            className={`choice ${kind === 'browser' ? 'selected' : ''}`}
            onClick={() => setKind('browser')}
          >
            <BrowserIcon width={28} height={28} />
            <span className="choice-title">This browser</span>
            <span className="choice-detail">
              TypeScript or JavaScript, no server; works offline.
            </span>
          </button>
        </div>

        {kind === 'ganymede' && (
          <div className="form-rows">
            <label>
              <span>Server</span>
              <input
                type="url"
                placeholder="Same origin (dev proxy)"
                value={url}
                onChange={e => setUrl(e.target.value)}
              />
            </label>
            <label>
              <span>Token</span>
              <input
                type="password"
                autoComplete="off"
                placeholder="From ganymede serve"
                value={token}
                onChange={e => setToken(e.target.value)}
              />
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={pageKernels}
                onChange={e => setPageKernels(e.target.checked)}
              />
              <span>Run kernels in this page; keep notebooks on the server</span>
            </label>
            <p className="hint">
              For another origin, start the server with{' '}
              <code>--allow-origin {window.location.origin}</code>.
            </p>
          </div>
        )}

        {error && (
          <p className="sheet-error" role="alert">
            {error}
          </p>
        )}

        <div className="sheet-buttons">
          {canCancel && (
            <button type="button" className="push-button" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="push-button primary" disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </form>
    </div>
  );
}
