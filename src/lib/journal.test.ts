import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  agentNames,
  chooseView,
  chosenView,
  displayTitle,
  forgetChosenViews,
  journalHeader,
  moveChosenViews,
  notebookTitle,
  notebookLanguage,
  attachmentDataUrl,
  cellTrusted,
  trustedCellIds,
  FOLLOWING,
  atBottom,
  classifyProvenance,
  MAX_POSITIONS,
  firstVisibleIndex,
  followLabel,
  followsLate,
  forgetPositions,
  initialFollow,
  claimPosition,
  movePositions,
  positionRetired,
  readPosition,
  readingPosition,
  requestAnswer,
  requestChip,
  savePosition,
  showFollow,
  foldLabel,
  foldSummary,
  hasAgentCells,
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
  timeAgo,
} from './journal';

const agent = (mode: string, extra: Record<string, unknown> = {}) => ({
  cell_type: 'code',
  source: 'x',
  metadata: {
    ganymede: { agent: { by: 'claude-code', mode, at: '2026-11-20T10:00:00Z', ...extra } },
  },
});

describe('classifyProvenance', () => {
  it('says an agent ran a cell it executed, with its execution count', () => {
    expect(classifyProvenance({ ...agent('executed'), execution_count: 4 })).toEqual({
      kind: 'executed',
      label: 'Agent ran it',
      by: 'claude-code',
      at: '2026-11-20T10:00:00Z',
      count: 4,
    });
  });

  it('has no count for an executed cell that has not run, or for other modes', () => {
    expect(
      classifyProvenance({ ...agent('executed'), execution_count: null }).count,
    ).toBeUndefined();
    expect(classifyProvenance({ ...agent('recorded'), execution_count: 2 }).count).toBeUndefined();
  });

  it('tells recorded steps and notes apart', () => {
    expect(classifyProvenance(agent('recorded'))).toMatchObject({
      kind: 'recorded',
      label: 'Recorded step',
    });
    expect(classifyProvenance(agent('note'))).toMatchObject({ kind: 'note', label: 'Agent note' });
  });

  it('calls agent metadata with an unknown or missing mode just an agent’s', () => {
    expect(classifyProvenance(agent('future'))).toMatchObject({ kind: 'agent', label: 'Agent' });
    const bare = { cell_type: 'code', source: '', metadata: { ganymede: { agent: {} } } };
    expect(classifyProvenance(bare)).toMatchObject({ kind: 'agent', by: undefined, at: undefined });
  });

  it('calls a cell with no agent metadata a person’s, whatever else it holds', () => {
    for (const metadata of [
      undefined,
      {},
      { ganymede: {} },
      { ganymede: { agent: 'x' } },
      { ganymede: { agent: [] } },
    ]) {
      expect(classifyProvenance({ cell_type: 'markdown', source: '', metadata })).toEqual({
        kind: 'person',
        label: 'Person',
      });
    }
  });

  it('knows a notebook has agent cells', () => {
    expect(hasAgentCells([{ metadata: {} }, agent('note')])).toBe(true);
    expect(hasAgentCells([{ metadata: {} }, { metadata: { ganymede: { request: {} } } }])).toBe(
      false,
    );
    expect(hasAgentCells([])).toBe(false);
  });
});

describe('revisions', () => {
  it('reads the history oldest first and counts this source as the last', () => {
    const cell = agent('executed', {
      history: [{ source: 'a', by: 'claude-code', at: 't1' }, { source: 'b' }, 7, { by: 'x' }],
    });
    const revisions = revisionsOf(cell);
    expect(revisions).toEqual([
      { source: 'a', by: 'claude-code', at: 't1' },
      { source: 'b', by: undefined, at: undefined },
    ]);
    expect(revisionNumber(revisions)).toBe(3);
  });

  it('has none without history', () => {
    expect(revisionsOf(agent('note'))).toEqual([]);
    expect(revisionsOf(agent('note', { history: 'x' }))).toEqual([]);
  });
});

