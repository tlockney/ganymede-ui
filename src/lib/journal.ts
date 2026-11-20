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

/** "3 new cells · Follow". */
export function followLabel(count: number): string {
  return `${count} new ${count === 1 ? 'cell' : 'cells'} · Follow`;
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
  title: string;
  /** Kernel or language, who started it and when, the cell count: each a short phrase. */
  details: string[];
};

/**
 * The header's text: the notebook's `metadata.title` or else the file name
 * without its extension; the kernel (its display name, else its language);
 * who started it (the agent of the earliest-dated agent cell) and when; and the cell count.
 */
export function journalHeader(
  metadata: unknown,
  cells: readonly Pick<JournalCellData, 'metadata'>[],
  fileName: string,
  formatDate: (at: Date) => string = d => d.toLocaleDateString(),
): JournalHeaderData {
  const meta = isRecord(metadata) ? metadata : {};
  const title = text(meta.title) ?? (fileName.replace(/\.ipynb$/i, '') || fileName);
  const kernelspec = isRecord(meta.kernelspec) ? meta.kernelspec : {};
  const info = isRecord(meta.language_info) ? meta.language_info : {};
  const kernel = text(kernelspec.display_name) ?? text(info.name) ?? text(kernelspec.language);
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
  const details: string[] = [];
  if (kernel) details.push(kernel);
  if (by || first !== undefined) {
    details.push(
      `Started${by ? ` by ${by}` : ''}${first !== undefined ? ` ${formatDate(new Date(first))}` : ''}`,
    );
  }
  details.push(cells.length === 1 ? '1 cell' : `${cells.length} cells`);
  return { title, details };
}
