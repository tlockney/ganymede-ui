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
 * Whether a Markdown cell is a request, and whether the agent answered it
 * (`metadata.ganymede.request.done`).
 */
export function requestState(cell: JournalCellData): 'open' | 'answered' | undefined {
  if (cell.cell_type !== 'markdown' || !/^@\S/.test(sourceOf(cell).trimStart())) return undefined;
  const ganymede = isRecord(cell.metadata) ? cell.metadata.ganymede : undefined;
  const request = isRecord(ganymede) ? ganymede.request : undefined;
  if (isRecord(request) && request.done) return 'answered';
  return /^@agent(?![\w-])/i.test(sourceOf(cell).trimStart()) ? 'open' : undefined;
}
