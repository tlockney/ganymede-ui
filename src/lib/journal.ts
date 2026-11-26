/**
 * The journal view's logic (#184), apart from React: what a cell's
 * provenance is, how a folded code cell reads, when the view follows new
 * cells, the status line, and the `@agent` request cell the composer adds.
 *
 * A journal is a notebook an agent keeps through `ganymede mcp`. The cells it
 * writes carry `metadata.ganymede.agent = {by, mode, at, history}`; see
 * Ganymede's docs/mcp.md ("Provenance"). Requests are Markdown cells that
 * start with `@agent`, docs/live-agent-edits.md.
 */

/** A cell as the view reads it: nbformat's JSON, loosely typed. */
export type JournalCellData = {
  id?: string;
  cell_type: string;
  source: string | string[];
  metadata?: unknown;
  execution_count?: number | null;
  outputs?: unknown[];
};

/** Who wrote a cell, in the words the view shows. */
export type ProvenanceKind =
  /** The agent ran it (`mode: executed`). */
  | 'executed'
  /** The agent recorded a step it didn't run here (`mode: recorded`). */
  | 'recorded'
  /** The agent's own note (`mode: note`). */
  | 'note'
  /** Agent metadata without a mode this app knows. */
  | 'agent'
  /** No agent metadata: a person wrote it. */
  | 'person';

export type Provenance = {
  kind: ProvenanceKind;
  /** "Agent ran it", "Recorded step", "Agent note", "Agent", "Person". */
  label: string;
  /** The client's name (`by`), when the cell says. */
  by?: string;
  /** When (`at`), as the cell wrote it. */
  at?: string;
  /** The execution count of a cell the agent ran, when it has one. */
  count?: number;
};

/** An earlier source of a cell the agent revised. */
export type Revision = { source: string; by?: string; at?: string };

