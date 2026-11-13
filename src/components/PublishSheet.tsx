import { useEffect, useRef, useState } from 'react';
import { type CodeMode, type PublishOptions, defaultOptions } from '../lib/publish';

type Props = {
  /** The notebook's file name, for the title. */
  name: string;
  /** Saves unsaved edits, makes the page and hands it over as a download. */
  publish(opts: PublishOptions): Promise<void>;
  onClose(): void;
};

const CODE_MODES: readonly [CodeMode, string][] = [
  ['folded', 'Folded under each result'],
  ['shown', 'Shown'],
  ['hidden', 'Hidden'],
];

/**
 * Publish as Web Page (#563): the options `ganymede nb publish` takes,
 * then one self-contained `.html` file through the download path (a save
 * panel on the Mac, the share sheet on iPad and iPhone).
 */
export function PublishSheet({ name, publish, onClose }: Props) {
  const [opts, setOpts] = useState<PublishOptions>(() => defaultOptions());
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLSelectElement>(null);

  useEffect(() => first.current?.focus(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await publish(opts);
      onClose();
    } catch (err) {
      setError(`Not published: ${err instanceof Error ? err.message : err}`);
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop">
      <form
        className="sheet publish-sheet"
        role="dialog"
        aria-labelledby="publish-title"
        onSubmit={e => void submit(e)}
      >
        <h2 id="publish-title">Publish {name}</h2>
        <p className="hint">
          One web page to read and share: prose, charts and tables, light and dark. It runs no
          notebook code and loads nothing from the network. Your home folder, the server’s folder
          and its token are replaced wherever they appear. Unsaved edits are saved first.
        </p>
        <div className="form-rows">
          <label>
            <span>Code</span>
            <select
              ref={first}
              value={opts.code}
              onChange={e => {
                const code = e.target.value as CodeMode;
                // The copy holds the code: off with hidden code, as the CLI.
                setOpts({ ...opts, code, copy: code !== 'hidden' });
              }}
            >
              {CODE_MODES.map(([mode, label]) => (
                <option key={mode} value={mode}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Byline</span>
            <input
              type="text"
              aria-label="Byline, the line under the title"
              placeholder="None"
              value={opts.byline}
              onChange={e => setOpts({ ...opts, byline: e.target.value })}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={opts.copy}
              onChange={e => setOpts({ ...opts, copy: e.target.checked })}
            />
            <span>Download notebook button</span>
          </label>
          <p className="hint">
            The page carries a copy of the notebook, with the same replacements and without its
            metadata or recorded parameters.
            {opts.code === 'hidden' && opts.copy && ' The copy includes the code you hid.'}
          </p>
        </div>
        {busy && <p role="status">Publishing…</p>}
        {error && <p className="sheet-error">{error}</p>}
        <div className="sheet-buttons">
          <button type="button" className="push-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="push-button primary" disabled={busy}>
            Publish
          </button>
        </div>
      </form>
    </div>
  );
}
