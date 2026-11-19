import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
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
import { kernelModules } from '../lib/kernel-modules';
import { messageOf } from '../lib/problems';
import { freePath, sampleKernel } from '../lib/sample';
import { RenderedTable, TABLE_MIME, type TableResource } from '../lib/table-output';

type Props = {
  backend: Backend;
  /** The window's folder, a contents path; '' for the root. */
  folder: string;
  /** Opens the notebook Export to Notebook wrote. */
  onOpenNotebook(path: string): void;
};

type Entry = {
  id: number;
  sql: string;
  state: 'running' | 'done' | 'error';
  ran?: Ran;
  error?: string;
};

const count = (n: number) => n.toLocaleString('en-US');

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
export function DuckdbConsole({ backend, folder, onOpenNotebook }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [starting, setStarting] = useState(true);
  const [fatal, setFatal] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const [ranCount, setRanCount] = useState(0);
  const session = useRef<Promise<ConsoleSession>>(undefined);
  const live = useRef<ConsoleSession | undefined>(undefined);
  const history = useRef(new History());
  const input = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | undefined>(undefined);
  const log = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);

  // One engine for the console: started now, ended on unmount.
  useEffect(() => {
    let gone = false;
    const started = (async () => {
      const { openEngine } = await import('../lib/parquet');
      return new ConsoleSession(await openEngine(kernelModules), backend, folder);
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
  }, [backend, folder]);

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
      for (const m of mine) {
        try {
          const s = await started;
          if (!s) throw new Error('The console is closed.');
          const ran = await s.run(m.sql);
          if (session.current !== started) return;
          setRanCount(s.ran.length);
          update(m.id, { state: 'done', ran });
        } catch (e) {
          if (session.current !== started) return;
          update(m.id, { state: 'error', error: messageOf(e) });
          // The rest of the input is dropped, as a script stops at its error.
          const rest = new Set(mine.slice(mine.indexOf(m) + 1).map(r => r.id));
          setEntries(all => all.filter(x => !rest.has(x.id)));
          return;
        }
      }
    },
    [update],
  );
  const submitRef = useRef(submit);
  submitRef.current = submit;

  // The input: CodeMirror, with Enter, Shift-Enter and the history keys.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const text = (v: EditorView) => v.state.doc.toString();
    const set = (v: EditorView, doc: string) =>
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: doc },
        selection: { anchor: doc.length },
      });
    const run = (v: EditorView) => {
      const t = text(v);
      if (t.trim() === '') return true;
      set(v, '');
      void submitRef.current(t);
      return true;
    };
    const v = new EditorView({
      parent: el,
      state: EditorState.create({
        extensions: [
          EditorView.lineWrapping,
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
          // Typing starts the history walk over.
          EditorView.updateListener.of(u => {
            if (u.docChanged && u.transactions.every(t => t.isUserEvent('input'))) {
              history.current.stop();
            }
          }),
        ],
      }),
    });
    view.current = v;
    v.focus();
    return () => {
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
        <span className="data-name" title={folder || '/'}>
          DuckDB Console
        </span>
        <span className="subtle duck-folder">{folder ? `in ${folder}` : 'in the root folder'}</span>
        <span className="data-spacer" />
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
            <pre className="duck-sql">{e.sql}</pre>
            {e.state === 'running' && <p className="subtle duck-status">Running…</p>}
            {e.state === 'error' && (
              <p className="duck-error" role="alert">
                {e.error}
              </p>
            )}
            {e.state === 'done' && e.ran && (
              <>
                <p className="subtle duck-status">
                  {e.ran.shown
                    ? `${count(e.ran.shown.total)} ${e.ran.shown.total === 1 ? 'row' : 'rows'}`
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