const LABELS: Record<ProvenanceKind, string> = {
  executed: 'Agent ran it',
  recorded: 'Recorded step',
  note: 'Agent note',
  agent: 'Agent',
  person: 'Person',
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** `metadata.ganymede.agent` if the cell has one. */
function agentMetadata(
  cell: Pick<JournalCellData, 'metadata'>,
): Record<string, unknown> | undefined {
  const ganymede = isRecord(cell.metadata) ? cell.metadata.ganymede : undefined;
  const agent = isRecord(ganymede) ? ganymede.agent : undefined;
  return isRecord(agent) ? agent : undefined;
}

/** A cell's source as one string (nbformat allows a list of lines). */
export function sourceOf(cell: Pick<JournalCellData, 'source'>): string {
  return Array.isArray(cell.source) ? cell.source.join('') : (cell.source ?? '');
}

/**
 * Where a cell came from. Agent metadata says so by `mode`; a cell without
 * any is a person's. `count` is the execution count, only for a cell the
 * agent ran.
 */
export function classifyProvenance(cell: JournalCellData): Provenance {
  const agent = agentMetadata(cell);
  if (!agent) return { kind: 'person', label: LABELS.person };
  const mode = agent.mode;
  const kind: ProvenanceKind =
    mode === 'executed' || mode === 'recorded' || mode === 'note' ? mode : 'agent';
  const count =
    kind === 'executed' && typeof cell.execution_count === 'number'
      ? cell.execution_count
      : undefined;
  return { kind, label: LABELS[kind], by: text(agent.by), at: text(agent.at), count };
}

/** Whether any cell was written by an agent: the view's default (#184). */
export function hasAgentCells(cells: readonly Pick<JournalCellData, 'metadata'>[]): boolean {
  return cells.some(c => agentMetadata(c) !== undefined);
}

/**
 * The sources `cell_edit` replaced, oldest first, from
 * `metadata.ganymede.agent.history`. Entries that aren't `{source, by, at}`
 * objects are skipped.
 */
export function revisionsOf(cell: Pick<JournalCellData, 'metadata'>): Revision[] {
  const history = agentMetadata(cell)?.history;
  if (!Array.isArray(history)) return [];
  return history.flatMap(h =>
    isRecord(h) && typeof h.source === 'string'
      ? [{ source: h.source, by: text(h.by), at: text(h.at) }]
      : [],
  );
}

/** The "rev N" the chip shows: the earlier sources, and this one. */
export const revisionNumber = (revisions: readonly Revision[]): number => revisions.length + 1;

/** How long a folded cell's first line may be before it is cut. */
const FOLD_WIDTH = 80;

/** What a folded code cell shows. */
export type FoldSummary = { first: string; lines: number };

/**
 * The first non-blank line of a code cell (trimmed, cut at 80 characters
 * with an ellipsis) and its number of lines; a trailing newline isn't a
 * line.
 */
export function foldSummary(source: string): FoldSummary {
  const all = source.split(/\r\n|\r|\n/);
  if (all.length > 1 && all[all.length - 1] === '') all.pop();
  const lines = source === '' ? 0 : all.length;
  const first = (all.find(l => l.trim() !== '') ?? '').trim();
  const chars = [...first];
  return {
    first: chars.length > FOLD_WIDTH ? `${chars.slice(0, FOLD_WIDTH - 1).join('')}…` : first,
    lines,
  };
}

/** "▸ <first line> · N lines". */
export function foldLabel(source: string): string {
  const { first, lines } = foldSummary(source);
  return `▸ ${first || '(empty)'} · ${lines} ${lines === 1 ? 'line' : 'lines'}`;
}

// Following along ---------------------------------------------------------

/**
 * Whether the view scrolls to each new cell. Following is on until the
 * person scrolls up; `pausedAt` is how many cells there were then, so the
 * button can say how many came since.
 */
export type Follow = { following: true } | { following: false; pausedAt: number };

export const FOLLOWING: Follow = { following: true };

/** How far from the bottom still counts as at the bottom, in pixels. */
export const BOTTOM_SLACK = 48;

/** Whether a scroller is at (or within a little of) its end. */
export function atBottom(
  s: { scrollTop: number; clientHeight: number; scrollHeight: number },
  slack = BOTTOM_SLACK,
): boolean {
  return s.scrollHeight - s.scrollTop - s.clientHeight <= slack;
}

export type FollowEvent =
  /** The person scrolled: the view reports whether it is at the bottom, with `cells` cells. */
  | { type: 'scroll'; atBottom: boolean; cells: number }
  /** The Follow button, or the person added a cell. */
  | { type: 'resume' };

/** The next state; the same object when nothing changes. */
export function nextFollow(state: Follow, event: FollowEvent): Follow {
  if (event.type === 'resume') return state.following ? state : FOLLOWING;
  if (event.atBottom) return state.following ? state : FOLLOWING;
  return state.following ? { following: false, pausedAt: event.cells } : state;
}

/** Cells added since following paused; 0 while following. */
export function newCellCount(state: Follow, cells: number): number {
  return state.following ? 0 : Math.max(0, cells - state.pausedAt);
}

/**
 * The Follow button's text: "3 new · Follow live" when cells came while
 * paused, "Follow live" when none did but the journal is active.
 */
export function followLabel(count: number): string {
  return count > 0 ? `${count} new · Follow live` : 'Follow live';
}

/**
 * Whether the Follow button shows: while paused, when cells were added
 * since or the journal is active (a cell running, an agent in the room, a
 * change from someone else). A finished journal read from the start has none.
 */
export function showFollow(state: Follow, cells: number, active: boolean): boolean {
  return !state.following && (newCellCount(state, cells) > 0 || active);
}

// Where reading starts ------------------------------------------------------

/** Where a person was reading a journal: a cell, and how far into it. */
export type ReadingPosition = {
  /** The cell's id. */
  cell: string;
  /** Pixels from the cell's top to the scroller's top, 0 or more. */
  offset: number;
  /** How many cells the journal had then. */
  cells: number;
};

/** How a journal opens, and what it says of why (a late agent may change it). */
export type Opening = {
  follow: Follow;
  /** Where to scroll: a cell (by index) and the offset into it, the start, or the end. */
  scroll: { to: 'cell'; index: number; offset: number } | { to: 'start' } | { to: 'end' };
  /**
   * Why: `from-notebook` (the reader switched from the notebook), `saved`
   * (the reader's last position), `active` (work is going on), `start`.
   */
  reason: 'from-notebook' | 'saved' | 'active' | 'start';
};

/**
 * How a journal opens, decided once when it shows: at the cell the reader
 * switched from (`startAt`, an index), else at the end, following, when the
 * journal is active (live work is what to watch), else where the reader was
 * last (`saved`, when its cell is still there), else at the start. Paused
 * openings count new cells from `pausedAt`: the cells there were when the
 * reader left (at most as many as there are now), or now.
 */
export function initialFollow(input: {
  /** The cells' ids, in order; undefined for a cell without one. */
  ids: readonly (string | undefined)[];
  startAt?: number;
  saved?: ReadingPosition;
  active: boolean;
}): Opening {
  const { ids, startAt, saved, active } = input;
  const total = ids.length;
  if (startAt !== undefined && Number.isInteger(startAt) && startAt >= 0 && startAt < total) {
    return {
      follow: { following: false, pausedAt: total },
      scroll: { to: 'cell', index: startAt, offset: 0 },
      reason: 'from-notebook',
    };
  }
  if (active) return { follow: FOLLOWING, scroll: { to: 'end' }, reason: 'active' };
  const at = saved ? ids.indexOf(saved.cell) : -1;
  if (saved && at >= 0) {
    return {
      follow: { following: false, pausedAt: Math.min(Math.max(0, saved.cells), total) },
      scroll: { to: 'cell', index: at, offset: Math.max(0, saved.offset) },
      reason: 'saved',
    };
  }
  return {
    follow: { following: false, pausedAt: total },
    scroll: { to: 'start' },
    reason: 'start',
  };
}

/**
 * Whether a journal that opened at the start or at the reader's saved place,
 * and then learned an agent is in its room, should follow after all: only
 * when the reader has not scrolled or done anything since it opened. A
 * journal opened from the notebook stays where the reader asked.
 */
export function followsLate(opening: Opening['reason'], touched: boolean): boolean {
  return (opening === 'start' || opening === 'saved') && !touched;
}

/**
 * A cell showing less than this much at the top doesn't count as the one
 * being read: a cell scrolled to the top can leave a sub-pixel sliver of
 * the one above it when text heights are fractional (#816).
 */
export const SLIVER_PX = 2;

/** One cell's box, as the scroller sees it. */
export type CellBox = { id?: string; top: number; bottom: number };

/**
 * The first cell whose bottom is below the scroller's top, as a reading
 * position; undefined when there is none or it has no id.
 */
export function readingPosition(
  scrollerTop: number,
  boxes: readonly CellBox[],
): ReadingPosition | undefined {
  const first = boxes.find(b => b.bottom > scrollerTop + SLIVER_PX);
  if (!first?.id) return undefined;
  return {
    cell: first.id,
    offset: Math.max(0, Math.round(scrollerTop - first.top)),
    cells: boxes.length,
  };
}

/** The index of the first box showing more than a sliver below `top` (the last one when all are above). */
export function firstVisibleIndex(
  top: number,
  boxes: readonly { bottom: number }[],
): number | undefined {
  if (boxes.length === 0) return undefined;
  const i = boxes.findIndex(b => b.bottom > top + SLIVER_PX);
  return i < 0 ? boxes.length - 1 : i;
}

/** A journal scroll area's top, and its cells' boxes. */
function journalBoxes(scroller: Element): { top: number; boxes: CellBox[] } {
  const boxes = [...scroller.querySelectorAll<HTMLElement>('.journal-cell')].map(a => {
    const r = a.getBoundingClientRect();
    return { id: a.dataset.cellId, top: r.top, bottom: r.bottom };
  });
  return { top: scroller.getBoundingClientRect().top, boxes };
}

/** The first journal cell showing at the top of the journal's scroll area, by index. */
export function firstVisibleJournalCell(root: ParentNode = document): number | undefined {
  const scroller = root.querySelector('.journal-scroll');
  if (!scroller) return undefined;
  const { top, boxes } = journalBoxes(scroller);
  return firstVisibleIndex(top, boxes);
}

/** Where the reader is in a journal's scroll area. */
export function positionIn(scroller: Element): ReadingPosition | undefined {
  const { top, boxes } = journalBoxes(scroller);
  return readingPosition(top, boxes);
}

const POSITIONS_KEY = 'ganymede.journal.positions';
/** How many journals' positions are kept; the oldest go first. */
export const MAX_POSITIONS = 200;

type StoredPosition = ReadingPosition & { server: string; path: string };

/** The stored positions, oldest first; none when unreadable. */
function loadPositions(): StoredPosition[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(POSITIONS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap(e =>
      isRecord(e) &&
      typeof e.server === 'string' &&
      typeof e.path === 'string' &&
      typeof e.cell === 'string' &&
      typeof e.offset === 'number' &&
      Number.isFinite(e.offset) &&
      typeof e.cells === 'number' &&
      Number.isFinite(e.cells)
        ? [{ server: e.server, path: e.path, cell: e.cell, offset: e.offset, cells: e.cells }]
        : [],
    );
  } catch {
    return [];
  }
}

/** Store the list; false when the browser wouldn't (private mode, no room). */
function storePositions(list: readonly StoredPosition[]): boolean {
  try {
    localStorage.setItem(POSITIONS_KEY, JSON.stringify(list.slice(-MAX_POSITIONS)));
    return true;
  } catch {
    return false;
  }
}

/** Where the reader was in `path` on `server` the last time, if known. */
export function readPosition(server: string, path: string): ReadingPosition | undefined {
  const e = loadPositions().find(p => p.server === server && p.path === path);
  return e ? { cell: e.cell, offset: e.offset, cells: e.cells } : undefined;
}

/**
 * Remember where the reader is. A convenience: false when it could not be
 * stored, which the view does not report (it works the same without).
 */
export function savePosition(server: string, path: string, pos: ReadingPosition): boolean {
  const list = loadPositions().filter(p => !(p.server === server && p.path === path));
  list.push({ server, path, cell: pos.cell, offset: pos.offset, cells: pos.cells });
  return storePositions(list);
}

/** Paths moved or deleted from, whose open view must not save under them again. */
const retired: { server: string; from: string }[] = [];

const covers = (from: string, path: string) => path === from || path.startsWith(`${from}/`);

/**
 * Whether `path` on `server` was renamed, moved or deleted since a view
 * last claimed it: the view still open on it saves nothing under it.
 */
export function positionRetired(server: string, path: string): boolean {
  return retired.some(r => r.server === server && covers(r.from, path));
}

/** A view opens on `path`: what was moved from it earlier no longer bars it. */
export function claimPosition(server: string, path: string): void {
  for (let i = retired.length - 1; i >= 0; i--) {
    if (retired[i]!.server === server && covers(retired[i]!.from, path)) retired.splice(i, 1);
  }
}

/**
 * The positions follow a file or folder moved from `from` to `to`, or go
 * when it was deleted (`to` null). A view still open on the old path
 * doesn't write its position back there ({@link positionRetired}).
 */
export function movePositions(server: string, from: string, to: string | null): void {
  retired.push({ server, from });
  if (retired.length > 50) retired.shift();
  const list = loadPositions();
  let changed = false;
  const next = list.flatMap(p => {
    if (p.server !== server || (p.path !== from && !p.path.startsWith(`${from}/`))) return [p];
    changed = true;
    return to === null ? [] : [{ ...p, path: to + p.path.slice(from.length) }];
  });
  if (changed) storePositions(next);
}

/** Forget every position (tests). */
export function forgetPositions(): void {
  retired.length = 0;
  try {
    localStorage.removeItem(POSITIONS_KEY);
  } catch {
    // Nothing stored that could be forgotten.
  }
}

// The status line -----------------------------------------------------------

/** One awareness state, as far as the status line reads it. */
export type AwarenessState = {
  user?: { display_name?: unknown; name?: unknown; username?: unknown };
};

/**
 * Who is in the room, by awareness names: this client first, as "You",
 * then the others, sorted, once each; a client with no name is "A person".
 */
export function presenceNames(
  states: ReadonlyMap<number, AwarenessState>,
  selfId: number,
): string[] {
  const others = new Set<string>();
  let self = false;
  for (const [id, state] of states) {
    if (id === selfId) {
      self = true;
      continue;
    }
    const user = isRecord(state) ? state.user : undefined;
    const name =
      (isRecord(user) && (text(user.display_name) ?? text(user.name) ?? text(user.username))) ||
      'A person';
    others.add(name);
  }
  return [...(self ? ['You'] : []), ...[...others].sort((a, b) => a.localeCompare(b))];
}

/** "just now", "5 min ago", "2 h ago", "3 d ago". */
export function timeAgo(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

/**
 * The latest `at` among the cells' agent metadata, as a time: where "last
 * change" starts before the view has seen one.
 */
export function latestAgentTime(
  cells: readonly Pick<JournalCellData, 'metadata'>[],
): number | undefined {
  let latest: number | undefined;
  for (const c of cells) {
    const at = text(agentMetadata(c)?.at);
    const t = at ? Date.parse(at) : NaN;
    if (!Number.isNaN(t) && (latest === undefined || t > latest)) latest = t;
  }
  return latest;
}

/**
 * The cell being run, as "<name> is running cell N" (N counts from 1), from
 * the cells' execution state: the first running one. The name is the agent
 * that wrote the cell, else "Someone".
 */
export function runningLine(
  cells: readonly (Pick<JournalCellData, 'metadata'> & { running?: boolean })[],
): string | undefined {
  const i = cells.findIndex(c => c.running);
  if (i < 0) return undefined;
  const by = agentMetadata(cells[i]!)?.by;
  return `${text(by) ?? 'Someone'} is running cell ${i + 1}`;
}

// Writing to the journal ----------------------------------------------------

/** The cell the composer adds at the end of the notebook. */
export type NewCell = { cell_type: 'markdown'; source: string; metadata: Record<string, never> };

/** A Markdown note: the text as typed, trimmed. Undefined when it is blank. */
export function noteCell(input: string): NewCell | undefined {
  const source = input.trim();
  return source ? { cell_type: 'markdown', source, metadata: {} } : undefined;
}

/**
 * A request to the agent: a Markdown cell starting with `@agent`
 * (docs/live-agent-edits.md), which `ganymede mcp watch` reports once it
 * has stayed the same for a few seconds. Text that already starts with
 * `@agent` isn't given a second one. Undefined when blank.
 */
export function requestCell(input: string): NewCell | undefined {
  const body = input.trim();
  if (!body) return undefined;
  const source = /^@agent(?![\w-])/i.test(body) ? body : `@agent ${body}`;
  return { cell_type: 'markdown', source, metadata: {} };
}

/**
 * The names agents wrote cells under (`metadata.ganymede.agent.by`): the
 * client names a request can be addressed to besides `@agent`.
 */
export function agentNames(cells: readonly Pick<JournalCellData, 'metadata'>[]): string[] {
  const names = new Set<string>();
  for (const c of cells) {
    const by = text(agentMetadata(c)?.by);
    if (by) names.add(by);
  }
  return [...names];
}

/**
 * Whether a Markdown cell is a request, and whether the agent answered it.
 * As the server reads it (`mcp/marks.rs`): the text starts with `@agent`, or
 * `@` and a client's name (`@claude-code`) or its first part (`@claude`),
 * ignoring case, in a cell a person wrote (one without agent metadata);
 * it is answered when `metadata.ganymede.request` has `done`
 * and this cell's own `id` (a copy of an answered request keeps the
 * metadata under a new id, and is a new request). `clients` are the
 * names the page knows agents by (see {@link agentNames}); the server's
 * is the connected client's, which the page doesn't see.
 */
export function requestState(
  cell: JournalCellData,
  clients: readonly string[] = [],
): 'open' | 'answered' | undefined {
  if (cell.cell_type !== 'markdown') return undefined;
  // Only a person's cell is a request: the server skips what an agent wrote.
  if (agentMetadata(cell)) return undefined;
  const word = /^@([\p{L}\p{N}_-]+)/u.exec(sourceOf(cell).trimStart())?.[1]?.toLowerCase();
  if (!word) return undefined;
  const ganymede = isRecord(cell.metadata) ? cell.metadata.ganymede : undefined;
  const request = isRecord(ganymede) ? ganymede.request : undefined;
  if (isRecord(request) && 'done' in request && cell.id !== undefined && request.id === cell.id) {
    return 'answered';
  }
  const asked = (name: string) => {
    const client = name.toLowerCase();
    return word === client || word === client.split(/[-_ ]/)[0];
  };
  return word === 'agent' || clients.some(asked) ? 'open' : undefined;
}

/**
 * The id of the cell that answered a request (`metadata.ganymede.request.answer`,
 * which the server writes with `done`), when the request is answered.
 */
export function requestAnswer(cell: JournalCellData): string | undefined {
  if (requestState(cell) !== 'answered') return undefined;
  const ganymede = isRecord(cell.metadata) ? cell.metadata.ganymede : undefined;
  const request = isRecord(ganymede) ? ganymede.request : undefined;
  return isRecord(request) ? text(request.answer) : undefined;
}

/** What saving a request came to: the chip says it. */
export type RequestSave = 'saving' | 'saved' | 'not saved';

/** The chip's text for a request: `request`, `request · saving…`, `request · saved`, ... */
export function requestChip(state: 'open' | 'answered', save?: RequestSave): string {
  if (state === 'answered') return 'request · answered';
  return save ? `request · ${save === 'saving' ? 'saving…' : save}` : 'request';
}

// Trust ---------------------------------------------------------------------

/** What the trust helpers read of a notebook model: its cells. */
type CellsModel = {
  cells: { length: number; get(i: number): { id: string; type: string; trusted?: boolean } };
};

/** The ids of the cells trusted in this page: code cells the model trusts. */
export function trustedCellIds(model: CellsModel): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < model.cells.length; i++) {
    const cell = model.cells.get(i);
    if (cell.type === 'code' && cell.trusted) ids.add(cell.id);
  }
  return ids;
}

