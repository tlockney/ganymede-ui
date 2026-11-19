import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rendererFactory as jsonRenderer } from '@jupyterlab/json-extension';
import '@jupyterlab/json-extension/style/index.js';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';
import type { Backend } from '../lib/backends';
import {
  type DataKind,
  MAX_JSON_BYTES,
  MAX_PARQUET_BYTES,
  MAX_TEXT_BYTES,
  dataKind,
  filterTable,
  notebookDirFor,
  notebookFor,
  notebookNameFor,
  parseDelimited,
  tableOf,
} from '../lib/data-files';
import { readBytes, textOf } from '../lib/data-read';
import { kernelModules } from '../lib/kernel-modules';
import { messageOf } from '../lib/problems';
import { freePath, sampleKernel } from '../lib/sample';
import { RenderedTable, TABLE_MIME, type TableResource } from '../lib/table-output';

type Props = {
  backend: Backend;
  path: string;
  /** Opens the file in the text editor; without it (a browser has none) no Open as Text. */
  onOpenAsText?(): void;
  /** Opens the notebook "New Notebook from File" wrote. */
  onOpenNotebook(path: string): void;
};

type Loaded =
  | { kind: 'table'; resource: TableResource; note?: string; schema?: string[] }
  | { kind: 'json'; value: unknown }
  | { kind: 'text'; text: string };

const rows = (n: number) => n.toLocaleString('en-US');

/** What the pane shows for a file: its rows or tree, or why it can't. */
async function load(
  backend: Backend,
  path: string,
  kind: DataKind,
): Promise<{ data: Loaded; close?: () => void }> {
  const name = path.split('/').pop() ?? path;
  if (kind === 'csv' || kind === 'tsv') {
    const { text, truncated } = textOf(await readBytes(backend, path, MAX_TEXT_BYTES));
    const parsed = parseDelimited(text, kind === 'csv' ? ',' : '\t');
    const cut = parsed.truncated || truncated;
    return {
      data: {
        kind: 'table',
        resource: tableOf(parsed, name),
        note: cut ? `Showing the first ${rows(parsed.rows.length)} rows.` : undefined,
      },
    };
  }
  if (kind === 'json') {
    const { bytes } = await readBytes(backend, path, MAX_JSON_BYTES, true);
    const text = new TextDecoder('utf-8').decode(bytes);
    try {
      return { data: { kind: 'json', value: JSON.parse(text) } };
    } catch (e) {
      throw new Error(`This isn’t valid JSON: ${messageOf(e)}`, { cause: e });
    }
  }
  const { bytes } = await readBytes(backend, path, MAX_PARQUET_BYTES, true);
  const { openEngine, parquetTable } = await import('../lib/parquet');
  const engine = await openEngine(kernelModules());
  try {
    const t = await parquetTable(engine, bytes, name);
    const shown = t.resource.data?.length ?? 0;
    return {
      data: {
        kind: 'table',
        resource: t.resource,
        schema: t.schema.map(c => `${c.name}: ${c.type}`),
        note:
          t.total > shown
            ? `Showing the first ${rows(shown)} of ${rows(t.total)} rows.`
            : undefined,
      },
      close: () => void Promise.resolve(engine.close?.()).catch(() => {}),
    };
  } catch (e) {
    void Promise.resolve(engine.close?.()).catch(() => {});
    throw e;
  }
}

function modelOf(mime: string, data: unknown): IRenderMime.IMimeModel {
  return {
    trusted: false,
    data: { [mime]: data as never },
    metadata: {},
    setData() {},
  };
}

/**
 * A data file in the page instead of a text editor (#671): CSV and TSV as
 * a table you sort, page and filter, JSON as a tree, Parquet through
 * DuckDB. Read-only.
 */
