/**
 * The journal view (#184): a notebook an agent keeps, read as a lab notebook
 * and followed live. It reads the open notebook's own shared model, so there
 * is no second connection; cells are read-only, and the composer at the
 * bottom is the one way to write (a note, or a request to the agent).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { YCodeCell, YNotebook } from '@jupyter/ydoc';
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import type { ServerConnection } from '@jupyterlab/services';
import { MimeModel } from '@jupyterlab/rendermime';
import type { ReadonlyJSONObject } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';
import {
  FOLLOWING,
  type Follow,
  type JournalCellData,
  agentNames,
  atBottom,
  attachmentDataUrl,
  classifyProvenance,
  followLabel,
  foldLabel,
  journalHeader,
  latestAgentTime,
  newCellCount,
  nextFollow,
  noteCell,
  presenceNames,
  requestCell,
  requestState,
  revisionNumber,
  revisionsOf,
  runningLine,
  sourceOf,
  timeAgo,
  type NewCell,
  type Revision,
} from '../lib/journal';
import { agentsAt, composerHint, useRooms } from '../lib/journals';
import type { NotebookRoom } from '../lib/room';

type Props = {
  notebook: YNotebook;
  rendermime: IRenderMimeRegistry;
  /** The ids of the cells whose outputs may render in full (the page's trust for them). */
  trustedIds(): ReadonlySet<string>;
  room?: NotebookRoom;
  /** The file's name, for labels. */
  name: string;
  /** The notebook's path, and the server to ask which agents are in its room (#724). */
  path?: string;
  roomSettings?: ServerConnection.ISettings;
  onOpenAsNotebook(): void;
};

type Cell = JournalCellData & { running: boolean };

