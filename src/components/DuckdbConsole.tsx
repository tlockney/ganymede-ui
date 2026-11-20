import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import { syntaxHighlighting } from '@codemirror/language';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { jupyterHighlightStyle } from '@jupyterlab/codemirror';
import { Widget } from '@lumino/widgets';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import type { Backend } from '../lib/backends';
import {
  CONSOLE_NOTEBOOK,
  ConsoleSession,
  History,
  consoleNotebook,
  endsStatement,
  statementsOf,
  type Ran,
} from '../lib/duckdb-console';
import {
  MAX_STATEMENTS,
  clearConsoles,
  listedConsoles,
  loadConsoles,
  releaseConsole,
  saveConsole,
  useConsoles,
} from '../lib/console-recents';
import { kernelModules } from '../lib/kernel-modules';
import { messageOf } from '../lib/problems';
import { recentsKey } from '../lib/recents';
import { freePath, sampleKernel } from '../lib/sample';
import { RenderedTable, TABLE_MIME, type TableResource } from '../lib/table-output';

type Props = {
  backend: Backend;
  /** The window's folder, a contents path; '' for the root. */
  folder: string;
  /** This console's record in the recent consoles (#735): the statements it ran are kept under it. */
  id: string;
  /** The console's name, which the header shows and renames. */
  name: string;
  onRename(name: string): void;
  /** Opens another recent console, by its id. */
  onOpenConsole(id: string): void;
  /** Opens the notebook Export to Notebook wrote. */
  onOpenNotebook(path: string): void;
};

type Entry = {
  id: number;
  sql: string;
  /** `restored` is a statement kept from an earlier session, not yet run in this one (#735). */
  state: 'running' | 'done' | 'error' | 'restored';
  ran?: Ran;
  error?: string;
};

/** The Recent menu's choice that clears the list. */
const CLEAR = '\u0000clear';

const count = (n: number) => n.toLocaleString('en-US');

// lang-sql loads on demand, as JupyterLab's own SQL language does; until it
// has, the console's SQL shows as plain text.
const sqlHighlight = () => import('../lib/sql-highlight');

/** A statement as typed, highlighted as DuckDB SQL (#708). */
function SqlText({ sql }: { sql: string }) {
  const host = useRef<HTMLPreElement>(null);
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    el.textContent = sql;
    let gone = false;
    void sqlHighlight().then(
      m => {
        if (!gone) m.highlightSqlInto(el, sql);
      },
      () => {},
    );
    return () => {
      gone = true;
    };
  }, [sql]);
  return <pre className="duck-sql" ref={host} />;
}

/** One statement's rows in the table renderer: sort, page and filter as in a notebook. */
function ResultTable({ resource }: { resource: TableResource }) {
  const host = useRef<HTMLDivElement>(null);
  // A layout effect, so the widget goes while React has not yet removed
  // its node: Lumino refuses to detach a widget whose node is gone.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el) return;
    const widget = new RenderedTable();
    void widget.renderModel({
      trusted: false,
      data: { [TABLE_MIME]: resource as never },
      metadata: {},
      setData() {},
    } satisfies IRenderMime.IMimeModel);
    Widget.attach(widget, el);
    return () => widget.dispose();
  }, [resource]);
  return <div className="duck-table" ref={host} />;
}

/**
 * A DuckDB prompt in the page (#679): SQL in, a scrollback of statements
 * with their rows. One DuckDB engine for as long as the console is open;
 * its tables stay between statements, and it ends with the console.
 */
