import '../test/notebook-env';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Widget } from '@lumino/widgets';
import { YNotebook } from '@jupyter/ydoc';
import * as Y from 'yjs';
import { describe, expect, it, vi } from 'vitest';
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

function show(
  nb: YNotebook,
  room?: Partial<NotebookRoom>,
  more: { rendermime?: unknown; trusted?: string[] } = {},
) {
  const onOpenAsNotebook = vi.fn();
  const view = render(
    <JournalView
      notebook={nb}
      rendermime={(more.rendermime ?? rendermime) as never}
      trustedIds={() => new Set(more.trusted ?? [])}
      room={room as NotebookRoom}
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
    show(nb);
    const scroller = document.querySelector('.journal-scroll') as HTMLElement;
    // jsdom has no layout: say the view is long and scrolled to the top.
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 400, configurable: true });
    scroller.scrollTop = 0;
    act(() => {
      scroller.dispatchEvent(new Event('scroll'));
    });
    expect(screen.queryByRole('button', { name: /new cells? · Follow/ })).not.toBeInTheDocument();
    act(() => {
      nb.addCell({ cell_type: 'markdown', source: 'one', metadata: agent('note') });
      nb.addCell({ cell_type: 'markdown', source: 'two', metadata: agent('note') });
    });
    const follow = await screen.findByRole('button', { name: '2 new cells · Follow' });
    await userEvent.click(follow);
    expect(scroller.scrollTop).toBe(2000);
    expect(screen.queryByRole('button', { name: /Follow/ })).not.toBeInTheDocument();
  });

  it('keeps the end in view while following', async () => {
    const nb = journal();
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
});
