import { useEffect, useRef, useState } from 'react';
import {
  type HostDefaults,
  type HostGrant,
  type HostGrants,
  describePaths,
  pathsText,
  textPaths,
} from '../lib/host-grants';

type Props = {
  /** The notebook's file name, for the title. */
  name: string;
  /** What the notebook asks for (`metadata.ganymede.host.wants`). */
  wants: string[];
  load(): Promise<HostGrants>;
  save(grant: HostGrant): Promise<HostGrants>;
  onClose(): void;
};

/** One of the grant's three keys, as the sheet edits it. */
type Paths = { own: boolean; text: string };

const WANT_LABELS: Record<string, string> = {
  'notebooks.list': 'list notebooks',
  'notebooks.read': 'read notebooks',
  'notebooks.search': 'search notebooks',
  'notebooks.results': 'read other notebooks’ results',
  'notebooks.run': 'run other notebooks',
  'self.add': 'add cells to itself',
  'self.edit': 'edit its own cells',
  'self.delete': 'delete its own cells',
};

function paths(own: string[] | undefined, fallback: string[]): Paths {
  return { own: own !== undefined, text: pathsText(own ?? fallback) };
}

/**
 * Notebook Access: what this notebook's cells may ask the server for
 * through `jupyter.host()` (ganymede docs/host-api.md). Each of read,
 * run and editing its own cells either follows the server's `[host]`
 * default or is set for this notebook alone; Save stores the notebook's
 * grant, as `ganymede grant` does.
 */
export function HostAccessSheet({ name, wants, load, save, onClose }: Props) {
  const [defaults, setDefaults] = useState<HostDefaults>();
  const [read, setRead] = useState<Paths>({ own: false, text: '' });
  const [run, setRun] = useState<Paths>({ own: false, text: '' });
  const [editOwn, setEditOwn] = useState(false);
  const [edit, setEdit] = useState(true);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  // Once, when the sheet opens: the app re-renders it with new closures,
  // and loading again would drop the edits.
  const loadOnce = useRef(load);
  useEffect(() => {
    let cancelled = false;
    loadOnce.current().then(
      ({ grant, defaults }) => {
        if (cancelled) return;
        setDefaults(defaults);
        setRead(paths(grant.read, defaults.read));
        setRun(paths(grant.run, defaults.run));
        setEditOwn(grant.edit_self !== undefined);
        setEdit(grant.edit_self ?? defaults.edit_self);
      },
      e => !cancelled && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (defaults) first.current?.focus();
  }, [defaults]);

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
    const grant: HostGrant = {};
    if (read.own) grant.read = textPaths(read.text);
    if (run.own) grant.run = textPaths(run.text);
    if (editOwn) grant.edit_self = edit;
    setSaving(true);
    setError(undefined);
    try {
      await save(grant);
      onClose();
    } catch (err) {
      setError(`Not saved: ${err instanceof Error ? err.message : err}`);
      setSaving(false);
    }
  };

  const asked = wants.map(w => WANT_LABELS[w] ?? w);

  const pathSection = (
    key: 'read' | 'run',
    title: string,
    value: Paths,
    set: (p: Paths) => void,
    hint: string,
  ) =>
    defaults && (
      <section>
        <h3>{title}</h3>
        <div className="form-rows">
          <label className="check-row">
            <input
              ref={key === 'read' ? first : undefined}
              type="checkbox"
              checked={!value.own}
              onChange={e =>
                set({
                  own: !e.target.checked,
                  text: e.target.checked ? pathsText(defaults[key]) : value.text,
                })
              }
            />
            <span>Use the server’s default: {describePaths(defaults[key])}</span>
          </label>
          {value.own && (
            <textarea
              aria-label={`${title}, one folder or notebook per line`}
              rows={3}
              spellCheck={false}
              value={value.text}
              onChange={e => set({ own: true, text: e.target.value })}
            />
          )}
          <p className="hint">{hint}</p>
        </div>
      </section>
    );

  return (
    // No close on a backdrop click, as in the other sheets: a selection
    // dragged out of a field would end there and drop the edits.
    <div className="sheet-backdrop">
      <form
        className="sheet host-access-sheet"
        role="dialog"
        aria-labelledby="host-access-title"
        onSubmit={e => void submit(e)}
      >
        <h2 id="host-access-title">Access for {name}</h2>
        <p className="hint">
          What this notebook’s cells may ask the server for, through <code>jupyter.host()</code>.
          Its cells hold no token, so this is all they get.
        </p>
        {asked.length > 0 && (
          <p className="host-wants" role="note">
            This notebook asks to {asked.join(', ')}. Asking grants nothing until you allow it here.
          </p>
        )}
        {!defaults && !error && <p role="status">Loading…</p>}
        {pathSection(
          'read',
          'Read',
          read,
          setRead,
          'Folders and notebooks it may list, read, search and take results from. / is every notebook; with none, only itself.',
        )}
        {defaults && (
          <section>
            <h3>Its own cells</h3>
            <div className="form-rows">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={!editOwn}
                  onChange={e => {
                    setEditOwn(!e.target.checked);
                    if (e.target.checked) setEdit(defaults.edit_self);
                  }}
                />
                <span>Use the server’s default: {defaults.edit_self ? 'on' : 'off'}</span>
              </label>
              {editOwn && (
                <label className="check-row">
                  <input type="checkbox" checked={edit} onChange={e => setEdit(e.target.checked)} />
                  <span>Add, edit and delete its own cells</span>
                </label>
              )}
            </div>
          </section>
        )}
        {pathSection(
          'run',
          'Run',
          run,
          setRun,
          'Notebooks it may run in a fresh kernel, which gets only what both notebooks may read and run. / is every notebook.',
        )}
        {error && <p className="sheet-error">{error}</p>}
        <div className="sheet-buttons">
          <button type="button" className="push-button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="push-button primary" disabled={!defaults || saving}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