/** Whether the cell with `id` is trusted in this page; a cell not in the model is not. */
export function cellTrusted(model: CellsModel, id: string): boolean {
  for (let i = 0; i < model.cells.length; i++) {
    const cell = model.cells.get(i);
    if (cell.id === id) return cell.type === 'code' && !!cell.trusted;
  }
  return false;
}

// Attachments ---------------------------------------------------------------

/** The image types a Markdown cell's attachment may be, as JupyterLab's. */
const ATTACHMENT_IMAGES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * The `data:` URL for an `attachment:<name>` URL, from a cell's
 * `attachments` ({name: {mime: base64}}); undefined when the cell has no
 * such attachment or it isn't a known image type.
 */
export function attachmentDataUrl(attachments: unknown, url: string): string | undefined {
  if (!isRecord(attachments) || !url.startsWith('attachment:')) return undefined;
  const bundle = attachments[url.slice('attachment:'.length)];
  if (!isRecord(bundle)) return undefined;
  const mime = Object.keys(bundle)[0];
  if (!mime || !ATTACHMENT_IMAGES.has(mime)) return undefined;
  const data = bundle[mime];
  const base64 = Array.isArray(data) ? data.join('') : data;
  return typeof base64 === 'string'
    ? `data:${mime};base64,${base64.replace(/\s/g, '')}`
    : undefined;
}

