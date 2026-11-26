import '../test/notebook-env';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Widget } from '@lumino/widgets';
import { ServerConnection } from '@jupyterlab/services';
import { YNotebook } from '@jupyter/ydoc';
import * as Y from 'yjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetPositions, movePositions, readPosition, savePosition } from '../lib/journal';
import type { NotebookRoom } from '../lib/room';
import { JournalView } from './JournalView';

/** A rendermime whose renderers print their mime type and data as text. */
const rendermime = {
  createRenderer: (mime: string) => {
    const w = new Widget();
    (w as unknown as { renderModel: unknown }).renderModel = async (m: {
      data: Record<string, string>;
    }) => {
      w.node.textContent = `[${mime}] ${m.data[mime]}`;
    };
    return w;
  },
  preferredMimeType: (data: Record<string, unknown>) =>
    Object.keys(data).includes('text/plain') ? 'text/plain' : undefined,
} as never;

const agent = (mode: string, extra: Record<string, unknown> = {}) => ({
  ganymede: { agent: { by: 'claude-code', mode, at: '2020-01-01T00:00:00Z', ...extra } },
});

function journal() {
  const nb = new YNotebook();
  nb.addCell({ cell_type: 'markdown', source: '# Trend', metadata: agent('note') });
  nb.addCell({
    cell_type: 'code',
    source: 'import x\nprint(x)\nx',
    execution_count: 3,
    metadata: agent('executed', { history: [{ source: 'old = 1', by: 'claude-code', at: 't' }] }),
    outputs: [
      {
        output_type: 'execute_result',
        execution_count: 3,
        data: { 'text/plain': '42' },
        metadata: {},
      },
    ],
  });
  nb.addCell({ cell_type: 'markdown', source: 'a person’s remark', metadata: {} });
  return nb;
}

/** Mark a cell as running, so the journal is live work. */
function running(nb: YNotebook, index = 1) {
  (nb.cells[index] as unknown as { executionState: string }).executionState = 'running';
}

function show(
  nb: YNotebook,
  room?: Partial<NotebookRoom>,
  more: {
    rendermime?: unknown;
    trusted?: string[];
    path?: string;
    roomSettings?: unknown;
    positionKey?: { server: string; path: string };
    startAt?: number;
  } = {},
) {
  const onOpenAsNotebook = vi.fn();
  const view = render(
    <JournalView
      notebook={nb}
      rendermime={(more.rendermime ?? rendermime) as never}
      trustedIds={() => new Set(more.trusted ?? [])}
      room={room as NotebookRoom}
      path={more.path}
      roomSettings={more.roomSettings as never}
      positionKey={more.positionKey}
      startAt={more.startAt}
      name="Trend.ipynb"
      onOpenAsNotebook={onOpenAsNotebook}
    />,
  );
  return { onOpenAsNotebook, ...view };
}

/** A change made by another client: applied from a copy of the document. */
function changedElsewhere(nb: YNotebook, change: (other: YNotebook) => void) {
  const other = new YNotebook();
  Y.applyUpdate(other.ydoc, Y.encodeStateAsUpdate(nb.ydoc));
  change(other);
  Y.applyUpdate(nb.ydoc, Y.encodeStateAsUpdate(other.ydoc, Y.encodeStateVector(nb.ydoc)));
}

type Rendered = { mime: string; trusted: boolean; data: string };

/**
 * A stand-in for the notebook's rendermime that picks a mime type as the
 * real one does: the richest the data has, and with 'ensure' not one that
 * is unsafe (SVG, JavaScript). It records what each renderer is given.
 */
function recordingRendermime(log: Rendered[], renderModel?: () => Promise<void>) {
  const rank = [
    'application/javascript',
    'image/svg+xml',
    'text/html',
    'text/markdown',
    'text/plain',
  ];
  const unsafe = new Set(['application/javascript', 'image/svg+xml']);
  return {
    createRenderer: (mime: string) => {
      const w = new Widget();
      (w as unknown as { renderModel: unknown }).renderModel = async (m: {
        data: Record<string, string>;
        trusted: boolean;
      }) => {
        log.push({ mime, trusted: m.trusted, data: m.data[mime]! });
        if (renderModel) return renderModel();
        w.node.textContent = `[${mime}] ${m.data[mime]}`;
      };
      return w;
    },
    preferredMimeType: (data: Record<string, unknown>, safe: 'ensure' | 'prefer' | 'any') =>
      rank.find(m => m in data && (safe !== 'ensure' || !unsafe.has(m))),
  };
}

function withOutput(data: Record<string, string>, id = 'c1') {
  const nb = new YNotebook();
  nb.addCell({
    id,
    cell_type: 'code',
    source: 'x',
    metadata: agent('executed'),
    outputs: [{ output_type: 'display_data', data, metadata: {} }],
  });
  return nb;
}

