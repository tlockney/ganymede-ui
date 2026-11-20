import '../test/notebook-env';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Widget } from '@lumino/widgets';
import { YNotebook } from '@jupyter/ydoc';
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

function show(nb: YNotebook, room?: Partial<NotebookRoom>) {
  const onOpenAsNotebook = vi.fn();
  render(
    <JournalView
      notebook={nb}
      rendermime={rendermime}
      trusted={() => false}
      room={room as NotebookRoom}
      name="Trend.ipynb"
      onOpenAsNotebook={onOpenAsNotebook}
    />,
  );
  return { onOpenAsNotebook };
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
    expect(screen.getByText(/In the room: You/)).toBeInTheDocument();
    // From the cells' `at`, before any change is seen here.
    expect(screen.getByText(/changed \d+ d ago/)).toBeInTheDocument();
    nb.addCell({ cell_type: 'markdown', source: 'x', metadata: {} });
    expect(await screen.findByText(/changed just now/)).toBeInTheDocument();
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
});
