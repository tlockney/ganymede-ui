import { useId, useRef, useState } from 'react';
import { isNotebookFile, parseNotebook } from '../lib/file-drop';
import { STORAGE_NOTE } from '../lib/storage-notice';

type Props = {
  /** Try a Notebook: the in-browser backend, with the sample. */
  onTry(): void;
  /** Open a Notebook…: a notebook file from this device, already read as one. */
  onOpen(file: File): void;
  /** Connect to a Server…: the connection sheet. */
  onConnect(): void;
  /** Why the last start failed, shown here. */
  error?: string;
};

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * What a first visit shows when nothing is connected (#815): three ways in.
 * The server's address, token and kernel placement stay in the connection
 * sheet behind Connect to a Server…. Focus isn't moved on mount: Tab brings
 * it to Try a Notebook first.
 */
export function StartScreen({ onTry, onOpen, onConnect, error }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [openError, setOpenError] = useState<string>();
  const ids = [useId(), useId(), useId()];

  const pick = async (file: File | undefined) => {
    // So the same file can be picked again after a failure.
    if (input.current) input.current.value = '';
    if (!file) return;
    try {
      if (!isNotebookFile(file)) {
        throw new Error('it isn’t a notebook (the name doesn’t end in .ipynb)');
      }
      parseNotebook(await file.text());
    } catch (e) {
      setOpenError(`Couldn’t open “${file.name}”: ${messageOf(e)}`);
      return;
    }
    setOpenError(undefined);
    onOpen(file);
  };

  const shown = openError ?? error;

  return (
    <div className="start-screen">
      <div className="start-actions">
        <button
          type="button"
          className="push-button primary"
          aria-describedby={ids[0]}
          onClick={() => {
            setOpenError(undefined);
            onTry();
          }}
        >
          Try a Notebook
        </button>
        <p id={ids[0]} className="start-detail">
          A short tour that runs here, with no server.
        </p>
        <button
          type="button"
          className="push-button"
          aria-describedby={ids[1]}
          onClick={() => input.current?.click()}
        >
          Open a Notebook…
        </button>
        <p id={ids[1]} className="start-detail">
          A .ipynb file from this device.
        </p>
        <p className="start-note">{STORAGE_NOTE}</p>
        <button
          type="button"
          className="push-button"
          aria-describedby={ids[2]}
          onClick={() => {
            setOpenError(undefined);
            onConnect();
          }}
        >
          Connect to a Server…
        </button>
        <p id={ids[2]} className="start-detail">
          Notebooks and kernels stay on a Ganymede server.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        tabIndex={-1}
        accept=".ipynb,application/x-ipynb+json"
        aria-label="Notebook file"
        onChange={e => void pick(e.target.files?.[0])}
      />
      {shown && (
        <p className="sheet-error start-error" role="alert">
          {shown}
        </p>
      )}
    </div>
  );
}
