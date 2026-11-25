import { useState } from 'react';
import type { BackendConfig } from '../lib/backends';
import { BrowserIcon, ServerIcon } from './Icons';

type Props = {
  initial?: BackendConfig;
  error?: string;
  connecting: boolean;
  /** The open notebook is saving before the switch (#792). */
  saving?: boolean;
  /**
   * The name of the open notebook whose save failed before the switch
   * (#792): the sheet asks what to do with its edits instead of connecting.
   */
  unsaved?: string;
  /** Why it didn't save, when the pane doesn't say (it timed out). */
  unsavedWhy?: string;
  canCancel: boolean;
  onCancel(): void;
  onConnect(config: BackendConfig): void;
  /** Download the unsaved notebook as it is, edits included. */
  onDownloadCopy?(): void;
  /** Connect anyway; the notebook closes without its edits. */
  onSwitchAnyway?(): void;
};

/** A macOS-style sheet: pick where kernels run. */
export function ConnectSheet({
  initial,
  error,
  connecting,
  saving = false,
  unsaved,
  unsavedWhy,
  canCancel,
  onCancel,
  onConnect,
  onDownloadCopy,
  onSwitchAnyway,
}: Props) {
  const [kind, setKind] = useState<BackendConfig['kind']>(initial?.kind ?? 'ganymede');
  const [url, setUrl] = useState(initial?.kind === 'ganymede' ? initial.url : '');
  const [token, setToken] = useState(initial?.kind === 'ganymede' ? initial.token : '');
  // 'both' (the Mac app's server plus its in-app kernels) shows as checked
  // and is kept as it is.
  const initialKernels = initial?.kind === 'ganymede' ? initial.kernels : undefined;
  const [pageKernels, setPageKernels] = useState(initialKernels !== undefined);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (unsaved !== undefined || saving || connecting) return;
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
    <div className="sheet-backdrop">
      <form className="sheet" onSubmit={submit}>
        <h2>Where should kernels run?</h2>
        {/* Fixed while the sheet asks about unsaved edits: Switch Without
            Saving goes where Connect was asked to. */}
        <fieldset className="connect-fields" disabled={unsaved !== undefined}>
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
        </fieldset>

        {error && <p className="sheet-error">{error}</p>}

        {unsaved !== undefined ? (
          <div className="sheet-unsaved" role="alert">
            <p className="sheet-error">
              Couldn’t save “{unsaved}”.{unsavedWhy && ` ${unsavedWhy}`} Switching closes it, and
              its unsaved edits would be lost.{' '}
              {unsavedWhy ? 'Keep editing to try again.' : 'Keep editing to see why and try again.'}
            </p>
            <div className="sheet-buttons">
              <button type="button" className="push-button" onClick={onSwitchAnyway}>
                Switch Without Saving
              </button>
              <button type="button" className="push-button" onClick={onDownloadCopy}>
                Download a Copy
              </button>
              <button type="button" className="push-button primary" onClick={onCancel}>
                Keep Editing
              </button>
            </div>
          </div>
        ) : (
          <div className="sheet-buttons">
            {canCancel && (
              <button type="button" className="push-button" onClick={onCancel}>
                Cancel
              </button>
            )}
            <button type="submit" className="push-button primary" disabled={connecting || saving}>
              {saving ? 'Saving…' : connecting ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