// The view a person chose ---------------------------------------------------

/** Keyed by server, then path. */
const chosen = new Map<string, Map<string, boolean>>();

/** The view the person chose for `path` on `server` this session: true for the journal. */
export function chosenView(server: string, path: string): boolean | undefined {
  return chosen.get(server)?.get(path);
}

/** Remember the person's choice for `path` on `server`; a reopen of the file keeps it. */
export function chooseView(server: string, path: string, journal: boolean): void {
  let paths = chosen.get(server);
  if (!paths) chosen.set(server, (paths = new Map()));
  paths.set(path, journal);
}

/**
 * The choices follow a file or folder moved from `from` to `to`, or are
 * dropped when it was deleted (`to` null).
 */
export function moveChosenViews(server: string, from: string, to: string | null): void {
  const paths = chosen.get(server);
  if (!paths) return;
  for (const [p, journal] of [...paths]) {
    if (p !== from && !p.startsWith(`${from}/`)) continue;
    paths.delete(p);
    if (to !== null) paths.set(to + p.slice(from.length), journal);
  }
}

/** Forget every choice (tests). */
export function forgetChosenViews(): void {
  chosen.clear();
}

// The header -------------------------------------------------------------------

/** What the header says of the notebook. */
export type JournalHeaderData = {
  /** The mono line above the title: "PYTHON · 9 NOV 2026". */
  eyebrow: string;
  title: string;
  /** Who started it and the cell count: each a short phrase. */
  details: string[];
};