describe('fold summary', () => {
  it('shows the first non-blank line and the line count', () => {
    expect(foldSummary('\n  import x  \nprint(x)\n')).toEqual({ first: 'import x', lines: 3 });
    expect(foldLabel('a = 1\nb = 2\nc = 3')).toBe('▸ a = 1 · 3 lines');
  });

  it('says "1 line", ignores a trailing newline, and handles CRLF', () => {
    expect(foldLabel('1 + 1')).toBe('▸ 1 + 1 · 1 line');
    expect(foldLabel('1 + 1\n')).toBe('▸ 1 + 1 · 1 line');
    expect(foldSummary('a\r\nb').lines).toBe(2);
  });

  it('cuts a long first line with an ellipsis', () => {
    const { first } = foldSummary('x'.repeat(200));
    expect([...first]).toHaveLength(80);
    expect(first.endsWith('…')).toBe(true);
  });

  it('has a label for an empty cell', () => {
    expect(foldLabel('')).toBe('▸ (empty) · 0 lines');
  });
});

describe('following along', () => {
  const near = { scrollTop: 900, clientHeight: 100, scrollHeight: 1020 };

  it('is at the bottom within a little of the end', () => {
    expect(atBottom(near)).toBe(true);
    expect(atBottom({ ...near, scrollTop: 500 })).toBe(false);
  });

  it('pauses when the person scrolls up, remembering how many cells there were', () => {
    expect(nextFollow(FOLLOWING, { type: 'scroll', atBottom: false, cells: 5 })).toEqual({
      following: false,
      pausedAt: 5,
    });
  });

  it('stays paused at the first count while the person keeps scrolling', () => {
    const paused = nextFollow(FOLLOWING, { type: 'scroll', atBottom: false, cells: 5 });
    expect(nextFollow(paused, { type: 'scroll', atBottom: false, cells: 8 })).toBe(paused);
  });

  it('resumes by scrolling back to the bottom, or with Follow', () => {
    const paused = { following: false, pausedAt: 5 } as const;
    expect(nextFollow(paused, { type: 'scroll', atBottom: true, cells: 8 })).toBe(FOLLOWING);
    expect(nextFollow(paused, { type: 'resume' })).toBe(FOLLOWING);
    expect(nextFollow(FOLLOWING, { type: 'resume' })).toBe(FOLLOWING);
    expect(nextFollow(FOLLOWING, { type: 'scroll', atBottom: true, cells: 8 })).toBe(FOLLOWING);
  });

  it('counts the cells added since the pause, none while following', () => {
    expect(newCellCount(FOLLOWING, 9)).toBe(0);
    expect(newCellCount({ following: false, pausedAt: 5 }, 8)).toBe(3);
    // A deletion never makes it negative.
    expect(newCellCount({ following: false, pausedAt: 5 }, 4)).toBe(0);
    expect(followLabel(1)).toBe('1 new · Follow live');
    expect(followLabel(3)).toBe('3 new · Follow live');
    expect(followLabel(0)).toBe('Follow live');
  });
});

describe('status line', () => {
  it('lists the awareness names, this client first as You', () => {
    const states = new Map([
      [1, { user: { display_name: 'Thomas' } }],
      [2, { user: { name: 'claude-code' } }],
      [3, {}],
      [4, { user: { display_name: 'claude-code' } }],
      [5, { user: { username: 'ana' } }],
    ]);
    expect(presenceNames(states, 1)).toEqual(['You', 'A person', 'ana', 'claude-code']);
    expect(presenceNames(new Map(), 1)).toEqual([]);
  });

  it('words the time since the last change', () => {
    const t = Date.parse('2026-11-20T10:00:00Z');
    expect(timeAgo(t, t + 3_000)).toBe('just now');
    expect(timeAgo(t, t + 42_000)).toBe('42 s ago');
    expect(timeAgo(t, t + 5 * 60_000)).toBe('5 min ago');
    expect(timeAgo(t, t + 3 * 3_600_000)).toBe('3 h ago');
    expect(timeAgo(t, t + 72 * 3_600_000)).toBe('3 d ago');
    // A clock a little behind the writer's is not a negative time.
    expect(timeAgo(t, t - 5_000)).toBe('just now');
  });

  it('finds the latest agent time', () => {
    expect(
      latestAgentTime([
        agent('note', {}),
        { metadata: {} },
        { metadata: { ganymede: { agent: { at: '2026-11-21T00:00:00Z' } } } },
        { metadata: { ganymede: { agent: { at: 'garbage' } } } },
      ]),
    ).toBe(Date.parse('2026-11-21T00:00:00Z'));
    expect(latestAgentTime([{ metadata: {} }])).toBeUndefined();
  });

  it('says who is running which cell, counting from 1', () => {
    const cells = [
      { metadata: {} },
      { ...agent('executed'), running: true },
      { metadata: {}, running: true },
    ];
    expect(runningLine(cells)).toBe('claude-code is running cell 2');
    expect(runningLine([{ metadata: {}, running: true }])).toBe('Someone is running cell 1');
    expect(runningLine([{ metadata: {} }])).toBeUndefined();
  });
});