describe('JournalView', () => {
  it('starts with a header: the language and day above the title, who started it below', async () => {
    // A notebook with its metadata, as a file gives it.
    const nb = new YNotebook();
    nb.fromJSON({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        title: 'Trend of moons',
        kernelspec: { name: 'python3', display_name: 'Python 3' },
      },
      cells: journal().cells.map(c => c.toJSON()),
    } as never);
    show(nb);
    const region = screen.getByRole('region', { name: 'Journal of Trend.ipynb' });
    // First among the view's elements.
    expect(region.firstElementChild?.tagName).toBe('HEADER');
    // The language and the day of the earliest cell make an eyebrow (#852).
    const eyebrow = region.querySelector('.journal-eyebrow')!.textContent!;
    expect(eyebrow).toMatch(/^Python 3 · /);
    expect(screen.getByRole('heading', { level: 1, name: 'Trend of moons' })).toBeInTheDocument();
    const meta = region.querySelector('.journal-meta')!.textContent!;
    expect(meta).toContain('Started by claude-code');
    expect(meta).toContain('3 cells');
    // It follows the notebook.
    act(() => {
      nb.setMetadata('title', 'Renamed');
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Renamed' })).toBeInTheDocument();
  });

  it('titles a notebook with no title by its file name', () => {
    show(new YNotebook());
    expect(screen.getByRole('heading', { level: 1, name: 'Trend' })).toBeInTheDocument();
    expect(screen.getByText('0 cells')).toBeInTheDocument();
  });

  it('reads only the cells a change touched', async () => {
    const nb = journal();
    show(nb);
    const spies = nb.cells.map(c => vi.spyOn(c, 'toJSON'));
    act(() => {
      nb.cells[2]!.setSource('a person’s second thought');
    });
    expect(await screen.findByText(/second thought/)).toBeInTheDocument();
    expect(spies.map(s => s.mock.calls.length)).toEqual([0, 0, 1]);
  });

  it('labels each cell with who wrote it, from the metadata', async () => {
    show(journal());
    const [note, ran, person] = await screen.findAllByRole('article');
    expect(within(note!).getByText('Agent note')).toBeInTheDocument();
    expect(within(ran!).getByText('Agent ran it [3]')).toBeInTheDocument();
    expect(within(ran!).getByText('claude-code')).toBeInTheDocument();
    expect(within(person!).getByText('Person')).toBeInTheDocument();
    expect(within(note!).getByText('[text/markdown] # Trend')).toBeInTheDocument();
  });

  it('folds code, shows the output, and unfolds on a click', async () => {
    show(journal());
    const fold = await screen.findByRole('button', { name: '▸ import x · 3 lines' });
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('print(x)', { exact: false })).not.toBeInTheDocument();
    expect(screen.getByText('[text/plain] 42')).toBeInTheDocument();
    await userEvent.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/print\(x\)/)).toBeInTheDocument();
  });

  it('says what a cell’s outputs are, not that they were saved (#852)', async () => {
    const nb = withOutput({ 'image/svg+xml': '<svg xmlns="http://www.w3.org/2000/svg"/>' });
    show(nb);
    const cell = (await screen.findAllByRole('article'))[0]!;
    const meta = cell.querySelector('.journal-output-meta')!;
    expect(meta).toHaveTextContent('SVG');
    expect(meta).not.toHaveTextContent('saved output');
  });

  it('shows the earlier source behind a rev chip', async () => {
    show(journal());
    const chip = await screen.findByRole('button', { name: /Revision 2/ });
    expect(screen.queryByText('old = 1')).not.toBeInTheDocument();
    // Hover shows it, and leaving hides it.
    await userEvent.hover(chip);
    expect(screen.getByText('old = 1')).toBeInTheDocument();
    await userEvent.unhover(chip);
    expect(screen.queryByText('old = 1')).not.toBeInTheDocument();
    // A tap keeps it open after the pointer leaves, and another closes it.
    await userEvent.click(chip);
    await userEvent.unhover(chip);
    expect(screen.getByText('old = 1')).toBeInTheDocument();
    await userEvent.click(chip);
    await userEvent.unhover(chip);
    expect(screen.queryByText('old = 1')).not.toBeInTheDocument();
  });

  it('adds a note and an @agent request as Markdown cells at the end', async () => {
    const nb = journal();
    show(nb);
    const field = screen.getByRole('textbox', { name: 'Write to the journal' });
    const addNote = screen.getByRole('button', { name: 'Add Note' });
    expect(addNote).toBeDisabled();
    await userEvent.type(field, 'Looks flat after 2019');
    await userEvent.click(addNote);
    expect(field).toHaveValue('');
    await userEvent.type(field, 'does dropping 2019 change it?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agent' }));
    const added = nb.cells.slice(3).map(c => c.toJSON());
    expect(added.map(c => [c.cell_type, c.source])).toEqual([
      ['markdown', 'Looks flat after 2019'],
      ['markdown', '@agent does dropping 2019 change it?'],
    ]);
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
  });

  it('shows who is in the room and when it last changed', async () => {
    const nb = journal();
    nb.awareness.setLocalStateField('user', { display_name: 'Thomas' });
    show(nb);
    expect(screen.getByText(/Only you are here/)).toBeInTheDocument();
    // From the cells' `at`, before any change is seen here.
    expect(screen.getByText(/changed \d+ d ago/)).toBeInTheDocument();
    changedElsewhere(nb, other =>
      other.addCell({ cell_type: 'markdown', source: 'x', metadata: {} }),
    );
    expect(await screen.findByText(/changed just now/)).toBeInTheDocument();
  });

  it('does not count a change made here as news, though it shows the cell', async () => {
    const nb = journal();
    show(nb);
    nb.addCell({ cell_type: 'markdown', source: 'my own note', metadata: {} });
    expect(await screen.findByText(/my own note/)).toBeInTheDocument();
    expect(screen.getByText(/changed \d+ d ago/)).toBeInTheDocument();
    expect(screen.queryByText(/changed just now/)).not.toBeInTheDocument();
  });

  it('says only you are here when no one else is', () => {
    const nb = journal();
    show(nb);
    expect(screen.getByText(/Only you are here/)).toBeInTheDocument();
    expect(screen.queryByText(/Nobody else/)).not.toBeInTheDocument();
  });

  it('shows the others by name', () => {
    const nb = journal();
    show(nb);
    act(() => {
      // Another client's awareness state, as the room delivers it.
      (nb.awareness as unknown as { states: Map<number, unknown> }).states.set(99, {
        user: { display_name: 'Ada' },
      });
      nb.awareness.emit('change', [{ added: [99], updated: [], removed: [] }, 'remote']);
    });
    expect(screen.getByText(/In the room: You, Ada/)).toBeInTheDocument();
  });

  it('says which cell is running', async () => {
    const nb = journal();
    show(nb);
    act(() => {
      (nb.cells[1] as unknown as { executionState: string }).executionState = 'running';
    });
    expect(await screen.findByText('claude-code is running cell 2')).toBeInTheDocument();
  });

  it('goes read-only with Reconnecting… while the room is down, and back', async () => {
    let notify: (live: boolean) => void = () => {};
    const room = {
      live: true,
      watchLive: (cb: (live: boolean) => void) => {
        notify = cb;
        return () => {};
      },
    };
    show(journal(), room);
    const field = screen.getByRole('textbox', { name: 'Write to the journal' });
    expect(screen.queryByText(/Reconnecting…/)).not.toBeInTheDocument();
    act(() => notify(false));
    expect(screen.getByText(/Reconnecting…/)).toBeInTheDocument();
    expect(field).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ask the agent' })).toBeDisabled();
    act(() => notify(true));
    expect(screen.queryByText(/Reconnecting…/)).not.toBeInTheDocument();
    expect(field).toBeEnabled();
  });

  it('offers Open as Notebook', async () => {
    const { onOpenAsNotebook } = show(journal());
    await userEvent.click(screen.getByRole('button', { name: 'Open as Notebook' }));
    expect(onOpenAsNotebook).toHaveBeenCalledOnce();
  });

  it('stops following when scrolled up and offers Follow with the count', async () => {
    const nb = journal();
    // A cell running: the journal is live work, so it opens following.
    running(nb);
    show(nb);
    const scroller = document.querySelector('.journal-scroll') as HTMLElement;
    // jsdom has no layout: say the view is long and scrolled to the top.
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
    scroller.scrollTop = 0;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument();
    act(() => {
      nb.addCell({ cell_type: 'markdown', source: 'one', metadata: agent('note') });
      nb.addCell({ cell_type: 'markdown', source: 'two', metadata: agent('note') });
    });
    const follow = await screen.findByRole('button', { name: '2 new · Follow live' });
    await userEvent.click(follow);
    expect(scroller.scrollTop).toBe(2000);
    expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument();
  });

  it('keeps the end in view while following', async () => {
    const nb = journal();
    running(nb);
    show(nb);
    const scroller = document.querySelector('.journal-scroll') as HTMLElement;
    Object.defineProperty(scroller, 'scrollHeight', { value: 3000, configurable: true });
    act(() => {
      nb.addCell({ cell_type: 'markdown', source: 'new', metadata: agent('note') });
    });
    await screen.findAllByRole('article');
    await vi.waitFor(() => expect(scroller.scrollTop).toBe(3000));
  });

  describe('trust', () => {
    const html = { 'text/html': '<img src=x onerror=alert(1)>', 'text/plain': 'plain' };

    it("renders an untrusted cell's HTML as untrusted, so the sanitizer runs", async () => {
      const log: Rendered[] = [];
      show(withOutput(html), undefined, { rendermime: recordingRendermime(log), trusted: [] });
      await vi.waitFor(() => expect(log.length).toBeGreaterThan(0));
      expect(log).toEqual([{ mime: 'text/html', trusted: false, data: html['text/html'] }]);
    });

    it("renders a trusted cell's HTML as trusted", async () => {
      const log: Rendered[] = [];
      show(withOutput(html), undefined, { rendermime: recordingRendermime(log), trusted: ['c1'] });
      await vi.waitFor(() => expect(log.length).toBeGreaterThan(0));
      expect(log).toEqual([{ mime: 'text/html', trusted: true, data: html['text/html'] }]);
    });

    it('prefers the safe mime type for an untrusted cell, and the richest for a trusted one', async () => {
      const data = { 'image/svg+xml': '<svg onload=alert(1)/>', 'text/plain': 'a picture' };
      const untrusted: Rendered[] = [];
      const first = show(withOutput(data), undefined, {
        rendermime: recordingRendermime(untrusted),
        trusted: [],
      });
      await vi.waitFor(() => expect(untrusted.length).toBeGreaterThan(0));
      expect(untrusted).toEqual([{ mime: 'text/plain', trusted: false, data: 'a picture' }]);
      first.unmount();
      const trusted: Rendered[] = [];
      show(withOutput(data), undefined, {
        rendermime: recordingRendermime(trusted),
        trusted: ['c1'],
      });
      await vi.waitFor(() => expect(trusted.length).toBeGreaterThan(0));
      expect(trusted).toEqual([
        { mime: 'image/svg+xml', trusted: true, data: '<svg onload=alert(1)/>' },
      ]);
    });

    it('trusts a cell by its id, and a cell with another id is not trusted', async () => {
      const log: Rendered[] = [];
      show(withOutput(html, 'c1'), undefined, {
        rendermime: recordingRendermime(log),
        trusted: ['other'],
      });
      await vi.waitFor(() => expect(log.length).toBeGreaterThan(0));
      expect(log[0]!.trusted).toBe(false);
    });

    it("renders Markdown as untrusted, whatever the cell's trust", async () => {
      const log: Rendered[] = [];
      const nb = new YNotebook();
      nb.addCell({
        id: 'm1',
        cell_type: 'markdown',
        source: '<img src=x onerror=alert(1)>',
        metadata: {},
      });
      show(nb, undefined, { rendermime: recordingRendermime(log), trusted: ['m1'] });
      await vi.waitFor(() => expect(log.length).toBeGreaterThan(0));
      expect(log).toEqual([
        { mime: 'text/markdown', trusted: false, data: '<img src=x onerror=alert(1)>' },
      ]);
    });
  });

  it('shows the text instead when a renderer rejects, and unmounts without throwing', async () => {
    const log: Rendered[] = [];
    const failing = recordingRendermime(log, () => Promise.reject(new Error('no renderer')));
    const view = show(withOutput({ 'text/plain': 'the raw text' }), undefined, {
      rendermime: failing,
    });
    expect(await screen.findByText('the raw text')).toBeInTheDocument();
    // The renderer is still attached to its host, which the cleanup detaches.
    expect(document.querySelector('.journal-rendered')?.children).toHaveLength(1);
    expect(() => view.unmount()).not.toThrow();
  });

  it('does not write the fallback after it was unmounted', async () => {
    let reject: (e: Error) => void = () => {};
    const log: Rendered[] = [];
    const slow = recordingRendermime(log, () => new Promise<void>((_, r) => (reject = r)));
    const view = show(withOutput({ 'text/plain': 'late' }), undefined, { rendermime: slow });
    await vi.waitFor(() => expect(log).toHaveLength(1));
    expect(() => view.unmount()).not.toThrow();
    reject(new Error('too late'));
    await Promise.resolve();
  });

  it('chips a request to the client named in the cells, and only while it is open', async () => {
    const nb = new YNotebook();
    nb.addCell({ cell_type: 'markdown', source: 'note', metadata: agent('note') });
    nb.addCell({ id: 'q1', cell_type: 'markdown', source: '@claude-code why?', metadata: {} });
    nb.addCell({
      id: 'q2',
      cell_type: 'markdown',
      source: '@agent done?',
      metadata: { ganymede: { request: { done: 't', id: 'q2' } } },
    });
    nb.addCell({
      id: 'q3',
      cell_type: 'markdown',
      source: '@agent copied',
      metadata: { ganymede: { request: { done: 't', id: 'elsewhere' } } },
    });
    show(nb);
    const articles = await screen.findAllByRole('article');
    expect(within(articles[1]!).getByText('request')).toBeInTheDocument();
    expect(within(articles[2]!).getByText('request · answered')).toBeInTheDocument();
    expect(within(articles[3]!).getByText('request')).toBeInTheDocument();
  });

  it('gives a Markdown cell its attached images', async () => {
    const urls: string[] = [];
    const base = recordingRendermime([]);
    const registry = {
      ...base,
      resolver: null,
      clone: (o: { resolver: { getDownloadUrl(u: string): Promise<string> } }) => {
        void o.resolver.getDownloadUrl('attachment:a.png').then(u => urls.push(u));
        return registry;
      },
    };
    const nb = new YNotebook();
    nb.addCell({
      cell_type: 'markdown',
      source: '![a](attachment:a.png)',
      metadata: {},
      attachments: { 'a.png': { 'image/png': 'AAEC' } },
    } as never);
    show(nb, undefined, { rendermime: registry });
    await vi.waitFor(() => expect(urls).toEqual(['data:image/png;base64,AAEC']));
  });

  it("keeps an unchanged cell's view when another cell changes", async () => {
    const log: Rendered[] = [];
    const nb = withOutput({ 'text/plain': 'stays' });
    show(nb, undefined, { rendermime: recordingRendermime(log) });
    await vi.waitFor(() => expect(log).toHaveLength(1));
    act(() => {
      nb.addCell({ cell_type: 'markdown', source: 'more', metadata: {} });
    });
    await screen.findByText(/more/);
    expect(log.filter(r => r.mime === 'text/plain')).toHaveLength(1);
  });

  describe('which agents are in the room (#724)', () => {
    const roomsAnswer = (rooms: unknown[]) =>
      ServerConnection.makeSettings({
        baseUrl: 'http://127.0.0.1:1/',
        fetch: (async () => new Response(JSON.stringify({ rooms }))) as unknown as typeof fetch,
      });

    it('names the agent in the room, beside the composer and in the status line', async () => {
      show(journal(), undefined, {
        path: 'Trend.ipynb',
        roomSettings: roomsAnswer([
          { path: 'Trend.ipynb', clients: [{ name: 'claude-code', kind: 'agent' }] },
        ]),
      });
      expect(await screen.findByText('claude-code is in the room.')).toBeInTheDocument();
      expect(screen.getByText(/In the room: .*claude-code/)).toBeInTheDocument();
    });

    it('says a note waits in the notebook when no agent is in the room', async () => {
      show(journal(), undefined, {
        path: 'Trend.ipynb',
        roomSettings: roomsAnswer([
          { path: 'Other.ipynb', clients: [{ name: 'x', kind: 'agent' }] },
        ]),
      });
      expect(await screen.findByText(/No agent is in the room/)).toBeInTheDocument();
    });

    it('says nothing without a server to ask', () => {
      show(journal());
      expect(screen.queryByText(/is in the room\.|No agent is in the room/)).toBeNull();
    });
  });
});

