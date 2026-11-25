import type { Backend } from '../lib/backends';
import { NotebookIcon } from './Icons';
import { Onboarding } from './Onboarding';
import { StartScreen } from './StartScreen';

type Props = {
  backend?: Backend;
  connecting: boolean;
  onNew(): void;
  /** Copies the example notebooks into the folder and opens the first (#414). */
  onOpenExamples?(): void;
  /** Connect to a Server… (the connection sheet), and, with a backend, Onboarding's Change…. */
  onConnect(): void;
  /** The start screen's Try a Notebook (#815): the in-browser backend and the sample. */
  onTry(): void;
  /** The start screen's Open a Notebook…, given a file that is a notebook. */
  onOpenFile(file: File): void;
  /**
   * The Apple apps always arrive with a connection, so they never show the
   * start screen; after a failed connection the sheet is up over a plain
   * Connect… button, as before.
   */
  native?: boolean;
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
  onOpenExamples,
  onConnect,
  onTry,
  onOpenFile,
  native = false,
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
        <p className="subtle connecting">Connecting…</p>
      ) : backend ? (
        <>
          <p className="subtle">Choose a notebook in the sidebar, or start a new one.</p>
          <button className="push-button primary" onClick={onNew}>
            <NotebookIcon width={16} height={16} /> New Notebook
          </button>
          {onOpenExamples && (
            <button className="push-button examples-button" onClick={onOpenExamples}>
              Open Example Notebooks
            </button>
          )}
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
      ) : native ? (
        <>
          <p className="subtle">Connect to a Ganymede server or run kernels in this browser.</p>
          <button className="push-button primary" onClick={onConnect}>
            Connect…
          </button>
        </>
      ) : (
        <StartScreen onTry={onTry} onOpen={onOpenFile} onConnect={onConnect} />
      )}
    </div>
  );
}
