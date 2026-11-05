import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerConnection, type Session } from '@jupyterlab/services';
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

// Recents are kept in local storage (#215).
beforeEach(() => localStorage.clear());

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
    // Without an editor, only notebooks and folders can be opened.
    expect(screen.getByText('notes.txt').closest('button')).toBeDisabled();
    expect(screen.getByText('Jupiter').closest('button')).toBeEnabled();
  });

  it('opens a notebook and marks the open one', async () => {
    const { onOpen } = renderSidebar({ openPath: 'Jupiter.ipynb' });
    // In the folder list: Recents lists the open notebook too.
    const files = await screen.findByRole('list', { name: 'Files' });
    const jupiter = (await within(files).findByText('Jupiter')).closest('button')!;
    expect(jupiter).toHaveClass('selected');
    expect(within(files).getByText('Saturn').closest('button')).not.toHaveClass('selected');

    await userEvent.click(screen.getByText('Saturn'));
    expect(onOpen).toHaveBeenCalledWith('Saturn.ipynb');
  });

  it('opens other files in the app’s editor when it has one', async () => {
    const onOpenFile = vi.fn();
    const { onOpen } = renderSidebar({ onOpenFile });
    const notes = (await screen.findByText('notes.txt')).closest('button')!;
    expect(notes).toBeEnabled();
    await userEvent.click(notes);
    expect(onOpenFile).toHaveBeenCalledWith('notes.txt');
    await userEvent.click(screen.getByText('Saturn'));
    expect(onOpen).toHaveBeenCalledWith('Saturn.ipynb');
    expect(onOpenFile).toHaveBeenCalledTimes(1);
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

  it('outlines the open notebook and goes to a heading (#212)', async () => {
    const onOutline = vi.fn();
    const outline = [
      { level: 2, text: 'Io', cell: 0 },
      { level: 3, text: 'Volcanoes', cell: 0 },
      { level: 2, text: 'Europa', cell: 4 },
    ];
    renderSidebar({ openPath: 'Jupiter.ipynb', outline, onOutline });
    const nav = await screen.findByRole('navigation', { name: 'Outline' });
    const items = within(nav).getAllByRole('button');
    expect(items.map(b => b.textContent)).toEqual(['Io', 'Volcanoes', 'Europa']);
    // Indented from the top level present (## here), not from #.
    expect(items[0]).toHaveStyle({ paddingLeft: '8px' });
    expect(items[1]).toHaveStyle({ paddingLeft: '20px' });
    await userEvent.click(items[2]);
    expect(onOutline).toHaveBeenCalledWith(outline[2]);
  });

  it('shows no Outline without headings', async () => {
    renderSidebar({ openPath: 'Jupiter.ipynb', outline: [], onOutline: vi.fn() });
    await screen.findByText('Saturn');
    expect(screen.queryByRole('navigation', { name: 'Outline' })).not.toBeInTheDocument();
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

  it("shows a running kernel's memory from the server (#241)", async () => {
    const { fake } = renderSidebar();
    await screen.findByText('Saturn');
    const asked: string[] = [];
    (fake.services as { serverSettings: ServerConnection.ISettings }).serverSettings =
      ServerConnection.makeSettings({
        baseUrl: 'http://server/',
        fetch: ((input: RequestInfo) => {
          asked.push(typeof input === 'string' ? input : input.url);
          return Promise.resolve(
            new Response(JSON.stringify({ content: { kernel_memory: 61865984 } })),
          );
        }) as typeof fetch,
      });
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
    expect(await screen.findByTitle('Kernel memory')).toHaveTextContent('59.0 MB');
    expect(asked[0]).toMatch(/^http:\/\/server\/api\/metrics\/v1\/kernel_usage\/get_usage\/k1/);
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

  it('opens Settings when it can', async () => {
    const onSettings = vi.fn();
    renderSidebar({ onSettings });
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(onSettings).toHaveBeenCalled();
  });

  it('has no Settings button without a handler', () => {
    renderSidebar();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });
});

describe('Sidebar file menu', () => {
  function actions() {
    return {
      rename: vi.fn(async () => true),
      duplicate: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
      newFolder: vi.fn(async (dir: string) => (dir ? `${dir}/Untitled Folder` : 'Untitled Folder')),
    };
  }
  const openMenu = async (name: string) => {
    await userEvent.click(await screen.findByRole('button', { name: `Actions for ${name}` }));
    return screen.getByRole('menu');
  };
  const item = (name: string) => screen.getByRole('menuitem', { name });

  it('has no menu without actions', async () => {
    renderSidebar();
    await screen.findByText('Saturn');
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });

  it('renames in place: Enter renames, Escape cancels', async () => {
    const a = actions();
    renderSidebar({ actions: a });
    await openMenu('Saturn');
    await userEvent.click(item('Rename'));
    const field = screen.getByRole('textbox', { name: 'New name for Saturn' });
    expect(field).toHaveFocus();
    await userEvent.type(field, '{Escape}');
    expect(a.rename).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await openMenu('Saturn');
    await userEvent.click(item('Rename'));
    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'Titan{Enter}');
    expect(a.rename).toHaveBeenCalledOnce();
    expect(a.rename).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'Saturn.ipynb' }),
      'Titan',
    );
  });

  it('duplicates files but not folders', async () => {
    const a = actions();
    renderSidebar({ actions: a });
    await openMenu('notes.txt');
    await userEvent.click(item('Duplicate'));
    expect(a.duplicate).toHaveBeenCalledWith(expect.objectContaining({ path: 'notes.txt' }));
    await openMenu('moons');
    expect(screen.queryByRole('menuitem', { name: 'Duplicate' })).not.toBeInTheDocument();
  });

  it('deletes only after confirmation', async () => {
    const a = actions();
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    renderSidebar({ actions: a });
    await openMenu('moons');
    await userEvent.click(item('Delete…'));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Delete the folder “moons”/));
    expect(a.remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await openMenu('Jupiter');
    await userEvent.click(item('Delete…'));
    expect(confirm).toHaveBeenLastCalledWith(expect.stringMatching(/^Delete “Jupiter”\?/));
    expect(a.remove).toHaveBeenCalledWith(expect.objectContaining({ path: 'Jupiter.ipynb' }));
  });

  it('makes a notebook or folder in a folder, and names the folder', async () => {
    const a = actions();
    const { onNew } = renderSidebar({ actions: a });
    await openMenu('moons');
    await userEvent.click(item('New Notebook in “moons”'));
    expect(onNew).toHaveBeenCalledWith('moons');
    await openMenu('Saturn');
    await userEvent.click(item('New Notebook'));
    expect(onNew).toHaveBeenLastCalledWith('');

    await openMenu('moons');
    await userEvent.click(item('New Folder in “moons”'));
    expect(a.newFolder).toHaveBeenCalledWith('moons');
    // Into the folder, to name the new one once it is listed.
    expect(await screen.findByRole('button', { name: /moons/ })).toBeInTheDocument();
  });

  it('opens on right-click and on a long press, which doesn’t open the item', async () => {
    const a = actions();
    const { onOpen } = renderSidebar({ actions: a });
    const saturn = (await screen.findByText('Saturn')).closest('button')!;
    await userEvent.pointer({ keys: '[MouseRight]', target: saturn });
    expect(screen.getByRole('menu', { name: 'Actions for Saturn.ipynb' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    vi.useFakeTimers();
    try {
      act(() => {
        saturn.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            pointerType: 'touch',
          } as PointerEventInit),
        );
      });
      act(() => vi.advanceTimersByTime(600));
      expect(screen.getByRole('menu')).toBeInTheDocument();
      act(() => {
        saturn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
        saturn.click();
      });
      expect(onOpen).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets a mouse click through after a long press whose click never came', async () => {
    const a = actions();
    const { onOpen } = renderSidebar({ actions: a });
    const saturn = (await screen.findByText('Saturn')).closest('button')!;
    vi.useFakeTimers();
    try {
      act(() => {
        saturn.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            pointerType: 'touch',
          } as PointerEventInit),
        );
      });
      act(() => vi.advanceTimersByTime(600));
      // The menu opened under the finger, which lifts there: no click on the row.
      act(() => saturn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
    } finally {
      vi.useRealTimers();
    }
    await userEvent.keyboard('{Escape}');
    // Then a trackpad click opens the notebook, and a right-click the menu.
    await userEvent.click(saturn);
    expect(onOpen).toHaveBeenCalledWith('Saturn.ipynb');
    await userEvent.pointer({ keys: '[MouseRight]', target: saturn });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('moves between items with the arrow keys, and gives focus back on Escape', async () => {
    renderSidebar({ actions: actions() });
    const more = await screen.findByRole('button', { name: 'Actions for Saturn' });
    await userEvent.click(more);
    expect(item('Rename')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(item('Duplicate')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(item('New Folder')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(item('Rename')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more).toHaveFocus();
  });

  it('says why an action failed', async () => {
    const a = actions();
    a.duplicate.mockRejectedValueOnce(new Error('Disk full'));
    renderSidebar({ actions: a });
    await openMenu('notes.txt');
    await userEvent.click(item('Duplicate'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t duplicate notes.txt: Disk full',
    );
  });
});

describe('Sidebar search and Recents', () => {
  const nb = (text: string) => ({
    cells: [{ cell_type: 'code', source: [text], metadata: {}, outputs: [] }],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  });
  const tree = {
    '': [
      { name: 'Saturn.ipynb', type: 'notebook' as const, content: nb('titan = moon()') },
      { name: 'moons', type: 'directory' as const },
    ],
    moons: [
      { name: 'Io.ipynb', type: 'notebook' as const, content: nb('volcanoes = 400') },
      { name: 'inner', type: 'directory' as const },
    ],
    'moons/inner': [{ name: 'Europa.ipynb', type: 'notebook' as const, content: nb('ice') }],
  };
  const results = () =>
    within(screen.getByRole('list', { name: 'Search results' }))
      .queryAllByRole('button')
      .map(b => b.textContent);

  it('finds file names in the folder and its subfolders', async () => {
    const { onOpen } = renderSidebar({}, tree as never);
    await screen.findByText('Saturn');
    const field = screen.getByRole('searchbox', { name: 'Search files' });
    await userEvent.type(field, 'EUR');
    await waitFor(() => expect(results()).toEqual(['Europamoons/inner']));
    // The folder's own listing is out of the way.
    expect(screen.getByText('Saturn').closest('ul')).not.toBeVisible();

    await userEvent.clear(field);
    await userEvent.type(field, 'o');
    await waitFor(() => expect(results()).toHaveLength(3));
    expect(results()).toEqual(expect.arrayContaining(['moons', 'Iomoons', 'Europamoons/inner']));
    await userEvent.click(screen.getByRole('button', { name: /^Io/ }));
    expect(onOpen).toHaveBeenCalledWith('moons/Io.ipynb');

    // A folder opens in the sidebar and ends the search; Escape clears it.
    await userEvent.click(
      within(screen.getByRole('list', { name: 'Search results' })).getByRole('button', {
        name: 'moons',
      }),
    );
    expect(field).toHaveValue('');
    expect(await screen.findByText('Io')).toBeVisible();
    await userEvent.type(field, 'zzz');
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    await userEvent.type(field, '{Escape}');
    expect(field).toHaveValue('');
  });

  it('searches inside notebooks when asked', async () => {
    renderSidebar({}, tree as never);
    await screen.findByText('Saturn');
    await userEvent.type(screen.getByRole('searchbox'), 'volcano');
    expect(await screen.findByText('No matches')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Search notebook contents' }));
    await waitFor(() => expect(results()).toEqual(['Iovolcanoes = 400']));
  });

  it('lists recently opened notebooks, opens one, and clears them', async () => {
    const { fake, onOpen, onNew, onConnect, rerender } = renderSidebar(
      { openPath: 'moons/Io.ipynb' },
      tree as never,
    );
    const recents = () =>
      within(screen.getByRole('list', { name: 'Recents' }))
        .getAllByRole('button')
        .map(b => b.textContent);
    await waitFor(() => expect(recents()).toEqual(['Iomoons']));
    rerender(
      <Sidebar
        backend={fakeBackend(fake.services)}
        connecting={false}
        openPath="Saturn.ipynb"
        {...{ onOpen, onNew, onConnect }}
      />,
    );
    await waitFor(() => expect(recents()).toEqual(['Saturn', 'Iomoons']));
    await userEvent.click(within(screen.getByRole('list', { name: 'Recents' })).getByText('Io'));
    expect(onOpen).toHaveBeenCalledWith('moons/Io.ipynb');
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('list', { name: 'Recents' })).not.toBeInTheDocument();
  });
});