/**
 * The eyebrow's day, as the header shows it: "9 Nov 2026" (the CSS uppercases
 * it). `toLocaleDateString()` wrote it as the reader's locale does, which is
 * "11/26/2026" in the US (#852).
 */
export function eyebrowDate(at: Date): string {
  return at.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The header's text: an eyebrow of the language and the day the earliest
 * agent cell was written (#852); the notebook's `metadata.title` or else the
 * file name without its extension; who started it (the agent of the
 * earliest-dated agent cell) and the cell count.
 */
export function journalHeader(
  metadata: unknown,
  cells: readonly Pick<JournalCellData, 'metadata'>[],
  fileName: string,
  formatDate: (at: Date) => string = eyebrowDate,
): JournalHeaderData {
  const meta = isRecord(metadata) ? metadata : {};
  const title = text(meta.title) ?? (fileName.replace(/\.ipynb$/i, '') || fileName);
  const kernelspec = isRecord(meta.kernelspec) ? meta.kernelspec : {};
  const info = isRecord(meta.language_info) ? meta.language_info : {};
  const language = text(kernelspec.language) ?? text(info.name) ?? text(kernelspec.display_name);
  // The agent and time of the earliest-dated agent cell; with no dates, the
  // first agent in document order.
  let by: string | undefined;
  let first: number | undefined;
  for (const c of cells) {
    const agent = agentMetadata(c);
    const at = text(agent?.at);
    const t = at ? Date.parse(at) : NaN;
    if (!Number.isNaN(t) && (first === undefined || t < first)) {
      first = t;
      by = text(agent?.by);
    }
  }
  by ??= agentNames(cells)[0];
  const eyebrow = [language, first !== undefined ? formatDate(new Date(first)) : undefined]
    .filter((part): part is string => part !== undefined)
    .join(' · ');
  const details: string[] = [];
  if (by) details.push(`Started by ${by}`);
  details.push(cells.length === 1 ? '1 cell' : `${cells.length} cells`);
  return { eyebrow, title, details };
}
