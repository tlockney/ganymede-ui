import { describe, expect, it } from 'vitest';
import { ServerConnection } from '@jupyterlab/services';
import {
  type Room,
  agentsAt,
  composerHint,
  fetchRooms,
  isJournal,
  journalStatus,
  journalsOf,
  parseRooms,
} from './journals';

const room = (path: string, over: Partial<Room> = {}): Room => ({
  path,
  clients: [],
  lastChange: null,
  ...over,
});

describe('parseRooms', () => {
  it('reads the rooms endpoint’s answer', () => {
    expect(
      parseRooms({
        rooms: [
          {
            path: 'journal/day.ipynb',
            file_id: 'f1',
            format: 'json',
            type: 'notebook',
            clients: [
              { name: 'Claude', kind: 'agent' },
              { name: 'Thomas', kind: 'person' },
              { name: 'x', kind: 'robot' },
            ],
            last_change: { at: '2026-11-20T10:00:00Z', by: 'Claude', person: false },
          },
          { path: 'b.ipynb', clients: [], last_change: null },
          { clients: [] },
          'junk',
        ],
      }),
    ).toEqual([
      {
        path: 'journal/day.ipynb',
        fileId: 'f1',
        format: 'json',
        type: 'notebook',
        clients: [
          { name: 'Claude', kind: 'agent' },
          { name: 'Thomas', kind: 'person' },
        ],
        lastChange: { at: '2026-11-20T10:00:00Z', by: 'Claude', person: false },
      },
      { path: 'b.ipynb', clients: [], lastChange: null },
    ]);
    expect(parseRooms(null)).toEqual([]);
    expect(parseRooms({ rooms: 'x' })).toEqual([]);
  });
});

describe('journals', () => {
  const person = { at: '2026-11-20T10:00:00Z', by: 'Thomas', person: true };
  const agent = (at: string) => ({ at, by: 'Claude', person: false });

  it('are the rooms an agent is in, or that an agent changed last', () => {
    expect(isJournal(room('a.ipynb', { clients: [{ name: 'Claude', kind: 'agent' }] }))).toBe(true);
    expect(isJournal(room('a.ipynb', { lastChange: agent('2026-11-20T09:00:00Z') }))).toBe(true);
    // People only, last changed by a person, or never: an ordinary open notebook.
    expect(
      isJournal(room('a.ipynb', { clients: [{ name: 'T', kind: 'person' }], lastChange: person })),
    ).toBe(false);
    expect(isJournal(room('a.ipynb'))).toBe(false);
    // Not a notebook room.
    expect(isJournal(room('a.md', { type: 'file', clients: [{ name: 'C', kind: 'agent' }] }))).toBe(
      false,
    );
  });

  it('list running ones first, then newest change first', () => {
    const list = journalsOf([
      room('people.ipynb', { clients: [{ name: 'T', kind: 'person' }], lastChange: person }),
      room('old.ipynb', { lastChange: agent('2026-11-19T09:00:00Z') }),
      room('new.ipynb', { lastChange: agent('2026-11-20T09:00:00Z') }),
      room('live/Day 1.ipynb', {
        clients: [{ name: 'Claude', kind: 'agent' }],
        lastChange: agent('2026-11-18T09:00:00Z'),
      }),
    ]);
    expect(list.map(j => j.path)).toEqual(['live/Day 1.ipynb', 'new.ipynb', 'old.ipynb']);
    expect(list[0]).toMatchObject({ name: 'Day 1', agent: 'Claude', running: true });
    expect(list[1]).toMatchObject({ agent: 'Claude', running: false });
  });

  it('say running, or when it last changed', () => {
    const now = Date.parse('2026-11-20T12:00:00Z');
    const j = (over: object) => ({ path: 'a', name: 'a', running: false, ...over });
    expect(journalStatus(j({ running: true }), now)).toBe('running');
    expect(journalStatus(j({ lastChangeAt: '2026-11-20T11:58:00Z' }), now)).toBe('2 min ago');
    expect(journalStatus(j({ lastChangeAt: '2026-11-20T09:00:00Z' }), now)).toBe('3 h ago');
    expect(journalStatus(j({ lastChangeAt: '2026-11-18T12:00:00Z' }), now)).toBe('2 d ago');
    expect(journalStatus(j({}), now)).toBe('no changes yet');
  });
});

describe('fetchRooms', () => {
  const settingsAnswering = (status: number, body: unknown) =>
    ServerConnection.makeSettings({
      baseUrl: 'http://127.0.0.1:1/machines/m1/',
      fetch: (async () =>
        new Response(JSON.stringify(body), { status })) as unknown as typeof fetch,
    });

  it('reads rooms through the mount', async () => {
    const urls: string[] = [];
    const settings = ServerConnection.makeSettings({
      baseUrl: 'http://127.0.0.1:1/machines/m1/',
      fetch: (async (r: Request) => {
        urls.push(r.url.split('?')[0]!);
        return new Response(JSON.stringify({ rooms: [{ path: 'a.ipynb', clients: [] }] }));
      }) as unknown as typeof fetch,
    });
    expect(await fetchRooms(settings)).toEqual({ kind: 'rooms', rooms: [room('a.ipynb')] });
    expect(urls).toEqual(['http://127.0.0.1:1/machines/m1/api/collaboration/rooms']);
  });

  it('says an older server is unsupported, on a 404', async () => {
    expect(await fetchRooms(settingsAnswering(404, {}))).toEqual({ kind: 'unsupported' });
  });

  it('reports other failures', async () => {
    expect(await fetchRooms(settingsAnswering(502, {}))).toEqual({
      kind: 'error',
      message: 'The server answered 502.',
    });
  });
});

describe('agents at a path (#724)', () => {
  const rooms = {
    kind: 'rooms' as const,
    rooms: [
      room('a.ipynb', {
        clients: [
          { name: 'claude-code', kind: 'agent' },
          { name: 'Thomas', kind: 'person' },
          { name: 'claude-code', kind: 'agent' },
        ],
      }),
    ],
  };

  it('lists the agents in that room, once each; none when no room is open for it', () => {
    expect(agentsAt(rooms, 'a.ipynb')).toEqual(['claude-code']);
    expect(agentsAt(rooms, 'b.ipynb')).toEqual([]);
  });

  it('knows nothing before an answer, from an older server, or on an error', () => {
    expect(agentsAt(undefined, 'a.ipynb')).toBeUndefined();
    expect(agentsAt({ kind: 'unsupported' }, 'a.ipynb')).toBeUndefined();
    expect(agentsAt({ kind: 'error', message: 'x' }, 'a.ipynb')).toBeUndefined();
  });

  it('words the composer line', () => {
    expect(composerHint(undefined)).toBeUndefined();
    expect(composerHint([])).toMatch(/^No agent is in the room\./);
    expect(composerHint(['claude-code'])).toBe('claude-code is in the room.');
    expect(composerHint(['a', 'b'])).toBe('a, b are in the room.');
  });
});
