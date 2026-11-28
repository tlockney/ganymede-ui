/**
 * The journal view (#184): a notebook an agent keeps, read as a lab notebook
 * and followed live. It reads the open notebook's own shared model, so there
 * is no second connection; cells are read-only, and the composer at the
 * bottom is the one way to write (a note, or a request to the agent).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { YCodeCell, YNotebook } from '@jupyter/ydoc';
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import type * as nbformat from '@jupyterlab/nbformat';
import type { ServerConnection } from '@jupyterlab/services';
import { MimeModel } from '@jupyterlab/rendermime';
import type { ReadonlyJSONObject } from '@lumino/coreutils';
import { Widget } from '@lumino/widgets';
import {
  FOLLOWING,
  type Follow,
  type JournalCellData,
  type RequestSave,
  agentNames,
  atBottom,
  attachmentDataUrl,
  classifyProvenance,
  followLabel,
  followsLate,
  firstVisibleIndex,
  foldLabel,
  initialFollow,
  journalHeader,
  latestAgentTime,
  newCellCount,
  nextFollow,
  notebookLanguage,
  noteCell,
  presenceNames,
  claimPosition,
  positionIn,
  positionRetired,
  readPosition,
  requestAnswer,
  requestCell,
  requestChip,
  requestState,
  revisionNumber,
  revisionsOf,
  runningLine,
  savePosition,
  showFollow,
  sourceOf,
  timeAgo,
  type NewCell,
  type Revision,
} from '../lib/journal';
import { findEditorLanguage } from '../lib/editor-setup';
import { outputMetaText, outputTableExpandInfo } from '../lib/output-labels';
import { countSourceLines, isLongSource } from '../lib/source-expand';
import { tableWidgetFor } from '../lib/table-output';
import { agentsAt, composerHint, useRooms } from '../lib/journals';
import type { NotebookRoom } from '../lib/room';
import { READONLY_BANNER } from '../lib/room-readonly';
import { useNarrow } from '../lib/useNarrow';
import { type ExpandedTarget, tableTargetFromOutput } from '../lib/expanded-view';
import { ExpandedView } from './ExpandedView';

type Props = {
  notebook: YNotebook;
  rendermime: IRenderMimeRegistry;
  /** The ids of the cells whose outputs may render in full (the page's trust for them). */
  trustedIds(): ReadonlySet<string>;
  room?: NotebookRoom;
  /** Read-only because another Ganymede server owns the notebook (#839). */
  readOnly?: boolean;
  /** The file's name, for labels. */
  name: string;
  /** The notebook's path, and the server to ask which agents are in its room (#724). */
  path?: string;
  roomSettings?: ServerConnection.ISettings;
  /**
   * Which server and path the reader's position is kept under; without it
   * the position isn't kept or restored.
   */
  positionKey?: { server: string; path: string };
  /** The cell (an index) the reader switched here from in the notebook: where to open. */
  startAt?: number;
  /** Called when the current visible/reading cell index changes (#913). */
  onActiveCellChange?(index: number | null): void;
  onOpenAsNotebook(): void;
};

/** How often the reading position is saved while scrolling, at most. */
const SAVE_EVERY_MS = 500;

type Cell = JournalCellData & { running: boolean };

/**
 * Whether a transaction added or removed cells, or changed a cell's type,
 * source or outputs: the notebook's own metadata (a kernel's language_info)
 * and cell metadata alone are not.
 */
function cellsChanged(
  notebook: YNotebook,
  tr: { changed: Map<unknown, unknown>; changedParentTypes: Map<unknown, unknown> },
): boolean {
  if (tr.changed.has(notebook.ydoc.getArray('cells'))) return true;
  for (const c of notebook.cells) {
    const y = (c as unknown as { ymodel: { get(k: string): unknown } }).ymodel;
    const keys = tr.changed.get(y) as Set<string> | undefined;
    if (keys && ['source', 'outputs', 'cell_type'].some(k => keys.has(k))) return true;
    for (const k of ['source', 'outputs']) {
      const inner = y.get(k);
      if (inner && typeof inner === 'object' && tr.changedParentTypes.has(inner)) return true;
    }
  }
  return false;
}