/** A notebook of `n` cells with ids c0, c1, ... each 100 px tall in the stubbed layout. */
function cellsOf(n: number) {
  const nb = new YNotebook();
  for (let i = 0; i < n; i++) {
    // Cell 1 is code, which can be the one running.
    nb.addCell({
      id: `c${i}`,
      cell_type: i === 1 ? 'code' : 'markdown',
      source: `cell ${i}`,
      metadata: agent(i === 1 ? 'executed' : 'note'),
    });
  }
  return nb;
}

const VIEW = 400;
const CELL = 100;
/** Content that renders above every cell but the first, as an output does: it moves them down. */
let layoutShift = 0;

/**
 * jsdom has no layout: the scroll area is 400 px tall, and cell i is 100 px
 * tall, laid out from the scroll area's scrollTop (as the browser would).
 */
function stubLayout(cells: () => number) {
  const scroller = () => document.querySelector('.journal-scroll') as HTMLElement | null;
  const box = (top: number, bottom: number) =>
    ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top }) as DOMRect;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.classList.contains('journal-scroll')) return box(0, VIEW);
    const i = this.getAttribute('data-cell-index');
    if (i === null) return box(0, 0);
    const top = Number(i) * CELL + (Number(i) > 0 ? layoutShift : 0) - (scroller()?.scrollTop ?? 0);
    return box(top, top + CELL);
  });
  vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('journal-scroll') ? cells() * CELL : 0;
  });
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
    return this.classList.contains('journal-scroll') ? VIEW : 0;
  });
}