describe('cells the composer adds', () => {
  it('makes a Markdown note from the text, trimmed', () => {
    expect(noteCell('  Checked the 2019 rows.\n')).toEqual({
      cell_type: 'markdown',
      source: 'Checked the 2019 rows.',
      metadata: {},
    });
    expect(noteCell('  \n')).toBeUndefined();
  });

  it('makes a request starting with @agent, as live-agent-edits.md describes', () => {
    expect(requestCell('check the trend')).toEqual({
      cell_type: 'markdown',
      source: '@agent check the trend',
      metadata: {},
    });
    expect(requestCell('   ')).toBeUndefined();
  });

  it('does not give text that already addresses the agent a second @agent', () => {
    expect(requestCell('@agent check it')?.source).toBe('@agent check it');
    expect(requestCell('@Agent check it')?.source).toBe('@Agent check it');
    // A different name is text for the agent, not an address.
    expect(requestCell('@agents are slow')?.source).toBe('@agent @agents are slow');
  });

  it('knows a request cell, and an answered one', () => {
    const md = (source: string, metadata: unknown = {}) => ({
      cell_type: 'markdown',
      source,
      metadata,
    });
    expect(requestState(md('@agent hi'))).toBe('open');
    expect(requestState(md('hello'))).toBeUndefined();
    expect(requestState({ cell_type: 'code', source: '@agent hi' })).toBeUndefined();
    expect(requestState(md('@claude hi'))).toBeUndefined();
    expect(requestState(md('@ hi'))).toBeUndefined();
  });

  it('counts a request to the client the cells name, or its first part, as the server does', () => {
    const md = (source: string) => ({ cell_type: 'markdown', source, metadata: {} });
    expect(requestState(md('@claude-code hi'), ['claude-code'])).toBe('open');
    expect(requestState(md('@Claude: hi'), ['claude-code'])).toBe('open');
    expect(requestState(md('@claudette hi'), ['claude-code'])).toBeUndefined();
    expect(requestState(md('@someone hi'), ['claude-code'])).toBeUndefined();
  });

  it("is answered only when the request is done for this cell's own id", () => {
    const md = (id: string, request: unknown) => ({
      id,
      cell_type: 'markdown',
      source: '@agent hi',
      metadata: { ganymede: { request } },
    });
    expect(requestState(md('a', { done: 't', id: 'a' }))).toBe('answered');
    // A copy (paste, duplicate) keeps the metadata under a new id: a new request.
    expect(requestState(md('b', { done: 't', id: 'a' }))).toBe('open');
    // No id in the metadata, or no done: not answered.
    expect(requestState(md('a', { done: 't' }))).toBe('open');
    expect(requestState(md('a', { id: 'a' }))).toBe('open');
  });

  it('lists the client names the cells were written under', () => {
    expect(agentNames([agent('note'), agent('executed'), { metadata: {} }])).toEqual([
      'claude-code',
    ]);
  });
});

describe('trust', () => {
  const model = (...cells: { id: string; type: string; trusted?: boolean }[]) => ({
    cells: { length: cells.length, get: (i: number) => cells[i]! },
  });
  const m = model(
    { id: 'a', type: 'code', trusted: true },
    { id: 'b', type: 'code', trusted: false },
    { id: 'c', type: 'markdown', trusted: true },
  );

  it('trusts a code cell the model trusts, and no other', () => {
    expect(cellTrusted(m, 'a')).toBe(true);
    expect(cellTrusted(m, 'b')).toBe(false);
    // Only code cells have outputs to trust.
    expect(cellTrusted(m, 'c')).toBe(false);
    expect(cellTrusted(m, 'missing')).toBe(false);
  });

  it('lists the trusted ids in one pass', () => {
    expect([...trustedCellIds(m)]).toEqual(['a']);
  });
});