/** The cells as plain data, and a counter that moves when the document changes. */
function useCells(notebook: YNotebook) {
  const [version, setVersion] = useState(0);
  const [changedAt, setChangedAt] = useState<number>();
  /** Someone else changed the cells themselves (not just the notebook's metadata). */
  const [othersChangedCells, setOthersChangedCells] = useState(false);
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
      if (!tr.local) {
        setChangedAt(Date.now());
        if (cellsChanged(notebook, tr)) setOthersChangedCells(true);
      }
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
  return { cells, changedAt, othersChangedCells };
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

function JournalOutputRow({
  output,
  rendermime,
  trusted,
  onExpand,
}: {
  output: nbformat.IOutput;
  rendermime: IRenderMimeRegistry;
  trusted: boolean;
  onExpand(target: ExpandedTarget): void;
}) {
  const outRef = useRef<HTMLDivElement>(null);
  const [tableInfo, setTableInfo] = useState(() => outputTableExpandInfo(output));

  useLayoutEffect(() => {
    const el = outRef.current;
    if (!el) return;
    const check = () => setTableInfo(outputTableExpandInfo(output, el));
    check();
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : undefined;
    ro?.observe(el);
    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, [output]);

  return (
    <div ref={outRef} className="journal-output">
      {tableInfo.show && (
        <div className="gn-output-bar" data-kind="table">
          <span className="gn-output-label">{tableInfo.label}</span>
          <button
            type="button"
            className="gn-output-toggle"
            onClick={() => {
              const widget = tableWidgetFor(outRef.current?.querySelector('.gm-table'));
              const target = tableTargetFromOutput({ output, widget, trusted, rendermime });
              if (target) onExpand(target);
            }}
          >
            Expand table
          </button>
        </div>
      )}
      <Output
        output={output as Record<string, unknown>}
        rendermime={rendermime}
        trusted={trusted}
      />
    </div>
  );
}

const JournalCell = memo(function JournalCell({
  cell,
  index,
  rendermime,
  trusted,
  sourceMime,
  request,
  requestSave,
  reply,
  onGoToReply,
  onExpand,
}: {
  cell: Cell;
  index: number;
  rendermime: IRenderMimeRegistry;
  trusted: boolean;
  sourceMime?: string;
  request: 'open' | 'answered' | undefined;
  /** What saving the request this view just added came to. */
  requestSave: RequestSave | undefined;
  /** The id of the answering cell, when it is in the notebook. */
  reply: string | undefined;
  onGoToReply(id: string): void;
  onExpand(target: ExpandedTarget): void;
}) {
  const [unfolded, setUnfolded] = useState(false);
  const p = classifyProvenance(cell);
  const revisions = revisionsOf(cell);
  const source = sourceOf(cell);
  const outputs = (cell.outputs ?? []) as Record<string, unknown>[];
  // The notebook's meta line under the outputs (#852): what the outputs are,
  // not what they were saved as or how long a run here took.
  const meta = outputMetaText(outputs as nbformat.IOutput[]);
  return (
    <article
      className={`journal-cell journal-${p.kind}`}
      aria-label={`Cell ${index + 1}, ${p.label}`}
      data-cell-index={index}
      data-cell-id={cell.id}
      data-cell-type={cell.cell_type}
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
        {request &&
          (reply ? (
            <button type="button" className="journal-chip" onClick={() => onGoToReply(reply)}>
              {requestChip('answered')} · Go to reply
            </button>
          ) : (
            <span className="journal-chip journal-chip-static">
              {requestChip(request, requestSave)}
            </span>
          ))}
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
              <>
                {isLongSource(source) && (
                  <div className="gn-source-bar">
                    <span className="gn-source-label">{countSourceLines(source)} lines</span>
                    <button
                      type="button"
                      className="gn-source-toggle"
                      onClick={() =>
                        onExpand({
                          kind: 'source',
                          title: p.count !== undefined ? `In [${p.count}]` : 'Source',
                          mimeType: sourceMime,
                          readOnly: true,
                          source,
                        })
                      }
                    >
                      Expand source
                    </button>
                  </div>
                )}
                <pre className="journal-code">
                  <code>{source}</code>
                </pre>
              </>
            )}
            {outputs.map((o, i) => (
              <JournalOutputRow
                key={i}
                output={o as nbformat.IOutput}
                rendermime={rendermime}
                trusted={trusted}
                onExpand={onExpand}
              />
            ))}
            {meta && <p className="journal-output-meta">{meta}</p>}
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
  readOnly = false,
  name,
  path,
  roomSettings,
  positionKey,
  startAt,
  onActiveCellChange,
  onOpenAsNotebook,
}: Props) {
  const { cells, changedAt, othersChangedCells } = useCells(notebook);
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
  const running = runningLine(cells);
  // How it opens, decided once: where the reader was, or the end of live
  // work, or the start (see `initialFollow`).
  const [opening] = useState(() =>
    initialFollow({
      ids: cells.map(c => c.id),
      startAt,
      saved: positionKey ? readPosition(positionKey.server, positionKey.path) : undefined,
      active: running !== undefined || (agents?.length ?? 0) > 0,
    }),
  );
  const [follow, setFollow] = useState<Follow>(opening.follow);
  const followRef = useRef(follow);
  followRef.current = follow;
  const cellCount = useRef(cells.length);
  cellCount.current = cells.length;
  /** The reader scrolled, or did anything else, since this opened. */
  const touched = useRef(false);
  /** The cell the opening put at the top: put back while content settles under it. */
  const anchor = useRef<{ id?: string; index: number; offset: number } | undefined>(undefined);
  const onActiveCellChangeRef = useRef(onActiveCellChange);
  onActiveCellChangeRef.current = onActiveCellChange;
  const lastReportedCell = useRef<number | null | undefined>(undefined);
  const reportActiveCell = useCallback((fallback?: number | null) => {
    const cb = onActiveCellChangeRef.current;
    if (!cb) return;
    const s = scroller.current;
    let next: number | null = null;
    if (cellCount.current > 0) {
      if (s) {
        const rect = s.getBoundingClientRect();
        const boxes = [...s.querySelectorAll<HTMLElement>('.journal-cell')].map(a => {
          const r = a.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        });
        const laidOut = rect.height > 0 || boxes.some(b => b.top !== 0 || b.bottom !== 0);
        next = laidOut
          ? (firstVisibleIndex(rect.top, boxes) ?? 0)
          : (fallback ??
            Math.min(Math.max(0, lastReportedCell.current ?? 0), cellCount.current - 1));
      } else {
        next = fallback ?? 0;
      }
    }
    if (next !== lastReportedCell.current) {
      lastReportedCell.current = next;
      cb(next);
    }
  }, []);

  const toEnd = useCallback(() => {
    const s = scroller.current;
    if (!s) return;
    s.scrollTop = s.scrollHeight;
  }, []);
  /** Scroll a cell's top (plus `offset`) to the scroller's top. */
  const placeCell = useCallback((at: { id?: string; index: number; offset: number }) => {
    const s = scroller.current;
    if (!s) return false;
    const articles = [...s.querySelectorAll<HTMLElement>('.journal-cell')];
    const article =
      (at.id !== undefined ? articles.find(a => a.dataset.cellId === at.id) : undefined) ??
      articles[at.index];
    if (!article) return false;
    s.scrollTop += article.getBoundingClientRect().top - s.getBoundingClientRect().top + at.offset;
    return true;
  }, []);
  /** The opening's cell is held in place, or let go (the browser may then keep what is in view). */
  const hold = useCallback((at: { id?: string; index: number; offset: number } | undefined) => {
    anchor.current = at;
    const s = scroller.current;
    if (!s) return;
    if (at) s.dataset.anchored = '';
    else delete s.dataset.anchored;
  }, []);
  /** The reader did something: the opening's place is theirs now. */
  const touch = useCallback(() => {
    touched.current = true;
    hold(undefined);
  }, [hold]);

  // Open where decided: the cell the reader was at, the end, or the start.
  useLayoutEffect(() => {
    const at = opening.scroll;
    let initial: number | null;
    if (at.to === 'end') {
      toEnd();
      initial = cells.length > 0 ? cells.length - 1 : null;
    } else if (at.to === 'start') {
      const s = scroller.current;
      if (s) s.scrollTop = 0;
      initial = cells.length > 0 ? 0 : null;
    } else {
      const spot = { id: cells[at.index]?.id, index: at.index, offset: at.offset };
      placeCell(spot);
      hold(spot);
      initial = at.index;
      // From the notebook, a cell at the very end follows (the end is where it is).
      const s = scroller.current;
      if (opening.reason === 'from-notebook' && s && atBottom(s)) setFollow(FOLLOWING);
    }
    reportActiveCell(initial);
    // Once, when it shows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // New cells, and outputs that render later, keep the end in view while following.
  useLayoutEffect(() => {
    if (follow.following) toEnd();
    reportActiveCell(follow.following && cells.length > 0 ? cells.length - 1 : undefined);
  }, [cells.length, follow.following, toEnd, reportActiveCell]);
  useEffect(() => {
    const node = content.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (followRef.current.following) toEnd();
      else if (anchor.current) placeCell(anchor.current);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [toEnd, placeCell]);

  // An agent turns up after the journal opened at its start, and the reader
  // hasn't touched it: it is live work, so follow it.
  const agentCount = agents?.length ?? 0;
  useEffect(() => {
    if (agentCount > 0 && followsLate(opening.reason, touched.current)) {
      hold(undefined);
      setFollow(FOLLOWING);
    }
  }, [agentCount, opening.reason, hold]);

  // The reader's position, kept as they read: at most every SAVE_EVERY_MS
  // while scrolling, and when the view goes away.
  const key = positionKey && `${positionKey.server}\n${positionKey.path}`;
  const keepRef = useRef<() => void>(() => {});
  const lastPosition = useRef<ReturnType<typeof positionIn>>(undefined);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!positionKey || !node) {
      keepRef.current = () => {};
      return;
    }
    const { server, path: file } = positionKey;
    claimPosition(server, file);
    const keep = () => {
      // The file was renamed, moved or deleted: nothing to keep under its old path.
      if (positionRetired(server, file)) return;
      // A node already out of the page has no layout: keep the last one seen.
      const pos = node.isConnected ? positionIn(node) : lastPosition.current;
      if (!pos) return;
      lastPosition.current = pos;
      // A convenience: when the browser won't store it, reading goes on.
      savePosition(server, file, pos);
    };
    keepRef.current = keep;
    window.addEventListener('pagehide', keep);
    return () => {
      window.removeEventListener('pagehide', keep);
      keep();
    };
    // `key` stands for the position key's two strings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scrollFrame = useRef(0);
  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current);
    },
    [],
  );

  const onScroll = () => {
    const s = scroller.current;
    if (!s) return;
    setFollow(f =>
      nextFollow(f, { type: 'scroll', atBottom: atBottom(s), cells: cellCount.current }),
    );
    if (!scrollFrame.current) {
      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = 0;
        reportActiveCell();
      });
    }
    if (!saveTimer.current) {
      saveTimer.current = setTimeout(() => {
        saveTimer.current = undefined;
        keepRef.current();
      }, SAVE_EVERY_MS);
    }
  };
  const resume = () => {
    setFollow(f => nextFollow(f, { type: 'resume' }));
    toEnd();
    reportActiveCell(cellCount.current > 0 ? cellCount.current - 1 : null);
  };
  /** The reply to a request: its cell at the top. A scroll, so it stops following. */
  const goToReply = useCallback(
    (id: string) => {
      const s = scroller.current;
      const index = cellIds.current.indexOf(id);
      if (!s || index < 0) return;
      touch();
      placeCell({ id, index, offset: 0 });
      reportActiveCell(index);
      // Paused even when the reply is the last cell and the view stays at the end.
      setFollow(f => (f.following ? { following: false, pausedAt: cellCount.current } : f));
    },
    [placeCell, reportActiveCell, touch],
  );

  const last = changedAt ?? latestAgentTime(cells);
  const unseen = newCellCount(follow, cells.length);
  // Live work: a cell running, an agent in the room, or others changing the cells.
  const activeNow = running !== undefined || agentCount > 0 || othersChangedCells;
  const trust = trustedIds();
  const clients = useMemo(() => agentNames(cells), [cells]);
  const cellIds = useRef<(string | undefined)[]>([]);
  cellIds.current = cells.map(c => c.id);

  const narrow = useNarrow();
  const [text, setText] = useState('');
  /** On a phone: which composer is open, if any. */
  const [intent, setIntent] = useState<'note' | 'request'>();
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (intent) field.current?.focus();
  }, [intent]);
  /** What saving the requests added here came to, by cell id. */
  const [saves, setSaves] = useState<Record<string, RequestSave>>({});
  const canWrite = live && !readOnly;
  const add = (make: (t: string) => NewCell | undefined) => {
    const cell = make(text);
    if (!cell || !canWrite) return;
    const added = notebook.addCell(cell);
    setText('');
    setIntent(undefined);
    resume();
    // The agent sends no acknowledgement of a request today; when it does, this is where it shows.
    if (make === requestCell && room) {
      const id = added.getId();
      const set = (state: RequestSave) => setSaves(m => ({ ...m, [id]: state }));
      set('saving');
      room.save().then(
        status => set(status === 'failed' ? 'not saved' : 'saved'),
        () => set('not saved'),
      );
    }
  };
  const blank = text.trim() === '';
  const collapsed = narrow && !intent;
  const submitRequest = narrow && intent === 'request';
  const [expanded, setExpanded] = useState<ExpandedTarget>();
  const sourceMime = useMemo(() => {
    const mime = findEditorLanguage(notebookLanguage(notebook.metadata))?.mime;
    return typeof mime === 'string' ? mime : mime?.[0];
  }, [notebook]);

  return (
    <section
      className="journal"
      aria-label={`Journal of ${name}`}
      // The reader's own input, not a scroll: what makes the opening theirs.
      onWheel={touch}
      onTouchStart={touch}
      onPointerDown={touch}
      onKeyDown={touch}
    >
      <header className="journal-header">
        {header.eyebrow && <p className="journal-eyebrow">{header.eyebrow}</p>}
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
      {!live ? (
        <div className="journal-banner" role="status">
          Reconnecting… The journal is read-only until the connection returns.
        </div>
      ) : (
        readOnly && (
          <div className="journal-banner" role="status">
            {READONLY_BANNER}
          </div>
        )
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
              sourceMime={sourceMime}
              request={requestState(cell, clients)}
              requestSave={cell.id ? saves[cell.id] : undefined}
              reply={replyIn(cell, cellIds.current)}
              onGoToReply={goToReply}
              onExpand={setExpanded}
            />
          ))}
        </div>
      </div>
      {showFollow(follow, cells.length, activeNow) && (
        <button type="button" className="journal-follow" onClick={resume}>
          {followLabel(unseen)}
        </button>
      )}
      <form
        className="journal-composer"
        onSubmit={e => {
          e.preventDefault();
          add(submitRequest ? requestCell : noteCell);
        }}
      >
        {collapsed ? (
          <>
            {hint && (
              <p className="journal-hint" role="status">
                {hint}
              </p>
            )}
            <div className="journal-actions journal-actions-collapsed">
              <button type="button" disabled={!canWrite} onClick={() => setIntent('note')}>
                Add note
              </button>
              <button type="button" disabled={!canWrite} onClick={() => setIntent('request')}>
                Ask the agent
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="journal-label" htmlFor="journal-text">
              Write to the journal
            </label>
            <textarea
              id="journal-text"
              ref={field}
              className="journal-text"
              rows={2}
              value={text}
              placeholder={
                !narrow
                  ? 'A note, or a request for the agent'
                  : submitRequest
                    ? 'A request for the agent'
                    : 'A note for the journal'
              }
              disabled={!canWrite}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (narrow && e.key === 'Escape') setIntent(undefined);
              }}
            />
            {hint && (
              <p className="journal-hint" role="status">
                {hint}
              </p>
            )}
            <div className="journal-actions">
              {narrow ? (
                <>
                  <button type="button" onClick={() => setIntent(undefined)}>
                    Cancel
                  </button>
                  <button type="submit" disabled={!canWrite || blank}>
                    {submitRequest ? 'Ask the agent' : 'Add note'}
                  </button>
                </>
              ) : (
                <>
                  <button type="submit" disabled={!canWrite || blank}>
                    Add Note
                  </button>
                  <button
                    type="button"
                    disabled={!canWrite || blank}
                    onClick={() => add(requestCell)}
                  >
                    Ask the agent
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </form>
      {expanded && <ExpandedView target={expanded} onClose={() => setExpanded(undefined)} />}
    </section>
  );
}

/** The id of the cell answering `cell`, when that cell is in the journal. */
function replyIn(cell: Cell, ids: readonly (string | undefined)[]): string | undefined {
  const answer = requestAnswer(cell);
  return answer !== undefined && ids.includes(answer) ? answer : undefined;
}