const scrollArea = () => document.querySelector('.journal-scroll') as HTMLElement;

/** The reader scrolls: the position is set, and the scroll event follows. */
function scrollTo(top: number) {
  // A real reader: input first, then the scroll it makes.
  fireEvent.wheel(scrollArea());
  act(() => {
    scrollArea().scrollTop = top;
    scrollArea().dispatchEvent(new Event('scroll'));
  });
}

const KEY = { server: 'http://s', path: 'Trend.ipynb' };

describe('where the journal opens (#816)', () => {
  beforeEach(() => {
    forgetPositions();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    forgetPositions();
  });

  it('opens an inactive journal at its start, with no Follow button', () => {
    stubLayout(() => 12);
    show(cellsOf(12), undefined, { positionKey: KEY });
    expect(scrollArea().scrollTop).toBe(0);
    expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument();
  });

  it('restores the position the reader left, and counts the cells added since', () => {
    stubLayout(() => 12);
    savePosition(KEY.server, KEY.path, { cell: 'c3', offset: 30, cells: 10 });
    show(cellsOf(12), undefined, { positionKey: KEY });
    expect(scrollArea().scrollTop).toBe(3 * CELL + 30);
    expect(screen.getByRole('button', { name: '2 new · Follow live' })).toBeInTheDocument();
  });

  it('opens at the start when the saved cell is gone', () => {
    stubLayout(() => 12);
    savePosition(KEY.server, KEY.path, { cell: 'deleted', offset: 30, cells: 4 });
    show(cellsOf(12), undefined, { positionKey: KEY });
    expect(scrollArea().scrollTop).toBe(0);
  });

  it('opens at the cell the reader switched from, ahead of the saved position', () => {
    stubLayout(() => 12);
    savePosition(KEY.server, KEY.path, { cell: 'c1', offset: 0, cells: 12 });
    show(cellsOf(12), undefined, { positionKey: KEY, startAt: 4 });
    expect(scrollArea().scrollTop).toBe(4 * CELL);
  });

  it('follows from the cell switched from when that is the end', () => {
    stubLayout(() => 12);
    // The last cell: scrolling it to the top is as far as the area goes.
    show(cellsOf(12), undefined, { positionKey: KEY, startAt: 11 });
    expect(scrollArea().scrollTop).toBe(12 * CELL);
    expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument();
  });

  it('follows at the end when a cell is running', () => {
    stubLayout(() => 12);
    const nb = cellsOf(12);
    running(nb, 1);
    show(nb, undefined, { positionKey: KEY });
    expect(scrollArea().scrollTop).toBe(12 * CELL);
  });

  it('follows at the end when an agent is in the room at the start', async () => {
    stubLayout(() => 12);
    show(cellsOf(12), undefined, { path: 'Trend.ipynb', roomSettings: roomsWith(['claude-code']) });
    await vi.waitFor(() => expect(scrollArea().scrollTop).toBe(12 * CELL));
  });

  describe('when the rooms list arrives after the journal opened', () => {
    it('follows if the reader has not scrolled', async () => {
      stubLayout(() => 12);
      const gate = deferred<void>();
      show(cellsOf(12), undefined, {
        path: 'Trend.ipynb',
        roomSettings: roomsWith(['claude-code'], gate.promise),
      });
      expect(scrollArea().scrollTop).toBe(0);
      gate.resolve();
      await vi.waitFor(() => expect(scrollArea().scrollTop).toBe(12 * CELL));
    });

    it('keeps the reader’s place if they scrolled first', async () => {
      stubLayout(() => 12);
      const gate = deferred<void>();
      show(cellsOf(12), undefined, {
        path: 'Trend.ipynb',
        roomSettings: roomsWith(['claude-code'], gate.promise),
      });
      scrollTo(120);
      gate.resolve();
      expect(await screen.findByText('claude-code is in the room.')).toBeInTheDocument();
      expect(scrollArea().scrollTop).toBe(120);
      // An active journal offers to follow, with no new cells to count.
      expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument();
    });
  });

  it('offers Follow live while paused in an active journal, and counts new cells', async () => {
    stubLayout(() => 12);
    const nb = cellsOf(12);
    running(nb, 1);
    show(nb, undefined, { positionKey: KEY });
    scrollTo(100);
    expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument();
    act(() => {
      nb.addCell({ cell_type: 'markdown', source: 'x', metadata: agent('note') });
      nb.addCell({ cell_type: 'markdown', source: 'y', metadata: agent('note') });
    });
    expect(await screen.findByRole('button', { name: '2 new · Follow live' })).toBeInTheDocument();
  });

  it('counts one new cell without a plural', async () => {
    stubLayout(() => 12);
    const nb = cellsOf(12);
    show(nb, undefined, { positionKey: KEY });
    act(() => {
      nb.addCell({ cell_type: 'markdown', source: 'x', metadata: agent('note') });
    });
    expect(await screen.findByRole('button', { name: '1 new · Follow live' })).toBeInTheDocument();
  });

  it('keeps the reader’s position as they scroll, and when the journal goes away', async () => {
    stubLayout(() => 12);
    const view = show(cellsOf(12), undefined, { positionKey: KEY });
    scrollTo(250);
    await vi.waitFor(() => expect(readPosition(KEY.server, KEY.path)).toBeDefined(), {
      timeout: 2000,
    });
    expect(readPosition(KEY.server, KEY.path)).toEqual({ cell: 'c2', offset: 50, cells: 12 });
    act(() => {
      scrollArea().scrollTop = 410;
    });
    view.unmount();
    expect(readPosition(KEY.server, KEY.path)).toEqual({ cell: 'c4', offset: 10, cells: 12 });
  });

  it('does not keep a position without a key', async () => {
    stubLayout(() => 12);
    const view = show(cellsOf(12));
    scrollTo(250);
    view.unmount();
    expect(readPosition(KEY.server, KEY.path)).toBeUndefined();
  });
});