describe('attachmentDataUrl', () => {
  const attachments = {
    'a.png': { 'image/png': 'AAEC\nAwQ=' },
    'b.svg': { 'image/svg+xml': '<svg/>' },
  };
  it('turns an attached image into a data URL', () => {
    expect(attachmentDataUrl(attachments, 'attachment:a.png')).toBe(
      'data:image/png;base64,AAECAwQ=',
    );
  });
  it('gives nothing for an unknown name, an unsafe type, or another URL', () => {
    expect(attachmentDataUrl(attachments, 'attachment:none.png')).toBeUndefined();
    expect(attachmentDataUrl(attachments, 'attachment:b.svg')).toBeUndefined();
    expect(attachmentDataUrl(attachments, 'https://x/a.png')).toBeUndefined();
    expect(attachmentDataUrl(undefined, 'attachment:a.png')).toBeUndefined();
  });
});

describe('a person-written request', () => {
  it("is not a request when an agent wrote the cell, as the server counts only a person's", () => {
    const cell = (metadata: unknown) => ({ cell_type: 'markdown', source: '@agent hi', metadata });
    expect(requestState(cell({}))).toBe('open');
    expect(requestState(cell(agent('note').metadata))).toBeUndefined();
  });
});

describe('the chosen view', () => {
  beforeEach(forgetChosenViews);

  it('is kept per server and path', () => {
    chooseView('a', 'x.ipynb', true);
    expect(chosenView('a', 'x.ipynb')).toBe(true);
    expect(chosenView('b', 'x.ipynb')).toBeUndefined();
    expect(chosenView('a', 'y.ipynb')).toBeUndefined();
  });

  it('follows a rename, a folder move, and goes with a delete, on its server only', () => {
    chooseView('a', 'w/x.ipynb', false);
    chooseView('a', 'w2/x.ipynb', true);
    chooseView('b', 'w/x.ipynb', true);
    moveChosenViews('a', 'w/x.ipynb', 'w/y.ipynb');
    expect(chosenView('a', 'w/y.ipynb')).toBe(false);
    expect(chosenView('a', 'w/x.ipynb')).toBeUndefined();
    moveChosenViews('a', 'w', 'v');
    expect(chosenView('a', 'v/y.ipynb')).toBe(false);
    // A folder named like a prefix isn't inside it.
    expect(chosenView('a', 'w2/x.ipynb')).toBe(true);
    expect(chosenView('b', 'w/x.ipynb')).toBe(true);
    moveChosenViews('a', 'v', null);
    expect(chosenView('a', 'v/y.ipynb')).toBeUndefined();
  });
});

