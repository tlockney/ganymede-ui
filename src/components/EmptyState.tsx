import type { Backend } from '../lib/backends';
import { NotebookIcon } from './Icons';
import { Onboarding } from './Onboarding';

type Props = {
  backend?: Backend;
  connecting: boolean;
  onNew(): void;
  onConnect(): void;
  /** The folder the sidebar shows, for the first-run welcome. */
  folder?: string;
  /** Opens the sidebar; left out when the app draws its own. */
  onShowFolder?(): void;
  /** Copies the sample notebook into the folder and opens it (#214). */
  onOpenSample?(): Promise<void>;
};

export function EmptyState({
  backend,
  connecting,
  onNew,
  onConnect,
  folder = '',
  onShowFolder,
  onOpenSample,
}: Props) {
  return (
    <div className="empty-state">
      <div className="app-mark">
        <img src="/icons/icon.svg" alt="" width={96} height={96} />
      </div>
      <h1>Ganymede</h1>
      {connecting ? (
        <p className="subtle">Connecting…</p>
      ) : backend ? (
        <>
          <p className="subtle">Choose a notebook in the sidebar, or start a new one.</p>
          <button className="push-button primary" onClick={onNew}>
            <NotebookIcon width={16} height={16} /> New Notebook
          </button>
          {onOpenSample && (
            <Onboarding
              backend={backend}
              folder={folder}
              onShowFolder={onShowFolder}
              onConnect={onConnect}
              onOpenSample={onOpenSample}
            />
          )}
        </>
      ) : (
        <>
          <p className="subtle">Connect to a Ganymede server or run kernels in this browser.</p>
          <button className="push-button primary" onClick={onConnect}>
            Connect…
          </button>
        </>
      )}
    </div>
  );
}