export function DataPane({ backend, path, onOpenAsText, onOpenNotebook }: Props) {
  const kind = dataKind(path)!;
  const name = path.split('/').pop() ?? path;
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [query, setQuery] = useState('');
  const [making, setMaking] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const table = useRef<RenderedTable | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    let close: (() => void) | undefined;
    setLoaded(undefined);
    setError(undefined);
    setQuery('');
    load(backend, path, kind).then(
      r => {
        if (cancelled) r.close?.();
        else {
          close = r.close;
          setLoaded(r.data);
        }
      },
      (e: unknown) => {
        if (!cancelled) setError(messageOf(e));
      },
    );
    return () => {
      cancelled = true;
      close?.();
    };
  }, [backend, path, kind]);

  // The widget for what loaded; a new filter redraws the table only.
  const data = loaded?.kind === 'table' ? loaded.resource : undefined;
  // A layout effect, so it disposes the widget while React has not yet
  // removed its node: Lumino refuses to detach a widget whose node is gone.
  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !loaded || loaded.kind === 'text') return;
    let widget: Widget;
    if (loaded.kind === 'table') {
      const t = new RenderedTable();
      table.current = t;
      widget = t;
    } else if (loaded.value !== null && typeof loaded.value === 'object') {
      widget = jsonRenderer.createRenderer({
        mimeType: 'application/json',
        sanitizer: { sanitize: (s: string) => s },
        resolver: null,
        linkHandler: null,
        latexTypesetter: null,
        translator: undefined,
      } as unknown as IRenderMime.IRendererOptions) as unknown as Widget;
      void (widget as unknown as IRenderMime.IRenderer).renderModel(
        modelOf('application/json', loaded.value),
      );
    } else {
      return;
    }
    el.textContent = '';
    Widget.attach(widget, el);
    return () => {
      table.current = undefined;
      widget.dispose();
    };
  }, [loaded]);

  useEffect(() => {
    if (!data || !table.current) return;
    void table.current.renderModel(modelOf(TABLE_MIME, filterTable(data, query)));
  }, [data, query, loaded]);

  const makeNotebook = useCallback(async () => {
    setMaking(true);
    setError(undefined);
    try {
      const { contents, kernelspecs } = backend.services;
      const nb = await freePath(contents, notebookDirFor(path), notebookNameFor(path));
      await contents.save(nb, {
        type: 'notebook',
        format: 'json',
        content: notebookFor(path, sampleKernel(kernelspecs.specs)),
      });
      onOpenNotebook(nb);
    } catch (e) {
      setError(`Couldn’t make a notebook: ${messageOf(e)}`);
    } finally {
      setMaking(false);
    }
  }, [backend, path, onOpenNotebook]);

  const isTable = kind !== 'json';
  return (
    <div className="data-pane" data-kind={kind}>
      <div className="data-bar">
        <span className="data-name" title={path}>
          {name}
        </span>
        {isTable && (
          <input
            type="search"
            className="data-filter"
            placeholder="Filter rows"
            aria-label="Filter rows"
            value={query}
            disabled={!data}
            onChange={e => setQuery(e.target.value)}
          />
        )}
        <span className="data-spacer" />
        {onOpenAsText && (
          <button className="push-button" onClick={onOpenAsText}>
            Open as Text
          </button>
        )}
        <button className="push-button" disabled={making} onClick={() => void makeNotebook()}>
          New Notebook from File
        </button>
      </div>
      {loaded?.kind === 'table' && loaded.note && <p className="data-note">{loaded.note}</p>}
      {loaded?.kind === 'table' && loaded.schema && (
        <details className="data-schema">
          <summary>Schema ({loaded.schema.length} columns)</summary>
          <ul>
            {loaded.schema.map(c => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
      )}
      {error ? (
        <p className="data-error" role="alert">
          {error}
        </p>
      ) : !loaded ? (
        <p className="subtle data-loading">Loading…</p>
      ) : loaded.kind === 'json' && (loaded.value === null || typeof loaded.value !== 'object') ? (
        <pre className="data-scalar">{JSON.stringify(loaded.value)}</pre>
      ) : null}
      <div className="data-body" ref={host} />
    </div>
  );
}