describe('journalHeader', () => {
  const at = (iso: string) => ({ metadata: agent('note', { at: iso }).metadata });
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  it('puts the language and the earliest day in an eyebrow, then the title and who started it', () => {
    const cells = [
      at('2026-11-19T12:00:00Z'),
      { metadata: {} },
      { metadata: agent('executed', { by: 'other', at: '2026-11-18T12:00:00Z' }).metadata },
    ];
    expect(
      journalHeader(
        { title: 'Trend', kernelspec: { display_name: 'Python 3', name: 'python3' } },
        cells,
        'Trend.ipynb',
        fmt,
      ),
    ).toEqual({
      eyebrow: 'Python 3 · 2026-11-18',
      title: 'Trend',
      details: ['Started by other', '3 cells'],
    });
  });

  it('names the first agent in the notebook when the earliest cell has no agent name', () => {
    const cells = [
      { metadata: agent('note', { by: 'alice', at: '2026-11-19T12:00:00Z' }).metadata },
      { metadata: agent('note', { by: 'bob', at: '2026-11-18T12:00:00Z' }).metadata },
      { metadata: agent('note', { by: '', at: '2026-11-17T12:00:00Z' }).metadata },
    ];
    const header = journalHeader({}, cells, 'x.ipynb', fmt);
    expect(header.eyebrow).toBe('2026-11-17');
    expect(header.details).toEqual(['Started by alice', '3 cells']);
  });

  it('falls back to the file name and the language, and says nothing of a start with no agent', () => {
    expect(
      journalHeader({ language_info: { name: 'python' } }, [{ metadata: {} }], 'Io moons.ipynb'),
    ).toEqual({ eyebrow: 'python', title: 'Io moons', details: ['1 cell'] });
    expect(journalHeader({}, [], 'x.ipynb').details).toEqual(['0 cells']);
    expect(journalHeader({}, [], 'x.ipynb').eyebrow).toBe('');
  });

  it('reads a notebook’s title only when it is a non-empty string (#867)', () => {
    expect(notebookTitle({ title: 'Io moons' })).toBe('Io moons');
    expect(notebookTitle({ title: '  ' })).toBeUndefined();
    expect(notebookTitle({ title: 4 })).toBeUndefined();
    expect(notebookTitle(undefined)).toBeUndefined();
  });

  it('takes a notebook’s display title from its title, else its first H1 (#892)', () => {
    const cells = [
      { type: 'markdown', source: '# **Fremont** Bridge\n\nA journal.' },
      { type: 'code', source: 'bridge = 1' },
    ];
    // metadata.title wins, whatever the cells say.
    expect(displayTitle({ title: 'Io moons' }, cells)).toBe('Io moons');
    // No title: the first level-1 heading, its markup stripped.
    expect(displayTitle({}, cells)).toBe('Fremont Bridge');
    expect(displayTitle(undefined, cells)).toBe('Fremont Bridge');
    // Only an H2: no display title, so the app falls back to the file.
    expect(displayTitle({}, [{ type: 'markdown', source: '## Fremont Bridge' }])).toBeUndefined();
    // Neither.
    expect(displayTitle({}, [])).toBeUndefined();
    expect(displayTitle({}, [{ type: 'markdown', source: 'Just prose.' }])).toBeUndefined();
    // The first H1, not a later one, and not one in a code cell.
    expect(
      displayTitle({}, [
        { type: 'markdown', source: '## First\n\n# Second\n\n# Third' },
        { type: 'code', source: '# comment' },
      ]),
    ).toBe('Second');
  });

  it('reads a notebook’s language from its kernelspec, else its language info (#867)', () => {
    expect(notebookLanguage({ kernelspec: { language: 'typescript' } })).toBe('typescript');
    // The file's kernelspec first, then the kernel's own report.
    expect(
      notebookLanguage({
        kernelspec: { language: 'python' },
        language_info: { name: 'python' },
      }),
    ).toBe('python');
    expect(notebookLanguage({ language_info: { name: 'julia' } })).toBe('julia');
    // A kernelspec with no language leaves the language info to answer.
    expect(notebookLanguage({ kernelspec: { name: 'x' }, language_info: { name: 'R' } })).toBe('R');
    expect(notebookLanguage({ kernelspec: { language: '  ' } })).toBeUndefined();
    expect(notebookLanguage({ kernelspec: { language: 4 } })).toBeUndefined();
    expect(notebookLanguage({})).toBeUndefined();
    expect(notebookLanguage(undefined)).toBeUndefined();
  });
});

describe('the Follow button', () => {
  const paused = { following: false, pausedAt: 4 } as const;

  it('shows for new cells, or for an active journal, only while paused', () => {
    expect(showFollow(paused, 6, false)).toBe(true);
    expect(showFollow(paused, 4, true)).toBe(true);
    // A finished journal read from the start has none.
    expect(showFollow(paused, 4, false)).toBe(false);
    expect(showFollow(FOLLOWING, 9, true)).toBe(false);
  });
});

describe('how a journal opens', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const saved = { cell: 'c', offset: 30, cells: 3 };

  it('follows at the end when it is active and the reader has no position', () => {
    expect(initialFollow({ ids, active: true })).toEqual({
      follow: FOLLOWING,
      scroll: { to: 'end' },
      reason: 'active',
    });
  });

  it('opens an inactive journal at the start, paused at the cells there are', () => {
    expect(initialFollow({ ids, active: false })).toEqual({
      follow: { following: false, pausedAt: 4 },
      scroll: { to: 'start' },
      reason: 'start',
    });
  });

  it('restores the saved position, counting new cells from when the reader left', () => {
    expect(initialFollow({ ids, saved, active: false })).toEqual({
      follow: { following: false, pausedAt: 3 },
      scroll: { to: 'cell', index: 2, offset: 30 },
      reason: 'saved',
    });
  });

  it('follows live work at the end ahead of the saved position', () => {
    expect(initialFollow({ ids, saved, active: true })).toEqual({
      follow: FOLLOWING,
      scroll: { to: 'end' },
      reason: 'active',
    });
  });

  it('clamps the cells counted when the journal has fewer now', () => {
    const open = initialFollow({ ids: ['a', 'c'], saved: { ...saved, cells: 9 }, active: false });
    expect(open.follow).toEqual({ following: false, pausedAt: 2 });
  });

  it('falls through when the saved cell is gone', () => {
    const gone = { cell: 'zz', offset: 5, cells: 4 };
    expect(initialFollow({ ids, saved: gone, active: false }).reason).toBe('start');
    expect(initialFollow({ ids, saved: gone, active: true }).reason).toBe('active');
  });

  it('opens at the cell the reader switched from, ahead of the saved position', () => {
    expect(initialFollow({ ids, startAt: 1, saved, active: true })).toEqual({
      follow: { following: false, pausedAt: 4 },
      scroll: { to: 'cell', index: 1, offset: 0 },
      reason: 'from-notebook',
    });
  });

  it('ignores a startAt that is not a cell', () => {
    expect(initialFollow({ ids, startAt: 4, active: false }).reason).toBe('start');
    expect(initialFollow({ ids, startAt: -1, active: false }).reason).toBe('start');
  });

  it('follows late from the start or a saved place, and only when untouched', () => {
    expect(followsLate('start', false)).toBe(true);
    expect(followsLate('start', true)).toBe(false);
    expect(followsLate('saved', false)).toBe(true);
    expect(followsLate('saved', true)).toBe(false);
    expect(followsLate('from-notebook', false)).toBe(false);
    expect(followsLate('active', false)).toBe(false);
  });
});

