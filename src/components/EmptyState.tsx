import type { Backend } from '../lib/backends';
import { NotebookIcon } from './Icons';

type Props = {
  backend?: Backend;
  connecting: boolean;
  onNew(): void;
  onConnect(): void;
};

export function EmptyState({ backend, connecting, onNew, onConnect }: Props) {
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