/** A rooms answer with `agents` in Trend.ipynb, after `gate` if given. */
function roomsWith(agents: string[], gate?: Promise<void>) {
  return ServerConnection.makeSettings({
    baseUrl: 'http://127.0.0.1:1/',
    fetch: (async () => {
      await gate;
      return new Response(
        JSON.stringify({
          rooms: [
            {
              path: 'Trend.ipynb',
              clients: agents.map(name => ({ name, kind: 'agent' })),
            },
          ],
        }),
      );
    }) as unknown as typeof fetch,
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return { promise, resolve };
}

describe('the composer on a phone (#816)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      q =>
        ({
          media: q,
          matches: true,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
        }) as unknown as MediaQueryList,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('is two buttons until one is used', () => {
    show(journal());
    expect(screen.getByRole('button', { name: 'Add note' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ask the agent' })).toBeEnabled();
    expect(screen.queryByRole('textbox', { name: 'Write to the journal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('opens a note: the field with focus, its placeholder, Add note and Cancel', async () => {
    const nb = journal();
    show(nb);
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const field = screen.getByRole('textbox', { name: 'Write to the journal' });
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('placeholder', 'A note for the journal');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    await userEvent.type(field, 'Flat after 2019');
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(nb.cells.slice(3).map(c => c.toJSON().source)).toEqual(['Flat after 2019']);
    // Back to the two buttons, with the text sent.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByRole('textbox', { name: 'Write to the journal' })).toHaveValue('');
  });

  it('opens a request, and sends it to the agent', async () => {
    const nb = journal();
    show(nb);
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agent' }));
    const field = screen.getByRole('textbox', { name: 'Write to the journal' });
    expect(field).toHaveAttribute('placeholder', 'A request for the agent');
    expect(screen.queryByRole('button', { name: 'Add note' })).not.toBeInTheDocument();
    await userEvent.type(field, 'does 2019 matter?');
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agent' }));
    expect(nb.cells.slice(3).map(c => c.toJSON().source)).toEqual(['@agent does 2019 matter?']);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('keeps the draft when cancelled', async () => {
    show(journal());
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Write to the journal' }), 'half a');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByRole('textbox', { name: 'Write to the journal' })).toHaveValue('half a');
  });

  it('collapses on Escape, keeping the draft', async () => {
    const nb = journal();
    show(nb);
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Write to the journal' }),
      'draft{Escape}',
    );
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(nb.cells).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: 'Add note' }));
    expect(screen.getByRole('textbox', { name: 'Write to the journal' })).toHaveValue('draft');
  });

  it('keeps the hint above the two buttons', async () => {
    show(journal(), undefined, { path: 'Trend.ipynb', roomSettings: roomsWith(['claude-code']) });
    expect(await screen.findByText('claude-code is in the room.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  });

  it('disables both buttons while reconnecting', () => {
    let notify: (live: boolean) => void = () => {};
    show(journal(), {
      live: true,
      watchLive: (cb: (live: boolean) => void) => {
        notify = cb;
        return () => {};
      },
    });
    act(() => notify(false));
    expect(screen.getByRole('button', { name: 'Add note' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ask the agent' })).toBeDisabled();
  });
});

describe('what happens to a request (#816)', () => {
  const ask = async (nb: YNotebook, room: Partial<NotebookRoom>) => {
    show(nb, { live: true, watchLive: () => () => {}, ...room });
    const before = nb.cells.length;
    await userEvent.type(
      screen.getByRole('textbox', { name: 'Write to the journal' }),
      'does 2019 matter?',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ask the agent' }));
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(before + 1));
    return screen.getAllByRole('article')[before]!;
  };

  it('says saving, then saved', async () => {
    const save = deferred<string>();
    const article = await ask(journal(), { save: () => save.promise } as never);
    expect(within(article).getByText('request · saving…')).toBeInTheDocument();
    await act(async () => save.resolve('success'));
    expect(within(article).getByText('request · saved')).toBeInTheDocument();
  });

  it('counts a save the server skipped as saved', async () => {
    const article = await ask(journal(), { save: async () => 'skipped' } as never);
    expect(await within(article).findByText('request · saved')).toBeInTheDocument();
  });

  it('says not saved when the server says the save failed', async () => {
    const save = deferred<string>();
    const article = await ask(journal(), { save: () => save.promise } as never);
    expect(within(article).getByText('request · saving…')).toBeInTheDocument();
    await act(async () => save.resolve('failed'));
    expect(within(article).getByText('request · not saved')).toBeInTheDocument();
  });

  it('says not saved when the save is rejected', async () => {
    const article = await ask(journal(), {
      save: async () => {
        throw new Error('no connection');
      },
    } as never);
    expect(await within(article).findByText('request · not saved')).toBeInTheDocument();
  });

  it('saves nothing for a note, and shows a plain request without a room', async () => {
    const save = vi.fn(async () => 'success');
    show(journal(), { live: true, watchLive: () => () => {}, save } as never);
    await userEvent.type(screen.getByRole('textbox', { name: 'Write to the journal' }), 'a note');
    await userEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    await screen.findAllByRole('article');
    expect(save).not.toHaveBeenCalled();
  });

  it('shows just request on a request that was open when the journal opened', async () => {
    const nb = cellsOf(1);
    nb.addCell({ id: 'q', cell_type: 'markdown', source: '@agent why?', metadata: {} });
    show(nb);
    const articles = await screen.findAllByRole('article');
    expect(within(articles[1]!).getByText('request')).toBeInTheDocument();
  });

  describe('an answered request', () => {
    afterEach(() => vi.restoreAllMocks());
    const answered = (answer: string) => {
      const nb = cellsOf(12);
      nb.insertCell(2, {
        id: 'q',
        cell_type: 'markdown',
        source: '@agent why?',
        metadata: { ganymede: { request: { done: 't', answer, id: 'q' } } },
      });
      nb.insertCell(3, {
        id: 'r1',
        cell_type: 'markdown',
        source: 'because',
        metadata: agent('note'),
      });
      return nb;
    };

    it('goes to the reply, and stops following', async () => {
      stubLayout(() => 14);
      const nb = answered('r1');
      running(nb, 1);
      show(nb);
      // Opened following, at the end.
      expect(scrollArea().scrollTop).toBe(14 * CELL);
      const chip = await screen.findByRole('button', { name: 'request · answered · Go to reply' });
      expect(chip).toHaveTextContent('request · answered · Go to reply');
      await userEvent.click(chip);
      expect(scrollArea().scrollTop).toBe(3 * CELL);
      // Scrolled away from the end, the journal is paused: it offers to follow.
      expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument();
    });

    it('is a plain chip when the reply is not in the notebook', async () => {
      show(answered('gone'));
      const articles = await screen.findAllByRole('article');
      expect(within(articles[2]!).getByText('request · answered')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'request · answered · Go to reply' }),
      ).not.toBeInTheDocument();
    });
  });
});

describe('opening, input and position keeping (#816, review)', () => {
  beforeEach(() => {
    forgetPositions();
    layoutShift = 0;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    layoutShift = 0;
    forgetPositions();
  });
  const saved = { cell: 'c3', offset: 30, cells: 10 };

  it('follows live work ahead of the saved position', () => {
    stubLayout(() => 12);
    savePosition(KEY.server, KEY.path, saved);
    const nb = cellsOf(12);
    running(nb, 1);
    show(nb, undefined, { positionKey: KEY });
    expect(scrollArea().scrollTop).toBe(12 * CELL);
  });

  it('follows when an agent turns up after a saved place was restored, if untouched', async () => {
    stubLayout(() => 12);
    savePosition(KEY.server, KEY.path, saved);
    const gate = deferred<void>();
    show(cellsOf(12), undefined, {
      positionKey: KEY,
      path: 'Trend.ipynb',
      roomSettings: roomsWith(['claude-code'], gate.promise),
    });
    expect(scrollArea().scrollTop).toBe(3 * CELL + 30);
    gate.resolve();
    await vi.waitFor(() => expect(scrollArea().scrollTop).toBe(12 * CELL));
  });

  it('keeps the place of a switch from the notebook when an agent turns up', async () => {
    stubLayout(() => 12);
    const gate = deferred<void>();
    show(cellsOf(12), undefined, {
      positionKey: KEY,
      startAt: 4,
      path: 'Trend.ipynb',
      roomSettings: roomsWith(['claude-code'], gate.promise),
    });
    gate.resolve();
    expect(await screen.findByText('claude-code is in the room.')).toBeInTheDocument();
    expect(scrollArea().scrollTop).toBe(4 * CELL);
  });

  it.each([
    ['a wheel', () => fireEvent.wheel(scrollArea())],
    ['a touch', () => fireEvent.touchStart(scrollArea())],
    ['a pointer press', () => fireEvent.pointerDown(scrollArea())],
    ['a key', () => fireEvent.keyDown(scrollArea(), { key: 'PageDown' })],
  ])('does not jump to the end for an agent after %s', async (_name, input) => {
    stubLayout(() => 12);
    const gate = deferred<void>();
    show(cellsOf(12), undefined, {
      positionKey: KEY,
      path: 'Trend.ipynb',
      roomSettings: roomsWith(['claude-code'], gate.promise),
    });
    input();
    gate.resolve();
    expect(await screen.findByText('claude-code is in the room.')).toBeInTheDocument();
    expect(scrollArea().scrollTop).toBe(0);
    expect(screen.getByRole('button', { name: 'Follow live' })).toBeInTheDocument();
  });

  it('holds the opening cell until the reader’s own input, not a scroll the browser made', () => {
    stubLayout(() => 12);
    savePosition(KEY.server, KEY.path, saved);
    show(cellsOf(12), undefined, { positionKey: KEY });
    // The browser moves the scroll (anchoring) and says so: still the opening's.
    act(() => {
      scrollArea().scrollTop = 500;
      scrollArea().dispatchEvent(new Event('scroll'));
    });
    expect(scrollArea()).toHaveAttribute('data-anchored');
    fireEvent.wheel(scrollArea());
    expect(scrollArea()).not.toHaveAttribute('data-anchored');
  });

  it('puts the opening cell back when content above it changes size, until the reader acts', () => {
    stubLayout(() => 12);
    const observed: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observed.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    savePosition(KEY.server, KEY.path, saved);
    show(cellsOf(12), undefined, { positionKey: KEY });
    expect(scrollArea().scrollTop).toBe(3 * CELL + 30);
    layoutShift = 50;
    // A scroll the browser reports changes nothing about what is held.
    act(() => {
      scrollArea().dispatchEvent(new Event('scroll'));
      observed.forEach(cb => cb());
    });
    expect(scrollArea().scrollTop).toBe(3 * CELL + 30 + 50);
    fireEvent.wheel(scrollArea());
    layoutShift = 90;
    act(() => observed.forEach(cb => cb()));
    expect(scrollArea().scrollTop).toBe(3 * CELL + 30 + 50);
  });

  it('keeps the position when the page is hidden, without unmounting', () => {
    stubLayout(() => 12);
    show(cellsOf(12), undefined, { positionKey: KEY });
    scrollArea().scrollTop = 250;
    expect(readPosition(KEY.server, KEY.path)).toBeUndefined();
    window.dispatchEvent(new Event('pagehide'));
    expect(readPosition(KEY.server, KEY.path)).toEqual({ cell: 'c2', offset: 50, cells: 12 });
  });

  it('keeps the held cell by id when a cell is inserted above it', async () => {
    stubLayout(() => 13);
    const observed: (() => void)[] = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) {
          observed.push(cb);
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    savePosition(KEY.server, KEY.path, saved);
    const nb = cellsOf(12);
    show(nb, undefined, { positionKey: KEY });
    expect(scrollArea().scrollTop).toBe(3 * CELL + 30);
    // Someone adds a cell at the top: the held cell, c3, is now the fifth.
    act(() => {
      nb.insertCell(0, { cell_type: 'markdown', source: 'new', metadata: agent('note') });
    });
    await vi.waitFor(() =>
      expect(document.querySelector('.journal-cell')?.getAttribute('data-cell-id')).not.toBe('c0'),
    );
    act(() => observed.forEach(cb => cb()));
    expect(scrollArea().scrollTop).toBe(4 * CELL + 30);
  });

  it('keeps positions again on a path that was renamed away from, once a journal opens there', async () => {
    stubLayout(() => 12);
    // A → B earlier in the page's life, then a journal opens at A again.
    movePositions(KEY.server, KEY.path, 'B.ipynb');
    const view = show(cellsOf(12), undefined, { positionKey: KEY });
    scrollTo(250);
    await vi.waitFor(() => expect(readPosition(KEY.server, KEY.path)).toBeDefined(), {
      timeout: 2000,
    });
    act(() => {
      scrollArea().scrollTop = 410;
    });
    view.unmount();
    expect(readPosition(KEY.server, KEY.path)).toEqual({ cell: 'c4', offset: 10, cells: 12 });
  });

  it('writes nothing back under a path that was renamed while the journal was open', async () => {
    stubLayout(() => 12);
    const view = show(cellsOf(12), undefined, { positionKey: KEY });
    scrollTo(250);
    await vi.waitFor(() => expect(readPosition(KEY.server, KEY.path)).toBeDefined(), {
      timeout: 2000,
    });
    movePositions(KEY.server, KEY.path, 'Moved.ipynb');
    act(() => {
      scrollArea().scrollTop = 410;
    });
    view.unmount();
    expect(readPosition(KEY.server, KEY.path)).toBeUndefined();
    expect(readPosition(KEY.server, 'Moved.ipynb')).toEqual({ cell: 'c2', offset: 50, cells: 12 });
  });

  it('writes nothing back for a file that was deleted while the journal was open', async () => {
    stubLayout(() => 12);
    const view = show(cellsOf(12), undefined, { positionKey: KEY });
    scrollTo(250);
    await vi.waitFor(() => expect(readPosition(KEY.server, KEY.path)).toBeDefined(), {
      timeout: 2000,
    });
    movePositions(KEY.server, KEY.path, null);
    view.unmount();
    expect(readPosition(KEY.server, KEY.path)).toBeUndefined();
  });

  describe('what counts as live', () => {
    it('is not a change to the notebook’s metadata, as a kernel starting makes', async () => {
      stubLayout(() => 12);
      const nb = new YNotebook();
      nb.fromJSON({
        nbformat: 4,
        nbformat_minor: 5,
        metadata: { kernelspec: { name: 'cdp-node', display_name: 'Node' } },
        cells: cellsOf(12).cells.map(c => c.toJSON()),
      } as never);
      show(nb);
      // The server writes it into the notebook's own metadata map.
      const copy = new Y.Doc();
      Y.applyUpdate(copy, Y.encodeStateAsUpdate(nb.ydoc));
      (copy.getMap('meta').get('metadata') as Y.Map<unknown>).set('language_info', {
        name: 'typescript',
      });
      Y.applyUpdate(nb.ydoc, Y.encodeStateAsUpdate(copy, Y.encodeStateVector(nb.ydoc)));
      expect(await screen.findByText(/changed just now/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument();
    });

    it('is a change by someone else to a cell’s source', async () => {
      stubLayout(() => 12);
      const nb = cellsOf(12);
      show(nb);
      changedElsewhere(nb, other => other.cells[2]!.setSource('edited elsewhere'));
      expect(await screen.findByRole('button', { name: 'Follow live' })).toBeInTheDocument();
    });

    it('is a cell added by someone else', async () => {
      stubLayout(() => 12);
      const nb = cellsOf(12);
      show(nb);
      changedElsewhere(nb, other =>
        other.addCell({ cell_type: 'markdown', source: 'x', metadata: {} }),
      );
      expect(
        await screen.findByRole('button', { name: '1 new · Follow live' }),
      ).toBeInTheDocument();
    });
  });

  it('pauses following when the reply is the last cell', async () => {
    stubLayout(() => 14);
    const nb = cellsOf(12);
    nb.addCell({ id: 'q', cell_type: 'markdown', source: '@agent why?', metadata: {} });
    nb.addCell({ id: 'r1', cell_type: 'markdown', source: 'because', metadata: agent('note') });
    (nb.cells[12]!.setMetadata as (m: unknown) => void)({
      ganymede: { request: { done: 't', answer: 'r1', id: 'q' } },
    });
    running(nb, 1);
    show(nb);
    expect(scrollArea().scrollTop).toBe(14 * CELL);
    await userEvent.click(
      await screen.findByRole('button', { name: 'request · answered · Go to reply' }),
    );
    expect(await screen.findByRole('button', { name: 'Follow live' })).toBeInTheDocument();
  });
});