describe('the reading position', () => {
  it('is the first cell whose bottom is below the top, and how far in', () => {
    const boxes = [
      { id: 'a', top: -300, bottom: -100 },
      { id: 'b', top: -100, bottom: 200 },
      { id: 'c', top: 200, bottom: 500 },
    ];
    expect(readingPosition(0, boxes)).toEqual({ cell: 'b', offset: 100, cells: 3 });
    // A cell whose top is still below the scroller's top has no offset.
    expect(readingPosition(0, [{ id: 'a', top: 12, bottom: 100 }])).toEqual({
      cell: 'a',
      offset: 0,
      cells: 1,
    });
  });

  it('skips a sub-pixel sliver of the cell above the one at the top', () => {
    const boxes = [
      { id: 'a', top: -226.4, bottom: 1.6 },
      { id: 'b', top: 1.6, bottom: 400 },
    ];
    expect(readingPosition(0, boxes)).toEqual({ cell: 'b', offset: 0, cells: 2 });
    expect(firstVisibleIndex(0, boxes)).toBe(1);
  });

  it('is none for a cell without an id, or when every cell is above', () => {
    expect(readingPosition(0, [{ top: -5, bottom: 50 }])).toBeUndefined();
    expect(readingPosition(100, [{ id: 'a', top: 0, bottom: 50 }])).toBeUndefined();
  });

  it('finds the first visible index, the last when all are above, none when empty', () => {
    expect(firstVisibleIndex(0, [{ bottom: -4 }, { bottom: 3 }, { bottom: 90 }])).toBe(1);
    expect(firstVisibleIndex(500, [{ bottom: 10 }, { bottom: 90 }])).toBe(1);
    expect(firstVisibleIndex(0, [])).toBeUndefined();
  });
});

