import { useState } from 'react';
import type { BackendConfig } from '../lib/backends';
import { BrowserIcon, ServerIcon } from './Icons';

type Props = {
  initial?: BackendConfig;
  error?: string;
  connecting: boolean;
  canCancel: boolean;
  onCancel(): void;
  onConnect(config: BackendConfig): void;
};

/** A macOS-style sheet: pick where kernels run. */
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
  const [pageKernels, setPageKernels] = useState(
    initial?.kind === 'ganymede' && initial.kernels === 'page',
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onConnect(
      kind === 'ganymede'
        ? {
            kind,
            url: url.trim(),
            token: token.trim(),
            ...(pageKernels ? { kernels: 'page' as const } : {}),
          }
        : { kind },
    );
  };

  return (
    <div className="sheet-backdrop">
      <form className="sheet" onSubmit={submit}>
        <h2>Where should kernels run?</h2>
        <div className="choice-grid" role="radiogroup">
          <button
            type="button"
            role="radio"
            aria-checked={kind === 'ganymede'}
            className={`choice ${kind === 'ganymede' ? 'selected' : ''}`}
            onClick={() => setKind('ganymede')}
          >
            <ServerIcon width={28} height={28} />
            <span className="choice-title">Ganymede server</span>
            <span className="choice-detail">Any installed kernel; files on disk.</span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={kind === 'browser'}
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

        {error && <p className="sheet-error">{error}</p>}

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
