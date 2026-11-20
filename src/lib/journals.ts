/**
 * A place's journals (#701): the notebooks an agent is in, from the
 * server's open rooms (`GET api/collaboration/rooms`, ganymede#893).
 */
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { useEffect, useState } from 'react';
import { hasDotSegment } from './launch';

export type RoomClient = { name: string; kind: 'person' | 'agent' };

export type Room = {
  path: string;
  fileId?: string;
  format?: string;
  type?: string;
  clients: RoomClient[];
  lastChange: { at: string; by: string; person: boolean } | null;
};

/** What a rooms request came to. `unsupported`: an older server answered 404. */
export type RoomsResult =
  { kind: 'rooms'; rooms: Room[] } | { kind: 'unsupported' } | { kind: 'error'; message: string };

/**
 * Reads the rooms answer, dropping entries without a path. A `last_change`
 * says by whom and whether that was a person; one with no `at` is none.
 */
export function parseRooms(body: unknown): Room[] {
  const list = (body as { rooms?: unknown } | null)?.rooms;
  if (!Array.isArray(list)) return [];
  const rooms: Room[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.path !== 'string' || !r.path) continue;
    // A machine sends the paths: not one that climbs out of its mount.
    if (hasDotSegment(r.path) || r.path.includes('\\')) continue;
    const clients: RoomClient[] = [];
    if (Array.isArray(r.clients)) {
      for (const c of r.clients) {
        const { name, kind } = (c ?? {}) as { name?: unknown; kind?: unknown };
        if (typeof name === 'string' && (kind === 'person' || kind === 'agent')) {
          clients.push({ name, kind });
        }
      }
    }
    const lc = r.last_change as { at?: unknown; by?: unknown; person?: unknown } | null | undefined;
    const lastChange =
      lc && typeof lc.at === 'string'
        ? {
            at: lc.at,
            by: typeof lc.by === 'string' ? lc.by : '',
            person: lc.person === true,
          }
        : null;
    rooms.push({
      path: r.path,
      ...(typeof r.file_id === 'string' ? { fileId: r.file_id } : {}),
      ...(typeof r.format === 'string' ? { format: r.format } : {}),
      ...(typeof r.type === 'string' ? { type: r.type } : {}),
      clients,
      lastChange,
    });
  }
  return rooms;
}

/**
 * The agents in the room for `path` now, by name; undefined while the
 * server hasn't said or can't (an older server, or an error). No room for
 * the path means none (#724).
 */
export function agentsAt(result: RoomsResult | undefined, path: string): string[] | undefined {
  if (result?.kind !== 'rooms') return undefined;
  const room = result.rooms.find(r => r.path === path);
  return room ? [...new Set(agentsIn(room).map(c => c.name))] : [];
}

/**
 * What the journal's composer says about who is there to see a request
 * (#724): the agents in the room, or that none is. A request is saved in
 * the notebook either way, and `ganymede mcp watch` reports the open
 * notebook's requests to an agent watching its folder. Nothing while it
 * isn't known.
 */
export function composerHint(agents: readonly string[] | undefined): string | undefined {
  if (!agents) return undefined;
  if (agents.length === 0) {
    return 'No agent is in the room. A request is saved in the notebook; an agent watching this folder is told while the notebook stays open.';
  }
  return `${agents.join(', ')} ${agents.length === 1 ? 'is' : 'are'} in the room.`;
}

/** An agent is in the room now. */
export function agentsIn(room: Room): RoomClient[] {
  return room.clients.filter(c => c.kind === 'agent');
}

/**
 * Whether the room is a journal: an agent is in it, or an agent was the
 * last to change it (`last_change.person` false). A room only people are
 * in, last changed by a person, is an ordinary open notebook.
 */
export function isJournal(room: Room): boolean {
  if (room.type && room.type !== 'notebook') return false;
  return agentsIn(room).length > 0 || (!!room.lastChange && !room.lastChange.person);
}

export type Journal = {
  path: string;
  /** The notebook's name without `.ipynb`. */
  name: string;
  /** The agent in it now, or the one that last wrote. */
  agent?: string;
  /** An agent is in it now: shown as running. */
  running: boolean;
  lastChangeAt?: string;
};

/**
 * The journals among `rooms`, running ones first, then newest change
 * first, then by path so the order is stable.
 */
export function journalsOf(rooms: Room[]): Journal[] {
  return rooms
    .filter(isJournal)
    .map(room => {
      const agents = agentsIn(room);
      const lastByAgent = room.lastChange && !room.lastChange.person ? room.lastChange.by : '';
      return {
        path: room.path,
        name: (room.path.split('/').pop() ?? room.path).replace(/\.ipynb$/, '') || room.path,
        ...(agents[0]?.name || lastByAgent ? { agent: agents[0]?.name || lastByAgent } : {}),
        running: agents.length > 0,
        ...(room.lastChange ? { lastChangeAt: room.lastChange.at } : {}),
      };
    })
    .sort((a, b) => {
      if (a.running !== b.running) return a.running ? -1 : 1;
      const at = Date.parse(a.lastChangeAt ?? '') || 0;
      const bt = Date.parse(b.lastChangeAt ?? '') || 0;
      return bt - at || a.path.localeCompare(b.path);
    });
}

/** "running", or "2 min ago": the journal's second line. */
export function journalStatus(j: Journal, now = Date.now()): string {
  if (j.running) return 'running';
  const t = Date.parse(j.lastChangeAt ?? '');
  if (!t) return 'no changes yet';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

/** Fetches the place's rooms; 404 means a server older than ganymede#893. */
export async function fetchRooms(settings: ServerConnection.ISettings): Promise<RoomsResult> {
  const url = URLExt.join(settings.baseUrl, 'api/collaboration/rooms');
  try {
    const res = await ServerConnection.makeRequest(url, {}, settings);
    if (res.status === 404) return { kind: 'unsupported' };
    if (!res.ok) return { kind: 'error', message: `The server answered ${res.status}.` };
    return { kind: 'rooms', rooms: parseRooms(await res.json()) };
  } catch (e) {
    return { kind: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

/** How often the Journals tab asks again while it shows. */
export const JOURNALS_POLL_MS = 5_000;

/** The place's rooms while `active`, refreshed every `JOURNALS_POLL_MS`. */
export function useRooms(
  settings: ServerConnection.ISettings | undefined,
  active: boolean,
): RoomsResult | undefined {
  const [result, setResult] = useState<RoomsResult>();
  useEffect(() => {
    if (!settings || !active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      const r = await fetchRooms(settings);
      if (stopped) return;
      setResult(r);
      // An older server won't start answering: don't ask again.
      if (r.kind !== 'unsupported') timer = setTimeout(() => void run(), JOURNALS_POLL_MS);
    };
    void run();
    return () => {
      stopped = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [settings, active]);
  return result;
}