export function DuckdbConsole({
  backend,
  folder,
  id,
  name,
  onRename,
  onOpenConsole,
  onOpenNotebook,
}: Props) {
  const key = recentsKey(backend.config);
  // A console opened again shows its saved statements, with no results.
  const [entries, setEntries] = useState<Entry[]>(() =>
    (loadConsoles(key).find(r => r.id === id)?.statements ?? []).map((sql, i) => ({
      id: i + 1,
      sql,
      state: 'restored' as const,
    })),
  );
  /** What this console's record holds: the saved statements, then those that ran since. */
  const saved = useRef<string[]>(entries.map(e => e.sql));
  const [editing, setEditing] = useState<string>();
  /** The name's edit has ended (Enter or Esc); the blur that follows ends nothing more. */
  const editDone = useRef(true);
  const endEdit = (commit: boolean) => {
    if (editDone.current || editing === undefined) return;
    editDone.current = true;
    // An empty name keeps the old one.
    const next = editing.trim();
    setEditing(undefined);
    if (commit && next && next !== name) onRename(next);
  };
  const records = useConsoles(backend);
  const recent = listedConsoles(records).filter(r => r.id !== id);
  // A Clear Recent Consoles removes this console's record too: what it has
  // saved is gone, and its later statements start a record of their own.
  // Closed unused and unnamed, it gives its name back.
  // A Mac tab's page is torn down without its effects' cleanups: `pagehide`
  // is what it gets. A page that comes back from the back/forward cache
  // reserves its name again.
  const released = useRef(false);
  useEffect(() => {
    const release = () => {
      released.current = true;
      releaseConsole(key, id);
    };
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) released.current = false;
    };
    window.addEventListener('pagehide', release);
    window.addEventListener('pageshow', back);
    return () => {
      window.removeEventListener('pagehide', release);
      window.removeEventListener('pageshow', back);
      releaseConsole(key, id);
    };
  }, [key, id]);
  const hadRecord = useRef(false);
  useEffect(() => {
    if (released.current) return;
    if (records.some(r => r.id === id)) hadRecord.current = true;
    else if (hadRecord.current) {
      hadRecord.current = false;
      saved.current = [];
      // Its name stays taken while it is open.
      saveConsole(key, {
        id,
        name: nameNow.current,
        folder: folderNow.current,
        statements: [],
        used: Date.now(),
      });
    }
  }, [records, id, key]);
  const [starting, setStarting] = useState(true);
  const [fatal, setFatal] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const [ranCount, setRanCount] = useState(0);
  const session = useRef<Promise<ConsoleSession>>(undefined);
  const live = useRef<ConsoleSession | undefined>(undefined);
  const history = useRef(new History());
  useState(() => entries.forEach(e => history.current.add(e.sql)));
  const input = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const nextId = useRef(entries.length + 1);

  // The folder as it is now: a rename or move of it keeps the console.
  const folderNow = useRef(folder);
  const nameNow = useRef(name);
  nameNow.current = name;
  /** Keeps what ran under this console's record, which comes to the top. */
  const remember = useCallback(
    (sql: string) => {
      saved.current = [...saved.current, sql].slice(-MAX_STATEMENTS);
      saveConsole(key, {
        id,
        name: nameNow.current,
        folder: folderNow.current,
        statements: saved.current,
        used: Date.now(),
      });
    },
    [key, id],
  );
  useEffect(() => {
    folderNow.current = folder;
    void session.current?.then(
      s => s.moveFolder(folder),
      () => {},
    );
  }, [folder]);

  // One engine for the console: started now, ended on unmount.
  useEffect(() => {
    let gone = false;
    const started = (async () => {
      const { openEngine } = await import('../lib/parquet');
      return new ConsoleSession(await openEngine(kernelModules), backend, folderNow.current);
    })();
    session.current = started;
    started.then(
      s => {
        // One that started after the console closed is closed by the cleanup.
        if (!gone) {
          live.current = s;
          setStarting(false);
        }
      },
      e => {
        if (!gone) setFatal(`DuckDB didn’t start: ${messageOf(e)}`);
      },
    );
    return () => {
      gone = true;
      live.current = undefined;
      session.current = undefined;
      // A started session closes here; one still starting, above.
      void started.then(
        s => s.close().catch(() => {}),
        () => {},
      );
    };
  }, [backend]);

  const update = useCallback((id: number, patch: Partial<Entry>) => {
    setEntries(all => all.map(e => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  /** Runs what was typed: each statement in it, in order, stopping at the first error. */
  const submit = useCallback(
    async (text: string) => {
      const statements = statementsOf(text);
      if (statements.length === 0) return;
      history.current.add(text);
      const mine = statements.map(sql => ({ id: nextId.current++, sql }));
      setEntries(all => [...all, ...mine.map(m => ({ ...m, state: 'running' as const }))]);
      const started = session.current;
      try {
        const s = await started;
        if (!s) throw new Error('The console is closed.');
        // The whole input is one turn on the session: another input waits for it.
        await s.runInput(statements, (i, outcome) => {
          if (session.current !== started) return;
          const entryId = mine[i]!.id;
          if ('ran' in outcome) {
            setRanCount(s.ran.length);
            update(entryId, { state: 'done', ran: outcome.ran });
            remember(statements[i]!);
          } else {
            update(entryId, { state: 'error', error: messageOf(outcome.error) });
            // The rest of the input is dropped, as a script stops at its error.
            const rest = new Set(mine.slice(i + 1).map(r => r.id));
            setEntries(all => all.filter(x => !rest.has(x.id)));
          }
        });
      } catch (e) {
        // The engine never started, or the console closed.
        if (session.current !== started) return;
        const gone = new Set(mine.map(m => m.id));
        setEntries(all =>
          all.map(x => (gone.has(x.id) ? { ...x, state: 'error', error: messageOf(e) } : x)),
        );
      }
    },
    [update, remember],
  );
  const submitRef = useRef(submit);
  submitRef.current = submit;

  /** Runs the statements kept from an earlier session, in order, on this engine. */
  const runAgain = useCallback(async () => {
    const mine = entries.filter(e => e.state === 'restored');
    if (mine.length === 0) return;
    const ids = new Set(mine.map(m => m.id));
    setEntries(all => all.map(e => (ids.has(e.id) ? { ...e, state: 'running' } : e)));
    const started = session.current;
    try {
      const s = await started;
      if (!s) throw new Error('The console is closed.');
      await s.runInput(
        mine.map(m => m.sql),
        (i, outcome) => {
          if (session.current !== started) return;
          const entryId = mine[i]!.id;
          if ('ran' in outcome) {
            setRanCount(s.ran.length);
            update(entryId, { state: 'done', ran: outcome.ran });
          } else {
            update(entryId, { state: 'error', error: messageOf(outcome.error) });
            // The rest didn't run: they stay to run again.
            const rest = new Set(mine.slice(i + 1).map(r => r.id));
            setEntries(all => all.map(x => (rest.has(x.id) ? { ...x, state: 'restored' } : x)));
          }
        },
      );
    } catch (e) {
      if (session.current !== started) return;
      setEntries(all =>
        all.map(x => (ids.has(x.id) ? { ...x, state: 'error', error: messageOf(e) } : x)),
      );
    }
  }, [entries, update]);

  // The input: CodeMirror, with Enter, Shift-Enter and the history keys.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const text = (v: EditorView) => v.state.doc.toString();
    // The console's own replacing of the input, which is not an edit by hand.
    const walked = Annotation.define<boolean>();
    const set = (v: EditorView, doc: string) =>
      v.dispatch({
        annotations: walked.of(true),
        changes: { from: 0, to: v.state.doc.length, insert: doc },
        selection: { anchor: doc.length },
      });
    const run = (v: EditorView) => {
      const t = text(v);
      // Nothing to run (blank, or only comments): keep what was typed.
      if (statementsOf(t).length === 0) return true;
      set(v, '');
      void submitRef.current(t);
      return true;
    };
    const language = new Compartment();
    const v = new EditorView({
      parent: el,
      state: EditorState.create({
        extensions: [
          EditorView.lineWrapping,
          language.of([]),
          syntaxHighlighting(jupyterHighlightStyle),
          placeholder('select 42; — Enter runs a line ending in ;, Shift-Enter runs'),
          EditorView.contentAttributes.of({ 'aria-label': 'SQL', spellcheck: 'false' }),
          keymap.of([
            {
              key: 'Enter',
              run: v => {
                if (endsStatement(text(v))) return run(v);
                v.dispatch(v.state.replaceSelection('\n'), { scrollIntoView: true });
                return true;
              },
            },
            { key: 'Shift-Enter', run },
            {
              key: 'ArrowUp',
              run: v => {
                const sel = v.state.selection.main;
                if (!sel.empty || v.state.doc.lineAt(sel.head).number !== 1) return false;
                const older = history.current.previous(text(v));
                if (older === undefined) return false;
                set(v, older);
                return true;
              },
            },
            {
              key: 'ArrowDown',
              run: v => {
                const sel = v.state.selection.main;
                if (!sel.empty || v.state.doc.lineAt(sel.head).number !== v.state.doc.lines) {
                  return false;
                }
                const newer = history.current.next();
                if (newer === undefined) return false;
                set(v, newer);
                return true;
              },
            },
          ]),
          // Any edit by hand (typing, Backspace, Delete, a paste, a cut) starts the history walk over.
          EditorView.updateListener.of(u => {
            if (u.docChanged && !u.transactions.some(t => t.annotation(walked))) {
              history.current.stop();
            }
          }),
        ],
      }),
    });
    view.current = v;
    v.focus();
    let gone = false;
    void sqlHighlight().then(
      m => {
        if (!gone) v.dispatch({ effects: language.reconfigure(m.duckdbSql()) });
      },
      () => {},
    );
    return () => {
      gone = true;
      view.current = undefined;
      v.destroy();
    };
  }, []);

  // The newest statement comes into view.
  useEffect(() => {
    log.current?.scrollTo?.({ top: log.current.scrollHeight });
  }, [entries]);

  const exportNotebook = useCallback(async () => {
    const s = live.current;
    if (!s) return;
    setExporting(true);
    setNotice(undefined);
    try {
      const { contents, kernelspecs } = backend.services;
      const path = await freePath(contents, folder, CONSOLE_NOTEBOOK);
      await contents.save(path, {
        type: 'notebook',
        format: 'json',
        content: consoleNotebook(s, folder, sampleKernel(kernelspecs.specs)),
      });
      onOpenNotebook(path);
    } catch (e) {
      setNotice(`Couldn’t export a notebook: ${messageOf(e)}`);
    } finally {
      setExporting(false);
    }
  }, [backend, folder, onOpenNotebook]);

  return (
    <div className="duck-console">
      <div className="data-bar">
        {editing === undefined ? (
          <button
            className="duck-name"
            title="Rename this console"
            onClick={() => {
              editDone.current = false;
              setEditing(name);
            }}
          >
            {name}
          </button>
        ) : (
          <input
            className="data-filter duck-rename"
            aria-label="Console name"
            autoFocus
            value={editing}
            maxLength={80}
            onChange={e => setEditing(e.target.value)}
            onFocus={e => e.target.select()}
            onKeyDown={e => {
              if (e.key === 'Escape') endEdit(false);
              else if (e.key === 'Enter') endEdit(true);
            }}
            onBlur={() => endEdit(true)}
          />
        )}
        <span className="subtle duck-folder">{folder ? `in ${folder}` : 'in the root folder'}</span>
        <span className="data-spacer" />
        {recent.length > 0 && (
          <select
            className="data-filter duck-recent"
            aria-label="Recent consoles"
            value=""
            onChange={e => {
              const choice = e.target.value;
              if (choice === CLEAR) clearConsoles(key);
              else if (choice) onOpenConsole(choice);
            }}
          >
            <option value="">Recent…</option>
            {recent.map(r => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.folder || '/'}
              </option>
            ))}
            <option value={CLEAR}>Clear Recent Consoles</option>
          </select>
        )}
        {entries.some(e => e.state === 'restored') && (
          <button
            className="push-button"
            disabled={starting || !!fatal}
            onClick={() => void runAgain()}
          >
            Run All Again
          </button>
        )}
        <button
          className="push-button"
          disabled={exporting || starting || ranCount === 0}
          onClick={() => void exportNotebook()}
        >
          Export to Notebook
        </button>
      </div>
      {fatal && (
        <p className="data-error" role="alert">
          {fatal}
        </p>
      )}
      {notice && (
        <p className="data-error" role="alert">
          {notice}
        </p>
      )}
      {starting && !fatal && <p className="subtle data-loading">Starting DuckDB…</p>}
      <div className="duck-log" ref={log} aria-live="polite">
        {entries.map(e => (
          <section className="duck-entry" key={e.id} data-state={e.state}>
            <SqlText sql={e.sql} />
            {e.state === 'running' && <p className="subtle duck-status">Running…</p>}
            {e.state === 'restored' && (
              <p className="subtle duck-status">Not run in this session</p>
            )}
            {e.state === 'error' && (
              <p className="duck-error" role="alert">
                {e.error}
              </p>
            )}
            {e.state === 'done' && e.ran && (
              <>
                <p className="subtle duck-status">
                  {e.ran.shown
                    ? e.ran.shown.more
                      ? `more than ${count(e.ran.shown.resource.data?.length ?? 0)} rows`
                      : `${count(e.ran.shown.total)} ${e.ran.shown.total === 1 ? 'row' : 'rows'}`
                    : e.ran.message}
                  {` · ${e.ran.ms} ms`}
                  {e.ran.files.length > 0 && ` · read ${e.ran.files.join(', ')}`}
                  {e.ran.shown &&
                    e.ran.shown.total > (e.ran.shown.resource.data?.length ?? 0) &&
                    ` · showing the first ${count(e.ran.shown.resource.data?.length ?? 0)}`}
                </p>
                {e.ran.shown && e.ran.shown.resource.schema?.fields?.length ? (
                  <ResultTable resource={e.ran.shown.resource} />
                ) : null}
              </>
            )}
          </section>
        ))}
      </div>
      <div className="duck-input" ref={input} />
    </div>
  );
}