/** The cells as plain data, and a counter that moves when the document changes. */
function useCells(notebook: YNotebook) {
  const [version, setVersion] = useState(0);
  const [changedAt, setChangedAt] = useState<number>();
  /** The cells' Y.Maps changed since the cells were last read. */
  const touched = useRef(new Set<object>());
  useEffect(() => {
    let frame = 0;
    const onChange = (tr: {
      changed: Map<unknown, unknown>;
      changedParentTypes: Map<unknown, unknown>;
      local: boolean;
    }) => {
      if (tr.changed.size === 0) return;
      // Which cells this touched: a cell's own Y.Map is among the changed
      // parents of anything inside it (its source, outputs, metadata).
      for (const c of notebook.cells) {
        const y = (c as unknown as { ymodel: object }).ymodel;
        if (tr.changedParentTypes.has(y)) touched.current.add(y);
      }
      // "Changed N ago" is about the others: a change made here (the
      // composer, this page's own runs) is not news.
      if (!tr.local) setChangedAt(Date.now());
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVersion(v => v + 1);
      });
    };
    notebook.ydoc.on('afterTransaction', onChange);
    return () => {
      notebook.ydoc.off('afterTransaction', onChange);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [notebook]);
  // A cell that didn't change keeps its object, so its view isn't redone,
  // and isn't read again: only the cells a transaction touched are.
  const known = useRef(new Map<object, Cell>());
  const cells = useMemo<Cell[]>(() => {
    const next = new Map<object, Cell>();
    const list = notebook.cells.map(c => {
      const y = (c as unknown as { ymodel: object }).ymodel;
      let cell = known.current.get(y);
      if (!cell || touched.current.has(y)) {
        const data = c.toJSON() as unknown as JournalCellData;
        const running = c.cell_type === 'code' && (c as YCodeCell).executionState === 'running';
        cell = { ...data, running };
      }
      next.set(y, cell);
      return cell;
    });
    known.current = next;
    touched.current.clear();
    return list;
    // `version` is what says the document changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notebook, version]);
  return { cells, changedAt };
}

/** The notebook's metadata, read again when it changes. */
function useMetadata(notebook: YNotebook): unknown {
  const [, bump] = useState(0);
  useEffect(() => {
    const changed = () => bump(n => n + 1);
    notebook.metadataChanged.connect(changed);
    return () => {
      notebook.metadataChanged.disconnect(changed);
    };
  }, [notebook]);
  return {
    title: notebook.getMetadata('title'),
    kernelspec: notebook.getMetadata('kernelspec'),
    language_info: notebook.getMetadata('language_info'),
  };
}

/** The room's awareness names, live. */
function usePresence(notebook: YNotebook): string[] {
  const read = useCallback(
    () =>
      presenceNames(
        notebook.awareness.getStates() as Map<number, never>,
        notebook.awareness.clientID,
      ),
    [notebook],
  );
  const [names, setNames] = useState(read);
  useEffect(() => {
    const update = () =>
      setNames(prev => {
        const next = read();
        return prev.length === next.length && prev.every((n, i) => n === next[i]) ? prev : next;
      });
    notebook.awareness.on('change', update);
    update();
    return () => notebook.awareness.off('change', update);
  }, [notebook, read]);
  return names;
}

/** `Date.now()`, refreshed every `ms`. */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** One rendered mime bundle, in a Lumino renderer attached to the page. */
const Rendered = memo(function Rendered({
  rendermime,
  mime,
  data,
  metadata,
  trusted,
  attachments,
}: {
  rendermime: IRenderMimeRegistry;
  mime: string;
  data: unknown;
  metadata?: ReadonlyJSONObject;
  trusted: boolean;
  /** The cell's attachments, for `attachment:` images in Markdown. */
  attachments?: unknown;
}) {
  const host = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([mime, data, metadata ?? null, trusted, attachments ?? null]);
  // A layout effect: its cleanup runs before React removes the node, which
  // Lumino's detach needs.
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const registry = withAttachments(rendermime, attachments);
    const renderer = registry.createRenderer(mime);
    const model = new MimeModel({
      data: { [mime]: data } as never,
      metadata: metadata ?? {},
      trusted,
    });
    Widget.attach(renderer, node);
    let cancelled = false;
    void renderer.renderModel(model).catch(() => {
      // The text goes in the renderer's own node: the host holds the
      // attached widget, which the cleanup detaches.
      if (!cancelled) renderer.node.textContent = String(data);
    });
    return () => {
      cancelled = true;
      renderer.dispose();
    };
    // The key stands for every input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rendermime, key]);
  return <div ref={host} className="journal-rendered" />;
});

/** `rendermime`, resolving `attachment:` URLs to the cell's attached images. */
function withAttachments(rendermime: IRenderMimeRegistry, attachments: unknown) {
  if (!attachments || typeof rendermime.clone !== 'function') return rendermime;
  const parent = rendermime.resolver;
  const own = (url: string) => url.startsWith('attachment:');
  return rendermime.clone({
    resolver: {
      resolveUrl: async url => (own(url) || !parent ? url : parent.resolveUrl(url)),
      getDownloadUrl: async url =>
        own(url)
          ? (attachmentDataUrl(attachments, url) ?? url)
          : parent
            ? parent.getDownloadUrl(url)
            : url,
      isLocal: url => (own(url) ? true : (parent?.isLocal?.(url) ?? true)),
    },
  });
}

const joined = (v: unknown): unknown => (Array.isArray(v) ? v.join('') : v);

/** One nbformat output, rendered; nothing when it has no displayable form. */
function Output({
  output,
  rendermime,
  trusted,
}: {
  output: Record<string, unknown>;
  rendermime: IRenderMimeRegistry;
  trusted: boolean;
}) {
  const type = output.output_type;
  if (type === 'stream') {
    const mime =
      output.name === 'stderr'
        ? 'application/vnd.jupyter.stderr'
        : 'application/vnd.jupyter.stdout';
    return (
      <Rendered rendermime={rendermime} mime={mime} data={joined(output.text)} trusted={trusted} />
    );
  }
  if (type === 'error') {
    const trace = Array.isArray(output.traceback) ? output.traceback.join('\n') : '';
    return (
      <Rendered
        rendermime={rendermime}
        mime="application/vnd.jupyter.stderr"
        data={trace || `${String(output.ename)}: ${String(output.evalue)}`}
        trusted={trusted}
      />
    );
  }
  if (type === 'execute_result' || type === 'display_data') {
    const raw = (output.data ?? {}) as Record<string, unknown>;
    const data = Object.fromEntries(
      Object.entries(raw).map(([k, v]) =>
        typeof v === 'string' || Array.isArray(v) ? [k, joined(v)] : [k, v],
      ),
    );
    const mime = rendermime.preferredMimeType(data as never, trusted ? 'any' : 'ensure');
    if (!mime) return null;
    return (
      <Rendered
        rendermime={rendermime}
        mime={mime}
        data={data[mime]}
        metadata={(output.metadata as ReadonlyJSONObject | undefined)?.[mime] as ReadonlyJSONObject}
        trusted={trusted}
      />
    );
  }
  return null;
}

/** A time the cell wrote, short, with the full one as its title. */
function When({ at }: { at: string }) {
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return <span>{at}</span>;
  const today = new Date().toDateString() === t.toDateString();
  const short = t.toLocaleString(
    undefined,
    today
      ? { hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
  );
  return (
    <time dateTime={t.toISOString()} title={t.toLocaleString()}>
      {short}
    </time>
  );
}

/** "rev N": earlier sources on hover or tap. */
function RevisionChip({ revisions }: { revisions: Revision[] }) {
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;
  return (
    <span
      className="journal-rev"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        className="journal-chip"
        aria-expanded={open}
        aria-label={`Revision ${revisionNumber(revisions)}: show earlier versions`}
        onClick={() => setPinned(p => !p)}
      >
        rev {revisionNumber(revisions)}
      </button>
      {open && (
        <div className="journal-rev-panel" role="region" aria-label="Earlier versions">
          {revisions.map((r, i) => (
            <div key={i} className="journal-rev-item">
              <div className="journal-rev-meta">
                rev {i + 1}
                {r.by ? ` · ${r.by}` : ''}
                {r.at ? (
                  <>
                    {' '}
                    · <When at={r.at} />
                  </>
                ) : null}
              </div>
              <pre>{r.source}</pre>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

const JournalCell = memo(function JournalCell({
  cell,
  index,
  rendermime,
  trusted,
  request,
}: {
  cell: Cell;
  index: number;
  rendermime: IRenderMimeRegistry;
  trusted: boolean;
  request: 'open' | 'answered' | undefined;
}) {
  const [unfolded, setUnfolded] = useState(false);
  const p = classifyProvenance(cell);
  const revisions = revisionsOf(cell);
  const source = sourceOf(cell);
  const outputs = (cell.outputs ?? []) as Record<string, unknown>[];
  return (
    <article
      className={`journal-cell journal-${p.kind}`}
      aria-label={`Cell ${index + 1}, ${p.label}`}
      data-cell-index={index}
    >
      <div className="journal-gutter">
        <span className="journal-prov">
          <span className="journal-dot" aria-hidden="true" />
          {p.label}
          {p.count !== undefined ? ` [${p.count}]` : ''}
        </span>
        {p.by && <span className="journal-by">{p.by}</span>}
        {p.at && (
          <span className="journal-at">
            <When at={p.at} />
          </span>
        )}
        {revisions.length > 0 && <RevisionChip revisions={revisions} />}
        {request && (
          <span className="journal-chip journal-chip-static">
            {request === 'answered' ? 'request · answered' : 'request'}
          </span>
        )}
        {cell.running && <span className="journal-chip journal-chip-static">running</span>}
      </div>
      <div className="journal-body">
        {cell.cell_type === 'code' ? (
          <>
            <button
              type="button"
              className="journal-fold"
              aria-expanded={unfolded}
              onClick={() => setUnfolded(u => !u)}
            >
              {unfolded ? (
                <span>▾ {source ? 'Hide code' : '(empty)'}</span>
              ) : (
                <span>{foldLabel(source)}</span>
              )}
            </button>
            {unfolded && (
              <pre className="journal-code">
                <code>{source}</code>
              </pre>
            )}
            {outputs.map((o, i) => (
              <div key={i} className="journal-output">
                <Output output={o} rendermime={rendermime} trusted={trusted} />
              </div>
            ))}
          </>
        ) : cell.cell_type === 'markdown' ? (
          <Rendered
            rendermime={rendermime}
            mime="text/markdown"
            data={source}
            trusted={false}
            attachments={(cell as { attachments?: unknown }).attachments}
          />
        ) : (
          <pre className="journal-code">{source}</pre>
        )}
      </div>
    </article>
  );
});

export function JournalView({
  notebook,
  rendermime,
  trustedIds,
  room,
  name,
  path,
  roomSettings,
  onOpenAsNotebook,
}: Props) {
  const { cells, changedAt } = useCells(notebook);
  const people = usePresence(notebook);
  // Agents hold the room on the server, not through its awareness, so
  // the server's rooms list says which are here (#724).
  const rooms = useRooms(roomSettings, !!roomSettings && !!path);
  const agents = path ? agentsAt(rooms, path) : undefined;
  const names = [...people, ...(agents ?? []).filter(a => !people.includes(a))];
  const hint = composerHint(agents);
  const header = journalHeader(useMetadata(notebook), cells, name);
  const now = useNow(15_000);
  const [live, setLive] = useState(() => room?.live ?? true);
  useEffect(() => room?.watchLive(setLive), [room]);

  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState<Follow>(FOLLOWING);
  const followRef = useRef(follow);
  followRef.current = follow;
  const cellCount = useRef(cells.length);
  cellCount.current = cells.length;

  const toEnd = useCallback(() => {
    const s = scroller.current;
    if (s) s.scrollTop = s.scrollHeight;
  }, []);
  // New cells, and outputs that render later, keep the end in view while following.
  useLayoutEffect(() => {
    if (follow.following) toEnd();
  }, [cells.length, follow.following, toEnd]);
  useEffect(() => {
    const node = content.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (followRef.current.following) toEnd();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [toEnd]);

  const onScroll = () => {
    const s = scroller.current;
    if (!s) return;
    setFollow(f =>
      nextFollow(f, { type: 'scroll', atBottom: atBottom(s), cells: cellCount.current }),
    );
  };
  const resume = () => {
    setFollow(f => nextFollow(f, { type: 'resume' }));
    toEnd();
  };

  const last = changedAt ?? latestAgentTime(cells);
  const running = runningLine(cells);
  const unseen = newCellCount(follow, cells.length);
  const trust = trustedIds();
  const clients = useMemo(() => agentNames(cells), [cells]);

  const [text, setText] = useState('');
  const add = (make: (t: string) => NewCell | undefined) => {
    const cell = make(text);
    if (!cell || !live) return;
    notebook.addCell(cell);
    setText('');
    resume();
  };
  const blank = text.trim() === '';

  return (
    <section className="journal" aria-label={`Journal of ${name}`}>
      <header className="journal-header">
        <h1 className="journal-title">{header.title}</h1>
        <p className="journal-meta">{header.details.join(' · ')}</p>
      </header>
      <div className="journal-status">
        <span>
          {names.length > 1 ? `In the room: ${names.join(', ')}` : 'Only you are here'}
          {last !== undefined ? ` · changed ${timeAgo(last, now)}` : ''}
        </span>
        <span role="status" className="journal-running">
          {running}
        </span>
        <button type="button" className="journal-open" onClick={onOpenAsNotebook}>
          Open as Notebook
        </button>
      </div>
      {!live && (
        <div className="journal-banner" role="status">
          Reconnecting… The journal is read-only until the connection returns.
        </div>
      )}
      <div className="journal-scroll" ref={scroller} onScroll={onScroll}>
        <div className="journal-content" ref={content}>
          {cells.length === 0 && (
            <p className="journal-empty">Nothing here yet. Add a note or ask the agent below.</p>
          )}
          {cells.map((cell, i) => (
            <JournalCell
              key={cell.id ?? i}
              cell={cell}
              index={i}
              rendermime={rendermime}
              trusted={!!cell.id && trust.has(cell.id)}
              request={requestState(cell, clients)}
            />
          ))}
        </div>
      </div>
      {unseen > 0 && (
        <button type="button" className="journal-follow" onClick={resume}>
          {followLabel(unseen)}
        </button>
      )}
      <form
        className="journal-composer"
        onSubmit={e => {
          e.preventDefault();
          add(noteCell);
        }}
      >
        <label className="journal-label" htmlFor="journal-text">
          Write to the journal
        </label>
        <textarea
          id="journal-text"
          className="journal-text"
          rows={2}
          value={text}
          placeholder="A note, or a request for the agent"
          disabled={!live}
          onChange={e => setText(e.target.value)}
        />
        {hint && (
          <p className="journal-hint" role="status">
            {hint}
          </p>
        )}
        <div className="journal-actions">
          <button type="submit" disabled={!live || blank}>
            Add Note
          </button>
          <button type="button" disabled={!live || blank} onClick={() => add(requestCell)}>
            Ask the agent
          </button>
        </div>
      </form>
    </section>
  );
}
