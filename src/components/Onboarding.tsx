import { useState } from 'react';
import type { Backend } from '../lib/backends';
import {
  dismissOnboarding,
  kernelsWhere,
  notebooksWhere,
  onboardingDismissed,
} from '../lib/onboarding';
import { BrowserIcon, FolderIcon, NotebookIcon, ServerIcon } from './Icons';

type Props = {
  backend: Backend;
  /** The folder the sidebar shows, where the sample goes; '' for the top. */
  folder: string;
  /** Opens the sidebar on the folder; left out when the app draws its own. */
  onShowFolder?(): void;
  /** Opens the sheet that picks where kernels run. */
  onConnect(): void;
  /** Copies the sample into the folder and opens it; throws when it can't. */
  onOpenSample(): Promise<void>;
};

/**
 * The first-run welcome (#214): where notebooks live and where kernels
 * run, with a button for each, and a sample notebook to try. Gone for good
 * once dismissed.
 */
export function Onboarding({ backend, folder, onShowFolder, onConnect, onOpenSample }: Props) {
  const [dismissed, setDismissed] = useState(onboardingDismissed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (dismissed) return null;

  const openSample = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await onOpenSample();
    } catch (e) {
      setError(`Couldn’t copy the sample: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const local = backend.config.kind === 'browser' || backend.config.kernels === 'page';
  return (
    <section className="onboarding" aria-label="Welcome">
      <h2>Welcome to Ganymede</h2>
      <div className="onboarding-row">
        <FolderIcon width={20} height={20} aria-hidden="true" />
        <p>{notebooksWhere(backend, folder)}</p>
        {onShowFolder && (
          <button className="push-button" onClick={onShowFolder}>
            Show Folder
          </button>
        )}
      </div>
      <div className="onboarding-row">
        {local ? (
          <BrowserIcon width={20} height={20} aria-hidden="true" />
        ) : (
          <ServerIcon width={20} height={20} aria-hidden="true" />
        )}
        <p>{kernelsWhere(backend)}</p>
        <button className="push-button" onClick={onConnect} aria-label="Change where kernels run">
          Change…
        </button>
      </div>
      {error && (
        <p className="sheet-error" role="alert">
          {error}
        </p>
      )}
      <div className="onboarding-actions">
        <button className="push-button" onClick={() => void openSample()} disabled={busy}>
          <NotebookIcon width={16} height={16} /> Open Sample Notebook
        </button>
        <button
          className="push-button"
          onClick={() => {
            dismissOnboarding();
            setDismissed(true);
          }}
        >
          Don’t Show Again
        </button>
      </div>
    </section>
  );
}