describe('the stored reading positions', () => {
  beforeEach(forgetPositions);
  afterEach(() => vi.restoreAllMocks());
  const pos = (cell: string) => ({ cell, offset: 12, cells: 5 });

  it('round-trips per server and path', () => {
    expect(readPosition('a', 'x.ipynb')).toBeUndefined();
    expect(savePosition('a', 'x.ipynb', pos('c1'))).toBe(true);
    expect(readPosition('a', 'x.ipynb')).toEqual(pos('c1'));
    expect(readPosition('b', 'x.ipynb')).toBeUndefined();
    expect(readPosition('a', 'y.ipynb')).toBeUndefined();
    savePosition('a', 'x.ipynb', pos('c2'));
    expect(readPosition('a', 'x.ipynb')).toEqual(pos('c2'));
  });

  it('keeps the newest MAX_POSITIONS and drops the oldest', () => {
    for (let i = 0; i < MAX_POSITIONS + 5; i++) savePosition('a', `n${i}.ipynb`, pos(`c${i}`));
    expect(readPosition('a', 'n0.ipynb')).toBeUndefined();
    expect(readPosition('a', 'n4.ipynb')).toBeUndefined();
    expect(readPosition('a', 'n5.ipynb')).toEqual(pos('c5'));
    expect(readPosition('a', `n${MAX_POSITIONS + 4}.ipynb`)).toBeDefined();
    // Saving again makes it the newest.
    savePosition('a', 'n5.ipynb', pos('again'));
    savePosition('a', 'last.ipynb', pos('l'));
    expect(readPosition('a', 'n5.ipynb')).toEqual(pos('again'));
    expect(readPosition('a', 'n6.ipynb')).toBeUndefined();
  });

  it('reads nothing from corrupt storage, and saves over it', () => {
    for (const bad of ['{not json', '{"a":1}', '[1,"x",{"server":"a"}]']) {
      localStorage.setItem('ganymede.journal.positions', bad);
      expect(readPosition('a', 'x.ipynb')).toBeUndefined();
    }
    expect(savePosition('a', 'x.ipynb', pos('c1'))).toBe(true);
    expect(readPosition('a', 'x.ipynb')).toEqual(pos('c1'));
  });

  it('works without storage: a failed read is no position, a failed write is false', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(readPosition('a', 'x.ipynb')).toBeUndefined();
    expect(savePosition('a', 'x.ipynb', pos('c1'))).toBe(false);
    expect(() => movePositions('a', 'x.ipynb', 'y.ipynb')).not.toThrow();
    expect(() => forgetPositions()).not.toThrow();
  });

  it('follows a rename and a folder move, and goes with a delete, on its server only', () => {
    savePosition('a', 'w/x.ipynb', pos('1'));
    savePosition('a', 'w2/x.ipynb', pos('2'));
    savePosition('b', 'w/x.ipynb', pos('3'));
    movePositions('a', 'w/x.ipynb', 'w/y.ipynb');
    expect(readPosition('a', 'w/y.ipynb')).toEqual(pos('1'));
    expect(readPosition('a', 'w/x.ipynb')).toBeUndefined();
    movePositions('a', 'w', 'v');
    expect(readPosition('a', 'v/y.ipynb')).toEqual(pos('1'));
    // A folder named like a prefix isn't inside it.
    expect(readPosition('a', 'w2/x.ipynb')).toEqual(pos('2'));
    expect(readPosition('b', 'w/x.ipynb')).toEqual(pos('3'));
    movePositions('a', 'v', null);
    expect(readPosition('a', 'v/y.ipynb')).toBeUndefined();
  });
});

describe('a moved or deleted path', () => {
  beforeEach(forgetPositions);

  it('is retired for the view still open on it, and a view that opens there claims it again', () => {
    expect(positionRetired('a', 'w/x.ipynb')).toBe(false);
    movePositions('a', 'w/x.ipynb', 'w/y.ipynb');
    expect(positionRetired('a', 'w/x.ipynb')).toBe(true);
    expect(positionRetired('b', 'w/x.ipynb')).toBe(false);
    expect(positionRetired('a', 'w/y.ipynb')).toBe(false);
    movePositions('a', 'f', null);
    expect(positionRetired('a', 'f/z.ipynb')).toBe(true);
    expect(positionRetired('a', 'f2/z.ipynb')).toBe(false);
    claimPosition('a', 'f/z.ipynb');
    expect(positionRetired('a', 'f/z.ipynb')).toBe(false);
  });
});

describe('who answered a request', () => {
  const md = (request: unknown, id = 'q') => ({
    id,
    cell_type: 'markdown',
    source: '@agent why?',
    metadata: { ganymede: { request } },
  });

  it('is the answer cell of an answered request', () => {
    expect(requestAnswer(md({ done: 't', answer: 'r1', id: 'q' }))).toBe('r1');
  });

  it('is none when it is done without an answer, or the metadata is a copy’s', () => {
    expect(requestAnswer(md({ done: 't', id: 'q' }))).toBeUndefined();
    expect(requestAnswer(md({ done: 't', answer: 'r1', id: 'other' }))).toBeUndefined();
    expect(requestAnswer(md({ answer: 'r1', id: 'q' }))).toBeUndefined();
    expect(requestAnswer({ cell_type: 'markdown', source: 'x', metadata: {} })).toBeUndefined();
  });

  it('words the chip by what is known', () => {
    expect(requestChip('open')).toBe('request');
    expect(requestChip('open', 'saving')).toBe('request · saving…');
    expect(requestChip('open', 'saved')).toBe('request · saved');
    expect(requestChip('open', 'not saved')).toBe('request · not saved');
    expect(requestChip('answered', 'saving')).toBe('request · answered');
  });
});
