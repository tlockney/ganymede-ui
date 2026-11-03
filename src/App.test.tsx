import { StrictMode } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, BackendConfig } from './lib/backends';
import { entry, fakeBackend, fakeServices } from './test/fakes';

// The shell's wiring: which backend it connects to, the sheet, and new
// notebooks. The backends and the notebook pane are tested on their own.
const mocks = vi.hoisted(() => ({
  connect: vi.fn<(c: BackendConfig) => Promise<Backend>>(),
  signedInHere: vi.fn<() => Promise<boolean>>(),
  /** What the pane hands the toolbar, when a test sets it. */
  controller: undefined as
    undefined | ({ dirty: boolean; save: () => Promise<boolean> } & Record<string, unknown>),
  /** The last pane's `onRenamed`. */
  onRenamed: undefined as undefined | ((from: string, to: string) => void),
}));

vi.mock('./lib/backends', async importOriginal => ({
  ...(await importOriginal<object>()),
  connect: mocks.connect,
  signedInHere: mocks.signedInHere,
}));

vi.mock('./components/NotebookPane', async () => {
  const { useEffect } = await import('react');
  return {
    NotebookPane: ({
      path,
      onController,
      onRenamed,
    }: {
      path: string;
      onController(c: unknown): void;
      onRenamed?(from: string, to: string): void;
    }) => {
      mocks.onRenamed = onRenamed;
      useEffect(() => {
        if (mocks.controller) {
          const name = path.split('/').pop();
          onController({ name, status: 'idle', trusted: true, ...mocks.controller, path });
        }
      }, [path, onController]);
      return <div data-testid="pane">{path}</div>;
    },
  };
});

const { App } = await import('./App');

beforeEach(() => {
  mocks.controller = undefined;
  mocks.signedInHere.mockReset().mockResolvedValue(false);
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '/');
  document.title = 'Ganymede';
  vi.restoreAllMocks();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })),
  );
});

