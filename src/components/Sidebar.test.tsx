import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Session } from '@jupyterlab/services';
import { entry, fakeBackend, fakeServices } from '../test/fakes';
import { Sidebar } from './Sidebar';

const TREE = {
  '': [
    { name: 'Saturn.ipynb', type: 'notebook' as const },
    { name: 'notes.txt', type: 'file' as const },
    { name: 'moons', type: 'directory' as const },
    { name: '.hidden.ipynb', type: 'notebook' as const },
    { name: 'Jupiter.ipynb', type: 'notebook' as const },
    { name: 'archive', type: 'directory' as const },
  ],
  moons: [{ name: 'Io.ipynb', type: 'notebook' as const }],
  'moons/empty': [],
};

function renderSidebar(props: Partial<Parameters<typeof Sidebar>[0]> = {}, tree = TREE) {
  const fake = fakeServices(structuredClone(tree));
  const handlers = { onOpen: vi.fn(), onNew: vi.fn(), onConnect: vi.fn() };
  const utils = render(
    <Sidebar backend={fakeBackend(fake.services)} connecting={false} {...handlers} {...props} />,
  );
  return { ...utils, ...handlers, fake };
}

const names = () =>
  [...document.querySelectorAll('.source-list:first-of-type .item-name')].map(n => n.textContent);

describe('Sidebar', () => {
  it('lists folders first, then files by name, without hidden files or .ipynb', async () => {
    renderSidebar();
    expect(await screen.findByText('Saturn')).toBeInTheDocument();
    const listed = names();
    expect(listed.slice(0, 2)).toEqual(['archive', 'moons']);
    expect(listed.filter(n => n !== 'notes.txt').slice(2)).toEqual(['Jupiter', 'Saturn']);
    // Notebooks and plain files compare equal to each other (the comparator
    // returns 0), so their relative order is the server's; not pinned here.
    expect(listed).toContain('notes.txt');
    expect(listed).toHaveLength(5);
    // Only notebooks and folders can be opened.
    expect(screen.getByText('notes.txt').closest('button')).toBeDisabled();
    expect(screen.getByText('Jupiter').closest('button')).toBeEnabled();
  });

  it('opens a notebook and marks the open one', async () => {
    const { onOpen } = renderSidebar({ openPath: 'Jupiter.ipynb' });
    const jupiter = (await screen.findByText('Jupiter')).closest('button')!;
    expect(jupiter).toHaveClass('selected');
    expect(screen.getByText('Saturn').closest('button')).not.toHaveClass('selected');

    await userEvent.click(screen.getByText('Saturn'));
    expect(onOpen).toHaveBeenCalledWith('Saturn.ipynb');
  });

  it('walks into a folder and back out', async () => {
    const { fake, onNew, onOpen } = renderSidebar();
    await userEvent.click(await screen.findByText('moons'));
    expect(await screen.findByText('Io')).toBeInTheDocument();
    expect(fake.contents.get).toHaveBeenLastCalledWith('moons', { content: true });

    // New notebooks go into the folder shown.
    await userEvent.click(screen.getByTitle('New Notebook'));
    expect(onNew).toHaveBeenCalledWith('moons');
    await userEvent.click(screen.getByText('Io'));
    expect(onOpen).toHaveBeenCalledWith('moons/Io.ipynb');

    await userEvent.click(screen.getByRole('button', { name: 'moons' }));
    expect(await screen.findByText('Saturn')).toBeInTheDocument();
    expect(screen.getByText('Notebooks')).toBeInTheDocument();
  });

  it('starts a new notebook at the top level', async () => {
    const { onNew } = renderSidebar();
    await screen.findByText('Saturn');
    await userEvent.click(screen.getByTitle('New Notebook'));
    expect(onNew).toHaveBeenCalledWith('');
  });

  it('says when a folder is empty or cannot be read', async () => {
    renderSidebar({}, { '': [] } as never);
    expect(await screen.findByText('No files')).toBeInTheDocument();

    const fake = fakeServices({});
    render(
      <Sidebar
        backend={fakeBackend(fake.services)}
        connecting={false}
        onOpen={vi.fn()}
        onNew={vi.fn()}
        onConnect={vi.fn()}
      />,
    );
    expect(await screen.findByText(/No such directory/)).toBeInTheDocument();
  });

  it('refreshes when a file changes', async () => {
    const { fake } = renderSidebar();
    await screen.findByText('Saturn');
    fake.tree['']!.push({ name: 'Europa.ipynb', type: 'notebook' });
    await act(async () => {
      fake.contents.fileChanged.emit({
        type: 'new',
        oldValue: null,
        newValue: entry({ name: 'Europa.ipynb', type: 'notebook' }),
      });
    });
    expect(await screen.findByText('Europa')).toBeInTheDocument();
  });

  it('lists running sessions and shuts one down', async () => {
    const { fake, onOpen } = renderSidebar();
    await screen.findByText('Saturn');
    expect(screen.queryByText('Running')).not.toBeInTheDocument();

    act(() =>
      fake.setRunning([
        {
          id: 's1',
          name: 'Io.ipynb',
          path: 'moons/Io.ipynb',
          type: 'notebook',
          kernel: { id: 'k1', name: 'python3' },
        } as Session.IModel,
      ]),
    );
    const item = screen.getByText('Running').parentElement!.nextElementSibling as HTMLElement;
    expect(within(item).getByText('Io')).toBeInTheDocument();
    expect(within(item).getByText('python3')).toBeInTheDocument();

    await userEvent.click(within(item).getByText('Io'));
    expect(onOpen).toHaveBeenCalledWith('moons/Io.ipynb');
    await userEvent.click(within(item).getByTitle('Shut Down'));
    expect(fake.sessions.shutdown).toHaveBeenCalledWith('s1');
  });

  it('shows the backend, and opens the connect sheet from it', async () => {
    const { onConnect, rerender, fake } = renderSidebar();
    await screen.findByText('Saturn');
    expect(screen.getByText('Ganymede')).toBeInTheDocument();
    expect(screen.getByText('local server')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Ganymede'));
    expect(onConnect).toHaveBeenCalled();

    rerender(
      <Sidebar
        backend={fakeBackend(fake.services)}
        connecting
        onOpen={vi.fn()}
        onNew={vi.fn()}
        onConnect={onConnect}
      />,
    );
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.queryByText('local server')).not.toBeInTheDocument();
  });

  it('has nothing to list without a backend', () => {
    render(<Sidebar connecting={false} onOpen={vi.fn()} onNew={vi.fn()} onConnect={vi.fn()} />);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    expect(screen.getByTitle('New Notebook')).toBeDisabled();
    expect(screen.queryByText('No files')).not.toBeInTheDocument();
  });
});
