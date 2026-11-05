import { renderToStaticMarkup } from 'react-dom/server';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, BackendConfig } from './lib/backends';
import { entry, fakeBackend, fakeServices } from './test/fakes';
import { debugKernel } from './test/debug-kernel';

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
const { resetOnboardingForTests } = await import('./lib/onboarding');

beforeEach(() => {
  mocks.controller = undefined;
  mocks.signedInHere.mockReset().mockResolvedValue(false);
  localStorage.clear();
  resetOnboardingForTests();
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

  it('says it is connecting, not Connect…, in its first frame', () => {
    // The Mac app's page. Effects run after the first paint, so before the
    // connection started it showed a bare Connect… screen, then the welcome.
    history.replaceState(null, '', '/?kernels=server&chrome=native');
    const first = renderToStaticMarkup(<App />);
    expect(first).toContain('Connecting…');
    expect(first).not.toContain('Connect…<');
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
    expect(await screen.findByRole('button', { name: 'work' })).toBeInTheDocument();
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
    const discard = vi.fn();
    const rename = vi.fn(async () => true);
    const goToCell = vi.fn((i: number) => i < 3);
    mocks.controller = {
      discard,
      rename,
      goToCell,
      outline: [{ level: 1, text: 'Io', cell: 2 }],
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
        outline: [{ level: 1, text: 'Io', cell: 2 }],
      }),
    );

    const run = window.ganymede!.command;
    // The app's Outline (#212).
    expect(await run('go-to-cell', '2')).toBe(true);
    expect(goToCell).toHaveBeenCalledWith(2);
    expect(await run('go-to-cell', '7')).toBe(false);
    expect(await run('go-to-cell', 'one')).toBe(false);
    expect(await run('go-to-cell')).toBe(false);
    expect(goToCell).toHaveBeenCalledTimes(2);
    expect(await run('run-all')).toBe(true);
    expect(runAll).toHaveBeenCalled();
    expect(await run('cell-type', 'markdown')).toBe(true);
    expect(changeCellType).toHaveBeenCalledWith('markdown');
    expect(await run('cell-type', 'heading')).toBe(false);
    // The notebook's own commands, by their shortcut-table ids.
    expect(await run('move-up')).toBe(true);
    expect(await run('no-such-command')).toBe(false);
    // File › Rename: the page's own rename, which saves and keeps the kernel.
    expect(await run('rename', 'Callisto')).toBe(true);
    expect(rename).toHaveBeenCalledWith('Callisto');
    expect(await run('rename')).toBe(false);
    // An absolute path, as the Mac app passes it, is cleaned as `?open=` is.
    expect(await run('open', '/Europa.ipynb')).toBe(true);
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent(/^Europa\.ipynb$/));
    // Closed without saving: the app moved it to the Trash.
    expect(await run('close')).toBe(true);
    expect(discard).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('pane')).not.toBeInTheDocument());
    expect(await run('close')).toBe(false);
    expect(await run('show-shortcuts')).toBe(true);
    expect(await screen.findByText('Keyboard Shortcuts')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('opens the command palette with Ctrl+Shift+P, the toolbar and the app, and runs a command (#211)', async () => {
    const runAll = vi.fn(async () => {});
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      runAll,
      kernelName: 'python3',
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await screen.findByTestId('pane');

    fireEvent.keyDown(window, {
      key: 'P',
      code: 'KeyP',
      keyCode: 80,
      ctrlKey: true,
      shiftKey: true,
    });
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    await userEvent.keyboard('run all{Enter}');
    expect(runAll).toHaveBeenCalled();
    expect(palette).not.toBeInTheDocument();

    await userEvent.click(screen.getByTitle('Command Palette'));
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();

    expect(await window.ganymede!.command('command-palette')).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('shows the Variables view from the toolbar and the app (#242)', async () => {
    mocks.controller = { dirty: false, save: vi.fn(async () => true), kernelName: 'python3' };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await screen.findByTestId('pane');
    await userEvent.click(screen.getByTitle('Show Variables'));
    const view = screen.getByRole('complementary', { name: 'Variables' });
    // No kernel yet in this fake.
    expect(view).toHaveTextContent('Run a cell to see its variables.');
    await userEvent.click(screen.getByTitle('Hide Variables'));
    expect(screen.queryByRole('complementary', { name: 'Variables' })).not.toBeInTheDocument();
    expect(await window.ganymede!.command('toggle-variables')).toBe(true);
    expect(await screen.findByRole('complementary', { name: 'Variables' })).toBeInTheDocument();
  });

  it('reads the variables for the app’s inspector and expands them for it (#249)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    const kernel = debugKernel({
      inspectVariables: {
        variables: [
          { name: 'a', value: '{…}', type: 'object', variablesReference: 4 },
          { name: 'b', value: '2', type: 'number', variablesReference: 0 },
        ],
      },
      variables: { variables: [{ name: 'x', value: '1', type: 'number', variablesReference: 0 }] },
    });
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      kernelName: 'python3',
      kernel,
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() => expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb', variables: null }));
    // Not read until the app shows them.
    expect(kernel.requestDebug).not.toHaveBeenCalled();

    const run = window.ganymede!.command;
    expect(await run('inspect-variables', 'maybe')).toBe(false);
    expect(await run('inspect-variables', 'on')).toBe(true);
    const names = () =>
      (states.at(-1)?.variables as { rows?: { name: string }[] } | null)?.rows?.map(r => r.name);
    await waitFor(() => expect(names()).toEqual(['a', 'b']));
    expect(await run('toggle-variable', JSON.stringify(['a']))).toBe(true);
    await waitFor(() => expect(names()).toEqual(['a', 'x', 'b']));
    expect(states.at(-1)?.variables).toMatchObject({
      state: 'ready',
      rows: [{ expanded: true }, { depth: 1, path: ['a', 'x'] }, { expandable: false }],
    });
    expect(await run('toggle-variable', JSON.stringify(['nope']))).toBe(false);
    expect(await run('toggle-variable', 'a')).toBe(false);
    expect(await run('toggle-variable', JSON.stringify(['a']))).toBe(true);
    await waitFor(() => expect(names()).toEqual(['a', 'b']));
    expect(await run('inspect-variables', 'off')).toBe(true);
    await waitFor(() => expect(states.at(-1)?.variables).toBeNull());
  });

  it('tells the app what is running and shuts kernels down for it', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.controller = { dirty: false, save: vi.fn(async () => true) };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() => expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb', running: [] }));

    const session = (id: string, path: string) =>
      ({
        id,
        path,
        name: '',
        type: 'notebook',
        kernel: { id: `k-${id}`, name: 'python3' },
      }) as never;
    act(() =>
      fake.setRunning([
        session('s1', 'Io.ipynb'),
        session('s2', 'Europa.ipynb'),
        session('s3', 'Callisto.ipynb'),
      ]),
    );
    await waitFor(() =>
      expect(states.at(-1)?.running).toEqual([
        { id: 's1', path: 'Io.ipynb', kernel: 'Python 3', state: null, kernelId: 'k-s1' },
        { id: 's2', path: 'Europa.ipynb', kernel: 'Python 3', state: null, kernelId: 'k-s2' },
        { id: 's3', path: 'Callisto.ipynb', kernel: 'Python 3', state: null, kernelId: 'k-s3' },
      ]),
    );

    const run = window.ganymede!.command;
    // By id, or by path as the app passes it.
    expect(await run('shutdown-kernel', 's2')).toBe(true);
    expect(fake.sessions.shutdown).toHaveBeenLastCalledWith('s2');
    expect(await run('shutdown-kernel', '/Callisto.ipynb')).toBe(true);
    expect(fake.sessions.shutdown).toHaveBeenLastCalledWith('s3');
    expect(await run('shutdown-kernel', 'nothing')).toBe(false);
    // All but the open notebook's.
    fake.sessions.shutdown.mockClear();
    expect(await run('shutdown-others')).toBe(true);
    expect(fake.sessions.shutdown.mock.calls).toEqual([['s2'], ['s3']]);
    // A failed shutdown is false, not a rejection, and the rest still run.
    fake.sessions.shutdown.mockClear();
    fake.sessions.shutdown.mockRejectedValueOnce(new Error('gone'));
    expect(await run('shutdown-others')).toBe(false);
    expect(fake.sessions.shutdown.mock.calls).toEqual([['s2'], ['s3']]);
    fake.sessions.shutdown.mockRejectedValueOnce(new Error('gone'));
    expect(await run('shutdown-kernel', 's2')).toBe(false);
    vi.unstubAllGlobals();
  });

  it('searches and keeps Recents for the app’s own sidebar (#240)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
        // The app opens other files from its own server.
        openFile: { postMessage: () => {} },
      },
    });
    mocks.controller = { dirty: false, save: vi.fn(async () => true) };
    const fake = fakeServices({
      '': [
        { name: 'Io.ipynb', type: 'notebook' },
        { name: 'moons', type: 'directory' },
      ],
      moons: [{ name: 'Europa.ipynb', type: 'notebook' }],
    });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&chrome=native&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        path: 'Io.ipynb',
        recents: ['Io.ipynb'],
        search: null,
      }),
    );

    const run = window.ganymede!.command;
    expect(await run('search', 'not json')).toBe(false);
    expect(await run('search', JSON.stringify({ query: 'eur' }))).toBe(true);
    await waitFor(
      () =>
        expect(states.at(-1)?.search).toEqual({
          query: 'eur',
          matches: [
            { path: 'moons/Europa.ipynb', name: 'Europa.ipynb', type: 'notebook', snippet: null },
          ],
          searching: false,
          truncated: false,
          error: null,
          opensFiles: true,
        }),
      { timeout: 3000 },
    );
    // A new query never shows the last one's matches under it.
    const before = states.length;
    expect(await run('search', JSON.stringify({ query: 'io' }))).toBe(true);
    await waitFor(
      () => expect(states.at(-1)?.search).toMatchObject({ query: 'io', searching: false }),
      {
        timeout: 3000,
      },
    );
    const forIo = states.slice(before).map(s => s.search as { query: string; matches: unknown[] });
    expect(forIo.every(s => s.query === 'io')).toBe(true);
    expect(forIo.flatMap(s => s.matches)).not.toContainEqual(
      expect.objectContaining({ name: 'Europa.ipynb' }),
    );
    expect(await run('search', JSON.stringify({ query: '' }))).toBe(true);
    await waitFor(() => expect(states.at(-1)?.search).toBeNull());

    // Renames and deletes made by the app itself (#240). Recents drops a
    // notebook that isn't there, so the move goes to one that is.
    expect(await run('file-moved', 'not json')).toBe(false);
    const move = { from: 'Io.ipynb', to: 'moons/Europa.ipynb' };
    expect(await run('file-moved', JSON.stringify(move))).toBe(true);
    await waitFor(() => expect(states.at(-1)?.recents).toEqual(['moons/Europa.ipynb']));
    expect(await run('file-moved', JSON.stringify({ from: 'moons', to: null }))).toBe(true);
    await waitFor(() => expect(states.at(-1)?.recents).toEqual([]));

    expect(await run('clear-recents')).toBe(true);
    await waitFor(() => expect(states.at(-1)?.recents).toEqual([]));
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
    // Nor do the app's renames and deletes move its Recents (#240).
    const gone = JSON.stringify({ from: 'notes.md', to: null });
    expect(await window.ganymede!.command('file-moved', gone)).toBe(false);
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

  it('copies the sample notebook into the folder, under a free name, and opens it', async () => {
    history.replaceState(null, '', '/?kernels=server&dir=moons');
    // A copy from an earlier run is there already.
    const fake = fakeServices({ moons: [], 'moons/Ganymede Tour.ipynb': [] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    render(<App />);

    expect(await screen.findByText('Welcome to Ganymede')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Open Sample Notebook/ }));
    await waitFor(() =>
      expect(screen.getByTestId('pane')).toHaveTextContent('moons/Ganymede Tour 2.ipynb'),
    );
    expect(fake.contents.save).toHaveBeenCalledOnce();
    expect(fake.contents.save).toHaveBeenCalledWith(
      'moons/Ganymede Tour 2.ipynb',
      expect.objectContaining({ type: 'notebook', format: 'json' }),
    );
  });

  it('offers Show Folder only while the sidebar is closed', async () => {
    history.replaceState(null, '', '/?kernels=server');
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices({ '': [] }).services));
    render(<App />);

    // A wide window starts with the sidebar open, so the button would do nothing.
    expect(await screen.findByText('Welcome to Ganymede')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show Folder' })).not.toBeInTheDocument();
  });

  it('does not welcome again once dismissed', async () => {
    localStorage.setItem('ganymede-ui:onboarding', 'dismissed');
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'browser' }));
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices().services, { kind: 'browser' }));
    render(<App />);

    expect(await screen.findByText(/Choose a notebook in the sidebar/)).toBeInTheDocument();
    expect(screen.queryByText('Welcome to Ganymede')).not.toBeInTheDocument();
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

    it('gives the cells their touch controls, but not beside the Mac app’s own sidebar', async () => {
      const root = document.documentElement;
      const first = render(<App />);
      await waitFor(() => expect(root).toHaveClass('touch-ui'));
      first.unmount();
      // The web view beside the native sidebar is narrow in a wide window.
      history.replaceState(null, '', '/?chrome=native');
      render(<App />);
      await waitFor(() => expect(root).toHaveClass('chrome-native'));
      expect(root).not.toHaveClass('touch-ui');
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
