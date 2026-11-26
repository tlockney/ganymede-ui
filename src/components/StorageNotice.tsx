import { useState } from 'react';
import { dismissStorageNotice, STORAGE_NOTE, storageNoticeDismissed } from '../lib/storage-notice';

type Props = {
  /** Downloads the open notebook as a file. */
  onDownload(): void;
};

/**
 * Where browser work is stored (#815), above a notebook of the in-browser
 * backend: before the first edit, and until dismissed (once per origin). A
 * note, not an alert: it needs no interruption.
 */
export function StorageNotice({ onDownload }: Props) {
  const [dismissed, setDismissed] = useState(storageNoticeDismissed);
  if (dismissed) return null;
  return (
    <div className="storage-notice" role="note" aria-label="Where this notebook is saved">
      <span className="storage-notice-text">{STORAGE_NOTE}</span>
      <button type="button" className="push-button" onClick={onDownload}>
        Download a Copy
      </button>
      <button
        type="button"
        className="storage-notice-dismiss"
        aria-label="Dismiss"
        title="Dismiss"
        onClick={() => {
          dismissStorageNotice();
          setDismissed(true);
        }}
      >
        ×
      </button>
    </div>
  );
}