describe('App', () => {
  it('asks where kernels run on first start', async () => {
    render(<App />);
    expect(await screen.findByText('Where should kernels run?')).toBeInTheDocument();
    // Nothing to go back to yet.
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('connects with a token from the page URL and removes it from the URL', async () => {
    history.replaceState(null, '', '/?token=abc&x=1');
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    expect(mocks.connect).toHaveBeenCalledWith({ kind: 'ganymede', url: '', token: 'abc' });
    expect(window.location.search).toBe('?x=1');
    expect(await screen.findByText('Io')).toBeInTheDocument();
    expect(screen.queryByText('Where should kernels run?')).not.toBeInTheDocument();
    // Remembered for next time, the token only for this tab.
    expect(JSON.parse(localStorage.getItem('ganymede-ui:backend')!)).toEqual({
      kind: 'ganymede',
      url: '',
    });
    expect(sessionStorage.getItem('ganymede-ui:token')).toBe('abc');
  });

  it('keeps the token from the page URL under StrictMode', async () => {
    history.replaceState(null, '', '/?token=abc');
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices().services));
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await waitFor(() => expect(mocks.connect).toHaveBeenCalled());
    for (const [config] of mocks.connect.mock.calls) {
      expect(config).toEqual({ kind: 'ganymede', url: '', token: 'abc' });
    }
    expect(window.location.search).toBe('');
  });

  it('runs kernels in the page when the URL asks for it', async () => {
    history.replaceState(null, '', '/?kernels=page');
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    expect(mocks.connect).toHaveBeenCalledWith({
      kind: 'ganymede',
      url: '',
      token: '',
      kernels: 'page',
    });
    expect(window.location.search).toBe('');
    expect(await screen.findByText('Io')).toBeInTheDocument();
  });

  it('opens the notebook the URL names, in its folder, with the sidebar closed', async () => {
    history.replaceState(null, '', '/?kernels=server&open=%2Fwork%2FOrbits.ipynb');
    const fake = fakeServices({
      '': [{ name: 'work', type: 'directory' }],
      work: [{ name: 'Orbits.ipynb', type: 'notebook' }],
    });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    const { container } = render(<App />);

    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb'));
    // `kernels` is gone; `open` names the open notebook, for a reload. Set
    // by an effect, which can run after the pane shows the file.
    await waitFor(() => expect(window.location.search).toBe('?open=work%2FOrbits.ipynb'));
    expect(document.title).toBe('Orbits');
    expect(container.querySelector('.window')).toHaveClass('sidebar-collapsed');
    // The sidebar lists the notebook's folder.
    expect(await screen.findByRole('button', { name: /work/ })).toBeInTheDocument();
    expect(fake.contents.get).toHaveBeenCalledWith('work', { content: true });
  });

  it('tells the Mac app which notebook is open and if it has unsaved edits, and saves for it', async () => {
    const posted: unknown[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: { document: { postMessage: (m: unknown) => posted.push(m) } },
    });
    const save = vi.fn(async () => true);
    mocks.controller = { dirty: true, save };
    history.replaceState(null, '', '/?kernels=server&open=work/Orbits.ipynb');
    mocks.connect.mockResolvedValue(
      fakeBackend(
        fakeServices({ '': [], work: [{ name: 'Orbits.ipynb', type: 'notebook' }] }).services,
      ),
    );
    render(<App />);

    await waitFor(() => expect(posted).toContainEqual({ path: 'work/Orbits.ipynb', dirty: true }));
    expect(posted[0]).toEqual({ path: null, dirty: false });
    expect(await window.ganymede!.save()).toBe(true);
    expect(save).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('leaves the sidebar and toolbar to the app with chrome=native', async () => {
    history.replaceState(null, '', '/?kernels=server&chrome=native&open=Io.ipynb');
    mocks.connect.mockResolvedValue(
      fakeBackend(fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] }).services),
    );
    const { container } = render(<App />);
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('Io.ipynb'));
    expect(container.querySelector('.window')).toHaveClass('chrome-native');
    expect(container.querySelector('aside.sidebar')).toBeNull();
    expect(container.querySelector('header.toolbar')).toBeNull();
    // Kept for a reload.
    expect(new URLSearchParams(window.location.search).get('chrome')).toBe('native');
  });

  it('runs the app’s commands and tells it what to show', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    const runAll = vi.fn(async () => {});
    const changeCellType = vi.fn();
    const command = vi.fn((id: string) => id === 'move-up');
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      runAll,
      changeCellType,
      command,
      kernelName: 'python3',
      cellType: 'code',
    };
    const fake = fakeServices({
      '': [
        { name: 'Io.ipynb', type: 'notebook' },
        { name: 'Europa.ipynb', type: 'notebook' },
      ],
    });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        path: 'Io.ipynb',
        status: 'idle',
        kernel: 'python3',
        kernelDisplayName: 'Python 3',
        cellType: 'code',
        kernels: [{ name: 'python3', displayName: 'Python 3' }],
      }),
    );

    const run = window.ganymede!.command;
    expect(await run('run-all')).toBe(true);
    expect(runAll).toHaveBeenCalled();
    expect(await run('cell-type', 'markdown')).toBe(true);
    expect(changeCellType).toHaveBeenCalledWith('markdown');
    expect(await run('cell-type', 'heading')).toBe(false);
    // The notebook's own commands, by their shortcut-table ids.
    expect(await run('move-up')).toBe(true);
    expect(await run('no-such-command')).toBe(false);
    // An absolute path, as the Mac app passes it, is cleaned as `?open=` is.
    expect(await run('open', '/Europa.ipynb')).toBe(true);
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent(/^Europa\.ipynb$/));
    expect(await run('show-shortcuts')).toBe(true);
    expect(await screen.findByText('Keyboard Shortcuts')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('opens other files in the app’s editor, only on the app’s own server', async () => {
    const opened: unknown[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: { openFile: { postMessage: (m: unknown) => opened.push(m) } },
    });
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'ganymede', url: '' }));
    const tree = { '': [{ name: 'notes.md', type: 'file' as const }] };
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices(tree).services));
    const { unmount } = render(<App />);
    await userEvent.click(await screen.findByText('notes.md'));
    expect(opened).toEqual([{ path: 'notes.md' }]);
    unmount();

    // Another server's files aren't the app's to open.
    mocks.connect.mockResolvedValue(
      fakeBackend(fakeServices(tree).services, {
        kind: 'ganymede',
        url: 'http://io:8888',
        token: '',
      }),
    );
    render(<App />);
    // Not opened, though its file menu still works.
    const notes = (await screen.findByText('notes.md')).closest('button')!;
    expect(notes).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(notes);
    expect(opened).toEqual([{ path: 'notes.md' }]);
    vi.unstubAllGlobals();
  });

  it('keeps the sidebar open when a page with a notebook open is reloaded', async () => {
    history.replaceState(null, '', '/?open=work/Orbits.ipynb');
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([
      { type: 'reload' } as PerformanceNavigationTiming,
    ]);
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'ganymede', url: '' }));
    const fake = fakeServices({ '': [], work: [{ name: 'Orbits.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    const { container } = render(<App />);

    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb'));
    expect(container.querySelector('.window')).not.toHaveClass('sidebar-collapsed');
  });

  it('follows a rename, unless another notebook was opened meanwhile', async () => {
    history.replaceState(null, '', '/?kernels=server&open=work%2FOrbits.ipynb');
    const fake = fakeServices({
      '': [{ name: 'work', type: 'directory' }],
      work: [
        { name: 'Orbits.ipynb', type: 'notebook' },
        { name: 'Moons.ipynb', type: 'notebook' },
      ],
    });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb'));
    const renamed = mocks.onRenamed!;
    act(() => renamed('work/Orbits.ipynb', 'work/Kepler.ipynb'));
    expect(screen.getByTestId('pane')).toHaveTextContent('work/Kepler.ipynb');

    // A rename that ends after Moons was opened leaves Moons open.
    await userEvent.click(await screen.findByRole('button', { name: /^Moons/ }));
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('work/Moons.ipynb'));
    act(() => renamed('work/Kepler.ipynb', 'work/Laws.ipynb'));
    expect(screen.getByTestId('pane')).toHaveTextContent('work/Moons.ipynb');
  });

  it('hands a missing launch file to the pane, not the connect sheet', async () => {
    history.replaceState(null, '', '/?kernels=server&open=gone/Nope.ipynb');
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices({ '': [] }).services));
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('gone/Nope.ipynb'));
    expect(screen.queryByText('Where should kernels run?')).not.toBeInTheDocument();
  });

  it('keeps the launch file when the sheet retries the same server', async () => {
    history.replaceState(null, '', '/?token=bad&open=work/Orbits.ipynb');
    const fake = fakeServices({
      '': [{ name: 'work', type: 'directory' }],
      work: [{ name: 'Orbits.ipynb', type: 'notebook' }],
    });
    mocks.connect
      .mockRejectedValueOnce(new Error('The server refused the token.'))
      .mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    expect(await screen.findByText('The server refused the token.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb'));
    expect(fake.contents.get).toHaveBeenCalledWith('work', { content: true });
  });

  it('keeps the launch file for the first backend picked in the sheet', async () => {
    history.replaceState(null, '', '/?open=work/Orbits.ipynb');
    const fake = fakeServices({
      '': [{ name: 'work', type: 'directory' }],
      work: [{ name: 'Orbits.ipynb', type: 'notebook' }],
    });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, { kind: 'browser' }));
    render(<App />);

    expect(await screen.findByText('Where should kernels run?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /This browser/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb'));
    expect(fake.contents.get).toHaveBeenCalledWith('work', { content: true });
  });

  it('drops the launch file and folder when the sheet picks another backend', async () => {
    history.replaceState(null, '', '/?token=bad&open=work/Orbits.ipynb');
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect
      .mockRejectedValueOnce(new Error('The server refused the token.'))
      .mockResolvedValue(fakeBackend(fake.services, { kind: 'browser' }));
    render(<App />);

    expect(await screen.findByText('The server refused the token.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /This browser/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

    // The browser's root, with nothing opened from the first server.
    expect(await screen.findByText('Io')).toBeInTheDocument();
    expect(fake.contents.get).toHaveBeenCalledWith('', { content: true });
    expect(screen.queryByTestId('pane')).not.toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it("connects on the login cookie when this page's server has us signed in", async () => {
    mocks.signedInHere.mockResolvedValue(true);
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    expect(await screen.findByText('Io')).toBeInTheDocument();
    expect(mocks.connect).toHaveBeenCalledWith({ kind: 'ganymede', url: '', token: '' });
    expect(screen.queryByText('Where should kernels run?')).not.toBeInTheDocument();
  });

  it('reconnects to the saved backend', async () => {
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'browser' }));
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices().services, { kind: 'browser' }));
    render(<App />);
    expect(mocks.connect).toHaveBeenCalledWith({ kind: 'browser' });
    expect(await screen.findByText('This browser')).toBeInTheDocument();
  });

  it('shows a failed connection in the sheet', async () => {
    mocks.connect.mockRejectedValue(new Error('The server refused the token.'));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('The server refused the token.')).toBeInTheDocument();
    expect(localStorage.getItem('ganymede-ui:backend')).toBeNull();
  });

  it('creates a notebook with the default kernel and opens it', async () => {
    const fake = fakeServices({ '': [] });
    fake.contents.newUntitled.mockResolvedValue(
      entry({ name: 'Untitled.ipynb', type: 'notebook' }),
    );
    fake.contents.get.mockImplementation(async (path: string) =>
      path === 'Untitled.ipynb'
        ? entry({ name: path, type: 'notebook', content: { metadata: {}, cells: [] } })
        : entry({ name: '', path: '', type: 'directory', content: [] }),
    );
    localStorage.setItem(
      'ganymede-ui:backend',
      JSON.stringify({ kind: 'ganymede', url: '', token: 't' }),
    );
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /New Notebook/ }));
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('Untitled.ipynb'));
    expect(fake.contents.newUntitled).toHaveBeenCalledWith({ type: 'notebook', path: '' });
    expect(fake.contents.save).toHaveBeenCalledWith('Untitled.ipynb', {
      type: 'notebook',
      format: 'json',
      content: {
        cells: [],
        metadata: { kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' } },
      },
    });
  });

  // On the Mac the server's root is `/`: a new notebook there fails (#194).
  it('creates a new notebook in the folder the window shows, and keeps it in the URL', async () => {
    history.replaceState(null, '', '/?kernels=server&dir=%2FUsers%2Fme');
    const fake = fakeServices({ 'Users/me': [] });
    fake.contents.newUntitled.mockResolvedValue(
      entry({ name: 'Untitled.ipynb', type: 'notebook' }, 'Users/me'),
    );
    fake.contents.get.mockImplementation(async (path: string) =>
      path === 'Users/me/Untitled.ipynb'
        ? entry({ name: path, type: 'notebook', content: { metadata: {}, cells: [] } })
        : entry({ name: 'me', path, type: 'directory', content: [] }),
    );
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    await waitFor(() => expect(window.location.search).toBe('?dir=Users%2Fme'));
    // The empty pane's button, which used the server's root.
    await userEvent.click(await screen.findByText('New Notebook', { selector: '.push-button' }));
    await waitFor(() =>
      expect(screen.getByTestId('pane')).toHaveTextContent('Users/me/Untitled.ipynb'),
    );
    expect(fake.contents.newUntitled).toHaveBeenCalledWith({ type: 'notebook', path: 'Users/me' });
    // The notebook's own folder: no `dir` needed.
    await waitFor(() => expect(window.location.search).toBe('?open=Users%2Fme%2FUntitled.ipynb'));
  });

  it('says why a new notebook could not be created', async () => {
    const fake = fakeServices({ '': [] });
    fake.contents.newUntitled.mockRejectedValue(new Error('Permission denied'));
    localStorage.setItem(
      'ganymede-ui:backend',
      JSON.stringify({ kind: 'ganymede', url: '', token: 't' }),
    );
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /New Notebook/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t create a notebook in this folder: Permission denied',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('opens a new notebook even when its kernel could not be set', async () => {
    const fake = fakeServices({ '': [] });
    fake.contents.newUntitled.mockResolvedValue(
      entry({ name: 'Untitled.ipynb', type: 'notebook' }),
    );
    fake.contents.save.mockRejectedValue(new Error('disk full'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem(
      'ganymede-ui:backend',
      JSON.stringify({ kind: 'ganymede', url: '', token: 't' }),
    );
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    await userEvent.click(await screen.findByText('New Notebook', { selector: '.push-button' }));
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('Untitled.ipynb'));
    expect(warn).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears a failed New Notebook notice when a notebook opens', async () => {
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    fake.contents.newUntitled.mockRejectedValue(new Error('Permission denied'));
    localStorage.setItem(
      'ganymede-ui:backend',
      JSON.stringify({ kind: 'ganymede', url: '', token: 't' }),
    );
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    await userEvent.click(await screen.findByText('New Notebook', { selector: '.push-button' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Io'));
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('Io.ipynb'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  describe('on a phone-narrow window', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((q: string) => ({
          matches: q === '(max-width: 719.98px)',
          addEventListener() {},
          removeEventListener() {},
        })),
      );
      localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'browser' }));
    });

    async function openSidebar() {
      const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
      mocks.connect.mockResolvedValue(fakeBackend(fake.services, { kind: 'browser' }));
      const view = render(<App />);
      const win = view.container.querySelector('.window')!;
      // Starts closed: the notebook gets the screen.
      await waitFor(() => expect(mocks.connect).toHaveBeenCalled());
      expect(win).toHaveClass('sidebar-collapsed');
      expect(screen.queryByTestId('sidebar-scrim')).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Show Sidebar' }));
      expect(win).not.toHaveClass('sidebar-collapsed');
      return win as HTMLElement;
    }

    it('closes the sidebar from its own button', async () => {
      const win = await openSidebar();
      const sidebar = win.querySelector('aside')!;
      await userEvent.click(within(sidebar).getByRole('button', { name: 'Hide Sidebar' }));
      expect(win).toHaveClass('sidebar-collapsed');
    });

    it('closes the sidebar on a tap outside it, and on Escape', async () => {
      const win = await openSidebar();
      await userEvent.click(screen.getByTestId('sidebar-scrim'));
      expect(win).toHaveClass('sidebar-collapsed');

      await userEvent.click(screen.getByRole('button', { name: 'Show Sidebar' }));
      await userEvent.keyboard('{Escape}');
      expect(win).toHaveClass('sidebar-collapsed');
    });

    it('leaves the sidebar open on Esc while a sheet opened from it is up', async () => {
      const win = await openSidebar();
      await userEvent.click(win.querySelector('.backend-chip')!);
      expect(await screen.findByText('Where should kernels run?')).toBeInTheDocument();
      await userEvent.keyboard('{Escape}');
      expect(win).not.toHaveClass('sidebar-collapsed');
    });

    it('closes the sidebar once it opens a notebook', async () => {
      const win = await openSidebar();
      await userEvent.click(await screen.findByRole('button', { name: 'Io' }));
      expect(screen.getByTestId('pane')).toHaveTextContent('Io.ipynb');
      expect(win).toHaveClass('sidebar-collapsed');
    });
  });

  it('keeps the sidebar beside the notebook on a wide window', async () => {
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'browser' }));
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, { kind: 'browser' }));
    const { container } = render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Io' }));
    expect(container.querySelector('.window')).not.toHaveClass('sidebar-collapsed');
    expect(screen.queryByTestId('sidebar-scrim')).not.toBeInTheDocument();
    expect(container.querySelector('.sidebar-close')).toBeNull();
  });
});
