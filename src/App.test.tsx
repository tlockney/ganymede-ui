import { renderToStaticMarkup } from 'react-dom/server';
import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServerConnection } from '@jupyterlab/services';
import type { Backend, BackendConfig } from './lib/backends';
import { entry, fakeBackend, fakeServices } from './test/fakes';
import { debugKernel } from './test/debug-kernel';
import {
  chooseView,
  chosenView,
  forgetChosenViews,
  forgetPositions,
  readPosition,
  savePosition,
} from './lib/journal';
import { recentsKey } from './lib/recents';
import { loadConsoles, saveConsole } from './lib/console-recents';
import { handOff } from './lib/rename';
import { SERVER_TIMEOUT_MS } from './lib/server-request';
import { NoGrantsRoute } from './lib/host-grants';

// The shell's wiring: which backend it connects to, the sheet, and new
// notebooks. The backends and the notebook pane are tested on their own.
const mocks = vi.hoisted(() => ({
  connect: vi.fn<(c: BackendConfig) => Promise<Backend>>(),
  signedInHere: vi.fn<() => Promise<boolean>>(),
  /** What the pane hands the toolbar, when a test sets it. */
  controller: undefined as
    undefined | ({ dirty: boolean; save: () => Promise<boolean> } & Record<string, unknown>),
  loadHostGrants: vi.fn(),
  /** The last pane's `onRenamed`. */
  onRenamed: undefined as undefined | ((from: string, to: string) => void),
  /** The last pane's `places` (#832). */
  places: undefined as unknown,
  /** The last pane's `onController`. */
  onController: undefined as undefined | ((c: unknown) => void),
  /** The last pane's `onLoadError` (#891). */
  onLoadError: undefined as undefined | ((failed: boolean) => void),
  /** Whether the mock pane reports an open failure (#891). */
  loadError: false,
  /** The last Find query the pane was given (#879). */
  findQuery: undefined as string | undefined,
  /** Stands in for the examples' copy when a test sets it. */
  copyExamples: undefined as undefined | (() => Promise<string>),
}));

vi.mock('./lib/examples', async importOriginal => {
  const real = await importOriginal<typeof import('./lib/examples')>();
  return {
    ...real,
    copyExamples: ((...args: Parameters<typeof real.copyExamples>) =>
      mocks.copyExamples
        ? mocks.copyExamples()
        : real.copyExamples(...args)) as typeof real.copyExamples,
  };
});

vi.mock('./lib/backends', async importOriginal => ({
  ...(await importOriginal<object>()),
  connect: mocks.connect,
  signedInHere: mocks.signedInHere,
}));

vi.mock('./lib/host-grants', async importOriginal => ({
  ...(await importOriginal<object>()),
  loadHostGrants: mocks.loadHostGrants,
}));

// The data view's own tests render the real one (and JupyterLab's JSON viewer).
vi.mock('./components/DataPane', () => ({
  DataPane: ({ path, onOpenAsText }: { path: string; onOpenAsText?(): void }) => (
    <div data-testid="data-pane" data-path={path}>
      {onOpenAsText && <button onClick={onOpenAsText}>Open as Text</button>}
    </div>
  ),
}));

// The console's own tests render the real one, against a stand-in DuckDB.
vi.mock('./components/DuckdbConsole', async () => {
  const { useState } = await import('react');
  let mounts = 0;
  return {
    DuckdbConsole: ({
      folder,
      id,
      name,
      onRename,
      onOpenConsole,
      onOpenNotebook,
    }: {
      folder: string;
      id: string;
      name: string;
      onRename(n: string): void;
      onOpenConsole(id: string): void;
      onOpenNotebook(p: string): void;
    }) => {
      // Which console this is: a new one counts up, a re-render keeps it.
      const [mount] = useState(() => ++mounts);
      return (
        <div
          data-testid="duck-console"
          data-folder={folder}
          data-mount={mount}
          data-id={id}
          data-name={name}
        >
          <button onClick={() => onRename('Renamed')}>Rename console</button>
          <button onClick={() => onOpenConsole('past')}>Open past</button>
          <button onClick={() => onOpenNotebook('duckdb-console.ipynb')}>Open exported</button>
        </div>
      );
    },
  };
});

vi.mock('./components/NotebookPane', async () => {
  const { useEffect } = await import('react');
  return {
    NotebookPane: ({
      path,
      places,
      findQuery,
      onController,
      onLoadError,
      onRenamed,
    }: {
      path: string;
      places?: unknown;
      findQuery?: string;
      onController(c: unknown): void;
      onLoadError?(failed: boolean): void;
      onRenamed?(from: string, to: string): void;
    }) => {
      mocks.places = places;
      mocks.onRenamed = onRenamed;
      mocks.onController = onController;
      mocks.onLoadError = onLoadError;
      mocks.findQuery = findQuery;
      useEffect(() => {
        onLoadError?.(mocks.loadError);
      }, [path, onLoadError]);
      useEffect(() => {
        if (mocks.controller) {
          const name = path.split('/').pop();
          onController({
            name,
            status: 'idle',
            trusted: true,
            hostWants: () => [],
            recordedParams: () => '{"day": "mon"}',
            ...mocks.controller,
            path,
          });
        }
      }, [path, onController]);
      return <div data-testid="pane">{path}</div>;
    },
  };
});

const { App } = await import('./App');
const { resetOnboardingForTests } = await import('./lib/onboarding');
const { resetStorageNoticeForTests } = await import('./lib/storage-notice');

beforeEach(() => {
  mocks.controller = undefined;
  mocks.onLoadError = undefined;
  mocks.loadError = false;
  mocks.findQuery = undefined;
  mocks.copyExamples = undefined;
  mocks.signedInHere.mockReset().mockResolvedValue(false);
  localStorage.clear();
  resetOnboardingForTests();
  resetStorageNoticeForTests();
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
  it('shows the start screen, not the sheet, on first start (#815)', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Try a Notebook' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open a Notebook…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect to a Server…' })).toBeInTheDocument();
    expect(screen.queryByText('Where should kernels run?')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it('opens the sheet from Connect to a Server…, and Cancel goes back to the start screen', async () => {
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Connect to a Server…' }));
    expect(await screen.findByText('Where should kernels run?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Where should kernels run?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try a Notebook' })).toBeInTheDocument();
    // Escape too, and the focus goes back to the button that opened it.
    const connect = screen.getByRole('button', { name: 'Connect to a Server…' });
    connect.focus();
    await userEvent.keyboard('{Enter}');
    expect(await screen.findByText('Where should kernels run?')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Where should kernels run?')).not.toBeInTheDocument();
    expect(connect).toHaveFocus();
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

  it('tells the app when a notebook asks for more than its grant', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.loadHostGrants.mockResolvedValue({
      path: 'Io.ipynb',
      grant: {},
      defaults: { read: [''], edit_self: true, run: [] },
    });
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      hostWants: () => ['notebooks.read', 'notebooks.run'],
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb', accessWanted: ['notebooks.run'] }),
    );
    expect(mocks.loadHostGrants).toHaveBeenCalledWith(expect.anything(), 'Io.ipynb');
  });

  // The grants of a machine are the machine's, read in its window through
  // the app's mount (#868).
  it('reads a machine’s notebook grant in its window (#868)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.loadHostGrants.mockResolvedValue({
      path: 'Io.ipynb',
      grant: {},
      defaults: { read: [''], edit_self: true, run: [] },
    });
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      hostWants: () => ['notebooks.run'],
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockImplementation(async c => fakeBackend(fake.services, c));
    history.replaceState(null, '', '/?machine=mini-1&machine_name=m4mini&open=Io.ipynb');
    render(<App />);
    expect(await screen.findByTitle('Notebook Access: asks for notebooks.run')).toBeInTheDocument();
    const [asked, path] = mocks.loadHostGrants.mock.calls.at(-1) as [
      { config: { machine?: string } },
      string,
    ];
    expect(asked.config.machine).toBe('mini-1');
    expect(path).toBe('Io.ipynb');
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        hostGrants: true,
        accessWanted: ['notebooks.run'],
      }),
    );
    vi.unstubAllGlobals();
  });

  // An app whose bundled server predates ganymede#973 answers 404 for the
  // grant: its mount doesn't forward api/host/grants. Notebook Access still
  // opens, and the sheet says the app needs a newer version; the padlock
  // shows nothing (#868).
  it('opens a machine’s Notebook Access when its mount has no route (#868)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.loadHostGrants.mockRejectedValue(
      new NoGrantsRoute(
        'Notebook access on a connected machine needs a newer version of this app.',
      ),
    );
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      hostWants: () => ['notebooks.run'],
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockImplementation(async c => fakeBackend(fake.services, c));
    history.replaceState(null, '', '/?machine=mini-1&machine_name=m4mini&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({ hostGrants: true, accessWanted: [] }),
    );
    // Quiet: the grant never said the notebook asks for more.
    expect(screen.queryByTitle(/^Notebook Access: asks for/)).toBeNull();
    // The app's own menu item, as its menu runs it, opens the sheet.
    expect(await window.ganymede!.command('notebook-access')).toBe(true);
    expect(
      await screen.findByText(
        'Notebook access on a connected machine needs a newer version of this app.',
      ),
    ).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  // The probe's answer decides: a machine's window is dimmed, and keeps its
  // padlock quiet, until the app has checked the open notebook's grant (#868).
  it('dims a machine’s Notebook Access until its grant probe answers (#868)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    let answer: ((grants: unknown) => void) | undefined;
    mocks.loadHostGrants.mockReturnValue(new Promise(resolve => (answer = resolve)));
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      hostWants: () => [],
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockImplementation(async c => fakeBackend(fake.services, c));
    history.replaceState(null, '', '/?machine=mini-1&machine_name=m4mini&open=Io.ipynb');
    render(<App />);
    await waitFor(() => expect(mocks.loadHostGrants).toHaveBeenCalled());
    await act(async () => {});
    // No `wants`, and the probe still runs for a machine: until it answers,
    // the machine isn't one that can be edited.
    expect(states.at(-1)).toMatchObject({ hostGrants: false });
    await act(async () =>
      answer?.({
        path: 'Io.ipynb',
        grant: {},
        defaults: { read: [''], edit_self: true, run: [] },
      }),
    );
    await waitFor(() => expect(states.at(-1)).toMatchObject({ hostGrants: true }));
    vi.unstubAllGlobals();
  });

  // The palette's Notebook Access follows the same answer: it can't be
  // picked while the app checks the machine's grant, and can once it has
  // (#868).
  it('dims the palette’s Notebook Access until a machine’s probe answers (#868)', async () => {
    let answer: ((grants: unknown) => void) | undefined;
    mocks.loadHostGrants.mockReturnValue(new Promise(resolve => (answer = resolve)));
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      hostWants: () => [],
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockImplementation(async c => fakeBackend(fake.services, c));
    history.replaceState(null, '', '/?machine=mini-1&machine_name=m4mini&open=Io.ipynb');
    render(<App />);
    await waitFor(() => expect(mocks.loadHostGrants).toHaveBeenCalled());
    expect(await window.ganymede!.command('command-palette')).toBe(true);
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    const entry = () => within(palette).getByRole('option', { name: /Notebook Access/ });
    await waitFor(() => expect(entry()).toHaveAttribute('aria-disabled', 'true'));
    await act(async () =>
      answer?.({
        path: 'Io.ipynb',
        grant: {},
        defaults: { read: [''], edit_self: true, run: [] },
      }),
    );
    await waitFor(() => expect(entry()).not.toHaveAttribute('aria-disabled'));
  });

  it('marks device kernels in the command palette (#469)', async () => {
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    (fake.services.kernelspecs.specs!.kernelspecs as Record<string, unknown>)['cdp-browser'] = {
      name: 'cdp-browser',
      display_name: 'TypeScript (in app)',
      language: 'typescript',
      argv: [],
      resources: {},
      metadata: { capabilities: { device: true } },
    };
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
    };
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('command-palette')).toBe(true);
    const palette = await screen.findByRole('dialog', { name: 'Command palette' });
    const deviceOption = within(palette).getByRole('option', {
      name: 'Change Kernel to TypeScript (in app), offers the device API',
    });
    expect(deviceOption).toHaveTextContent('Change Kernel to TypeScript (in app) ◆');
    expect(deviceOption).toHaveAttribute('title', 'offers the device API');
    expect(
      within(palette).getByRole('option', { name: /Change Kernel to Python 3/ }),
    ).not.toHaveAttribute('title');
  });

  it('tells the app the notebook’s title, for its window (#867)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.controller = {
      title: 'Io moons',
      dirty: false,
      save: vi.fn(async () => true),
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb', title: 'Io moons' }),
    );
    // With no notebook open, the state says so, and has no title either.
    expect(states.some(s => s.path === null && s.title === null)).toBe(true);
  });

  it('leaves Find waiting while a notebook is still opening, then shows its matches (#891)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    const fake = fakeServices({
      '': [
        { name: 'Io.ipynb', type: 'notebook' },
        { name: 'Europa.ipynb', type: 'notebook' },
      ],
    });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() => expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb' }));
    const run = window.ganymede!.command;
    expect(await run('find-in-notebook', '  volcano ')).toBe(true);
    // While Io is still opening (no controller and no load error), App answers null
    // so the Find tab keeps "Searching…" instead of flashing "No matches".
    await waitFor(() => expect(mocks.findQuery).toBe('volcano'));
    expect(states.at(-1)!.notebookFind).toBeNull();

    // Switching from a failed notebook to another opening notebook clears the empty answer.
    act(() => mocks.onLoadError?.(true));
    await waitFor(() =>
      expect(states.at(-1)!.notebookFind).toEqual({ query: 'volcano', matches: [], more: 0 }),
    );
    expect(await run('open', 'Europa.ipynb')).toBe(true);
    await waitFor(() => expect(states.at(-1)).toMatchObject({ path: 'Europa.ipynb' }));
    expect(states.at(-1)!.notebookFind).toBeNull();
  });

  it('answers the Find tab with nothing found once opening has failed (#891)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.loadError = true;
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() => expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb' }));
    expect(states.at(-1)!.notebookFind).toBeNull();
    const run = window.ganymede!.command;
    expect(await run('find-in-notebook', '  volcano ')).toBe(true);
    await waitFor(() =>
      expect(states.at(-1)!.notebookFind).toEqual({ query: 'volcano', matches: [], more: 0 }),
    );
    // Retrying clears the failure so Find waits again until the retry settles.
    act(() => mocks.onLoadError?.(false));
    await waitFor(() => expect(states.at(-1)!.notebookFind).toBeNull());
    act(() => mocks.onLoadError?.(true));
    await waitFor(() =>
      expect(states.at(-1)!.notebookFind).toEqual({ query: 'volcano', matches: [], more: 0 }),
    );
    expect(await run('find-in-notebook', '')).toBe(true);
    await waitFor(() => expect(states.at(-1)!.notebookFind).toBeNull());
  });

  it('tells the app the notebook’s language, for its window’s chip (#867)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.controller = {
      kernelName: 'python3',
      // The file's own language, which the running kernel's kernelspec
      // answers before it does.
      language: 'julia',
      dirty: false,
      save: vi.fn(async () => true),
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb', kernelLanguage: 'python' }),
    );
  });

  it('falls back to the notebook’s own language when no kernelspec names one (#867)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    // A kernel the file asks for that isn't installed: no kernelspec to ask.
    mocks.controller = {
      missingKernel: 'Julia 1.11',
      language: 'julia',
      dirty: false,
      save: vi.fn(async () => true),
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb', kernelLanguage: 'julia' }),
    );
    // With no notebook open, no language either.
    expect(states.some(s => s.path === null && s.kernelLanguage === null)).toBe(true);
  });

  it('runs the app’s commands and tells it what to show', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    const runAll = vi.fn(async () => {});
    const clearOutputs = vi.fn();
    const restartAndRunAll = vi.fn(async () => {});
    const exportAs = vi.fn(async () => {});
    const changeCellType = vi.fn();
    const command = vi.fn((id: string) => id === 'move-up');
    const discard = vi.fn();
    const rename = vi.fn(async () => true);
    const goToCell = vi.fn((i: number) => i < 3);
    const goToDefinition = vi.fn(async () => true);
    const renameSymbol = vi.fn(async (name?: string) => name !== 'refused');
    mocks.controller = {
      discard,
      rename,
      goToCell,
      goToDefinition,
      renameSymbol,
      outline: [{ level: 1, text: 'Io', cell: 2, ran: true }],
      activeCell: 2,
      cellCount: 14,
      ranCellCount: 12,
      // The Mac app's Find results (#879), posted in the state.
      notebookFind: {
        query: 'volcano',
        matches: [{ cell: 2, heading: 'Io', snippet: 'volcano = 2' }],
        more: 1,
      },
      dirty: false,
      save: vi.fn(async () => true),
      runAll,
      clearOutputs,
      restartAndRunAll,
      exportAs,
      changeCellType,
      command,
      kernelName: 'python3',
      kernelVersionLine: 'cdp-kernel 0.14.0 · node 24.11.0',
      cellType: 'code',
      journal: true,
      locked: true,
      saveAttention: true,
      reviewRecovery: vi.fn(),
    };
    const fake = fakeServices({
      '': [
        { name: 'Io.ipynb', type: 'notebook' },
        { name: 'Europa.ipynb', type: 'notebook' },
      ],
    });
    (fake.services.kernelspecs.specs!.kernelspecs as Record<string, unknown>)['cdp-browser'] = {
      name: 'cdp-browser',
      display_name: 'TypeScript (in app)',
      language: 'typescript',
      argv: [],
      resources: {},
      metadata: { capabilities: { device: true } },
    };
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        path: 'Io.ipynb',
        // No metadata.title (#867): the app's window falls back to the file.
        title: null,
        status: 'idle',
        kernel: 'python3',
        kernelDisplayName: 'Python 3',
        // The running kernel's kernelspec names the language (#867).
        kernelLanguage: 'python',
        kernelVersionLine: 'cdp-kernel 0.14.0 · node 24.11.0',
        cellType: 'code',
        // Which view shows, for the app's View as Journal (#724).
        journal: true,
        // Saving locked by a change on disk, for the status line (#812).
        locked: true,
        saveAttention: true,
        kernels: [
          { name: 'python3', displayName: 'Python 3', device: false },
          { name: 'cdp-browser', displayName: 'TypeScript (in app)', device: true },
        ],
        outline: [{ level: 1, text: 'Io', cell: 2, ran: true }],
        activeCell: 2,
        cellCount: 14,
        ranCellCount: 12,
        notebookFind: {
          query: 'volcano',
          matches: [{ cell: 2, heading: 'Io', snippet: 'volcano = 2' }],
          more: 1,
        },
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
    // The Mac app's Find tab asks the page's cells (#879).
    expect(await run('find-in-notebook', '  volcano  ')).toBe(true);
    await waitFor(() => expect(mocks.findQuery).toBe('volcano'));
    expect(await run('find-in-notebook', '')).toBe(true);
    await waitFor(() => expect(mocks.findQuery).toBe(''));
    // Go to definition and rename through the kernel's language service (#676).
    expect(await run('go-to-definition')).toBe(true);
    expect(goToDefinition).toHaveBeenCalledTimes(1);
    expect(await run('rename-symbol', 'sum')).toBe(true);
    expect(renameSymbol).toHaveBeenLastCalledWith('sum');
    expect(await run('rename-symbol')).toBe(true);
    expect(renameSymbol).toHaveBeenLastCalledWith(undefined);
    expect(await run('review-recovery')).toBe(true);
    expect(mocks.controller.reviewRecovery).toHaveBeenCalledTimes(1);
    expect(await run('rename-symbol', 'refused')).toBe(false);
    expect(await run('run-all')).toBe(true);
    expect(runAll).toHaveBeenCalled();
    expect(await run('clear-outputs')).toBe(true);
    expect(clearOutputs).toHaveBeenCalledOnce();
    // The app's Restart & Run All (#812).
    expect(await run('restart-run-all')).toBe(true);
    expect(restartAndRunAll).toHaveBeenCalledOnce();
    expect(await run('export', 'markdown')).toBe(true);
    expect(exportAs).toHaveBeenCalledWith('markdown');
    expect(await run('export', 'pdf')).toBe(false);
    expect(await run('run-with-params')).toBe(true);
    const sheet = await screen.findByRole('dialog', { name: /with Parameters/ });
    expect(within(sheet).getByRole('textbox', { name: /Parameters/ })).toHaveValue(
      '{"day": "mon"}',
    );
    // The sheet starts the next time with what it last ran.
    Object.assign(fake.contents, {
      serverSettings: ServerConnection.makeSettings({ baseUrl: 'http://h/' }),
    });
    const request = vi
      .spyOn(ServerConnection, 'makeRequest')
      .mockResolvedValue(new Response(JSON.stringify({ status: 'ok', results: {} })));
    const params = within(sheet).getByRole('textbox', { name: /Parameters/ });
    await userEvent.clear(params);
    await userEvent.type(params, '{{"day": "tue"}');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Run' }));
    await within(sheet).findByText('The run finished.');
    await userEvent.click(within(sheet).getByRole('button', { name: 'Done' }));
    request.mockRestore();
    expect(await run('run-with-params')).toBe(true);
    const again = await screen.findByRole('dialog', { name: /with Parameters/ });
    expect(within(again).getByRole('textbox', { name: /Parameters/ })).toHaveValue(
      '{\n  "day": "tue"\n}',
    );
    // A rename while the sheet is up keeps it, and its parameters follow.
    act(() => mocks.onRenamed!('Io.ipynb', 'Moon.ipynb'));
    expect(screen.getByRole('dialog', { name: /with Parameters/ })).toBe(again);
    act(() => mocks.onRenamed!('Moon.ipynb', 'Io.ipynb'));
    await userEvent.click(within(again).getByRole('button', { name: 'Cancel' }));
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
    // Closing the notebook closes its Run with Parameters sheet, which
    // stops a run.
    expect(await run('run-with-params')).toBe(true);
    await screen.findByRole('dialog', { name: /with Parameters/ });
    // Closed without saving: the app moved it to the Trash.
    expect(await run('close')).toBe(true);
    expect(discard).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByTestId('pane')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /with Parameters/ })).not.toBeInTheDocument(),
    );
    expect(await run('close')).toBe(false);
    expect(await run('show-shortcuts')).toBe(true);
    expect(await screen.findByText('Keyboard Shortcuts')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('opens the app’s Settings at a tab instead of its own sheets (#332)', async () => {
    const asked: unknown[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: { settings: { postMessage: (m: unknown) => asked.push(m) } },
    });
    const fake = fakeServices({ '': [] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    const run = window.ganymede!.command;
    expect(await run('show-shortcuts')).toBe(true);
    expect(await run('show-settings')).toBe(true);
    expect(await run('connect')).toBe(true);
    act(() => void window.dispatchEvent(new Event('ganymede:show-shortcuts')));
    expect(asked).toEqual(['shortcuts', 'agent', 'kernels', 'shortcuts']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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

    await userEvent.click(screen.getByTitle('More'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Command Palette…' }));
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();

    expect(await window.ganymede!.command('command-palette')).toBe(true);
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('names where the notebook is saved and runs in the toolbar’s status line (#801)', async () => {
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      kernelName: 'python3',
      name: 'Io.ipynb',
      path: 'Io.ipynb',
      status: 'idle',
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(
      fakeBackend(fake.services, { kind: 'ganymede', url: 'https://lab.example.com', token: 't' }),
    );
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await screen.findByTestId('pane');
    expect(
      await screen.findByRole('button', {
        name: /^Saved on lab\.example\.com · Runs on lab\.example\.com · /,
      }),
    ).toBeInTheDocument();
  });

  it('shows the Variables view from the toolbar and the app (#242)', async () => {
    mocks.controller = { dirty: false, save: vi.fn(async () => true), kernelName: 'python3' };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await screen.findByTestId('pane');
    await userEvent.click(screen.getByTitle('More'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Show Variables' }));
    const view = screen.getByRole('complementary', { name: 'Variables' });
    // No kernel yet in this fake.
    expect(view).toHaveTextContent('Run a cell to see its variables.');
    await userEvent.click(screen.getByTitle('More'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Hide Variables' }));
    expect(screen.queryByRole('complementary', { name: 'Variables' })).not.toBeInTheDocument();
    expect(await window.ganymede!.command('toggle-variables')).toBe(true);
    expect(await screen.findByRole('complementary', { name: 'Variables' })).toBeInTheDocument();
  });

  it('does nothing for go-to-definition and rename-symbol with no notebook open (#676)', async () => {
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('go-to-definition')).toBe(false);
    expect(await window.ganymede!.command('rename-symbol', 'x')).toBe(false);
  });

  it('switches the notebook to its journal view from the toolbar and the app (#184)', async () => {
    const toggleJournal = vi.fn();
    mocks.controller = {
      dirty: false,
      save: vi.fn(async () => true),
      journal: false,
      toggleJournal,
    };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await screen.findByTestId('pane');
    await userEvent.click(screen.getByTitle('More'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'View as Journal' }));
    expect(toggleJournal).toHaveBeenCalledTimes(1);
    expect(await window.ganymede!.command('toggle-journal')).toBe(true);
    expect(toggleJournal).toHaveBeenCalledTimes(2);
  });

  it('does nothing for toggle-journal with no notebook open (#184)', async () => {
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('toggle-journal')).toBe(false);
  });

  it('turns type errors on and off from the app, and remembers it (#669)', async () => {
    localStorage.removeItem('ganymede-ui:type-errors');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('toggle-type-errors')).toBe(true);
    expect(localStorage.getItem('ganymede-ui:type-errors')).toBe('off');
    expect(await window.ganymede!.command('toggle-type-errors')).toBe(true);
    expect(localStorage.getItem('ganymede-ui:type-errors')).toBeNull();
  });

  it('turns the live Markdown preview on and off from the app, and remembers it (#672)', async () => {
    localStorage.removeItem('ganymede-ui:live-markdown');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('toggle-live-markdown')).toBe(true);
    expect(localStorage.getItem('ganymede-ui:live-markdown')).toBe('on');
    expect(await window.ganymede!.command('toggle-live-markdown')).toBe(true);
    expect(localStorage.getItem('ganymede-ui:live-markdown')).toBeNull();
  });

  it('turns Wrap Code on and off from the app, and remembers it (#813)', async () => {
    localStorage.removeItem('ganymede-ui:wrap-code');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('toggle-wrap-code')).toBe(true);
    expect(localStorage.getItem('ganymede-ui:wrap-code')).toBe('on');
    expect(await window.ganymede!.command('toggle-wrap-code')).toBe(true);
    expect(localStorage.getItem('ganymede-ui:wrap-code')).toBeNull();
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
        {
          id: 's1',
          path: 'Io.ipynb',
          kernel: 'Python 3',
          state: null,
          kernelId: 'k-s1',
          memory: null,
        },
        {
          id: 's2',
          path: 'Europa.ipynb',
          kernel: 'Python 3',
          state: null,
          kernelId: 'k-s2',
          memory: null,
        },
        {
          id: 's3',
          path: 'Callisto.ipynb',
          kernel: 'Python 3',
          state: null,
          kernelId: 'k-s3',
          memory: null,
        },
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

  it('tells the app where kernels run, and when that remote isn’t answering (#832)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.controller = { dirty: false, save: vi.fn(async () => true) };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    // What the server says of the remote kernels run on: JupyterLab's
    // kernelspec manager drops these keys, so the page asks itself.
    (fake.services as unknown as { serverSettings: unknown }).serverSettings =
      ServerConnection.makeSettings({
        baseUrl: 'http://server/',
        fetch: (async () =>
          new Response(
            JSON.stringify({
              kernelspecs: { python3: { name: 'python3', gateway: true } },
              gateway: {
                name: 'workmbp',
                reachable: false,
                error: 'gateway: error sending request',
              },
            }),
          )) as unknown as typeof fetch,
      });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=Io.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(states.at(-1)).toMatchObject({
        kernels: [{ name: 'python3', displayName: 'Python 3', device: false, gateway: 'workmbp' }],
        kernelsRemote: {
          name: 'workmbp',
          reachable: false,
          error: 'gateway: error sending request',
        },
      }),
    );

    // The toolbar's kernel menu names where a kernel runs, and says when
    // that remote isn't answering.
    await userEvent.click(screen.getByRole('button', { name: /^(Saved|Edited|Locked)/ }));
    const menu = await screen.findByRole('menu', { name: 'Notebook and Kernel' });
    expect(
      within(menu).getByRole('menuitemradio', { name: 'Python 3 · workmbp' }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole('menuitem', {
        name: 'workmbp isn’t answering: gateway: error sending request',
      }),
    ).toBeDisabled();
    // The pane gets the same places, for its notice's kernel picker.
    expect(mocks.places).toEqual({
      remote: { name: 'workmbp', reachable: false, error: 'gateway: error sending request' },
      gateway: ['python3'],
    });
    vi.unstubAllGlobals();
  });

  it('says in a machine’s window that the machine’s remote isn’t answering (#832)', async () => {
    mocks.controller = { dirty: false, save: vi.fn(async () => true) };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    (fake.services as unknown as { serverSettings: unknown }).serverSettings =
      ServerConnection.makeSettings({
        baseUrl: 'http://127.0.0.1:1/machines/mini-1/',
        fetch: (async () =>
          new Response(
            JSON.stringify({
              kernelspecs: { python3: { name: 'python3', gateway: true } },
              gateway: { name: 'workmbp', reachable: false, error: 'gateway: timed out' },
            }),
          )) as unknown as typeof fetch,
      });
    mocks.connect.mockImplementation(async c => fakeBackend(fake.services, c));
    history.replaceState(null, '', '/?machine=mini-1&machine_name=m4mini&open=Io.ipynb');
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /^(Saved|Edited|Locked)/ }));
    const menu = await screen.findByRole('menu', { name: 'Notebook and Kernel' });
    expect(
      await within(menu).findByRole('menuitem', {
        name: 'm4mini runs kernels on workmbp, which isn’t answering',
      }),
    ).toBeDisabled();
  });

  it('reads the kernels’ memory while the app’s Running list asks for it (#241)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.controller = { dirty: false, save: vi.fn(async () => true) };
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    const asked: string[] = [];
    (fake.services as { serverSettings: ServerConnection.ISettings }).serverSettings =
      ServerConnection.makeSettings({
        baseUrl: 'http://server/',
        fetch: ((input: RequestInfo) => {
          const url = typeof input === 'string' ? input : input.url;
          // The kernel list is asked for on its own (#832); this records
          // the memory reads.
          if (url.includes('kernel_usage')) asked.push(url);
          return Promise.resolve(
            new Response(JSON.stringify({ content: { kernel_memory: 2048 } })),
          );
        }) as typeof fetch,
      });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&chrome=native&open=Io.ipynb');
    render(<App />);
    await waitFor(() => expect(states.at(-1)).toMatchObject({ path: 'Io.ipynb' }));
    act(() =>
      fake.setRunning([
        {
          id: 's1',
          path: 'Io.ipynb',
          name: '',
          type: 'notebook',
          kernel: { id: 'k1', name: 'python3' },
        } as never,
      ]),
    );
    await waitFor(() =>
      expect(states.at(-1)?.running).toMatchObject([{ kernelId: 'k1', memory: null }]),
    );
    // Not asked until the list shows.
    expect(asked).toEqual([]);

    const run = window.ganymede!.command;
    expect(await run('watch-memory', 'yes')).toBe(false);
    expect(await run('watch-memory', 'on')).toBe(true);
    await waitFor(() =>
      expect(states.at(-1)?.running).toMatchObject([{ kernelId: 'k1', memory: 2048 }]),
    );
    expect(asked[0]).toMatch(/kernel_usage\/get_usage\/k1/);
    expect(await run('watch-memory', 'off')).toBe(true);
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
    const backend = fakeBackend(fake.services);
    mocks.connect.mockResolvedValue(backend);
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
    // A Run with Parameters sheet follows the move, and the app's opening
    // the moved notebook doesn't close it (a run keeps going).
    expect(await run('run-with-params')).toBe(true);
    const sheet = await screen.findByRole('dialog', { name: /with Parameters/ });
    const move = { from: 'Io.ipynb', to: 'moons/Europa.ipynb' };
    chooseView(recentsKey(backend.config), 'Io.ipynb', false);
    const place = { cell: 'c1', offset: 4, cells: 3 };
    savePosition(recentsKey(backend.config), 'Io.ipynb', place);
    expect(await run('file-moved', JSON.stringify(move))).toBe(true);
    expect(chosenView(recentsKey(backend.config), 'moons/Europa.ipynb')).toBe(false);
    expect(readPosition(recentsKey(backend.config), 'moons/Europa.ipynb')).toEqual(place);
    expect(readPosition(recentsKey(backend.config), 'Io.ipynb')).toBeUndefined();
    forgetChosenViews();
    forgetPositions();
    // The app sends the two as separate tasks: a render can land between.
    await act(() => new Promise(r => setTimeout(r, 100)));
    expect(await run('open', 'moons/Europa.ipynb')).toBe(true);
    await waitFor(() => expect(states.at(-1)?.path).toBe('moons/Europa.ipynb'));
    expect(screen.getByRole('dialog', { name: /with Parameters/ })).toBe(sheet);
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(states.at(-1)?.recents).toEqual(['moons/Europa.ipynb']));
    expect(await run('file-moved', JSON.stringify({ from: 'moons', to: null }))).toBe(true);
    await waitFor(() => expect(states.at(-1)?.recents).toEqual([]));

    expect(await run('clear-recents')).toBe(true);
    await waitFor(() => expect(states.at(-1)?.recents).toEqual([]));
    vi.unstubAllGlobals();
  });

  it('opens other files in the app’s editor, on the app’s server or its mount of a machine (#855)', async () => {
    const opened: unknown[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: { openFile: { postMessage: (m: unknown) => opened.push(m) } },
    });
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'ganymede', url: '' }));
    const tree = { '': [{ name: 'notes.md', type: 'file' as const }] };
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices(tree).services));
    const here = render(<App />);
    await userEvent.click(await screen.findByText('notes.md'));
    expect(opened).toEqual([{ path: 'notes.md' }]);
    here.unmount();

    // Another server's files aren't the app's to open.
    mocks.connect.mockResolvedValue(
      fakeBackend(fakeServices(tree).services, {
        kind: 'ganymede',
        url: 'http://io:8888',
        token: '',
      }),
    );
    const remote = render(<App />);
    // Not opened, though its file menu still works.
    const notes = (await screen.findByText('notes.md')).closest('button')!;
    expect(notes).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(notes);
    expect(opened).toEqual([{ path: 'notes.md' }]);
    // Nor do the app's renames and deletes move its Recents (#240).
    const gone = JSON.stringify({ from: 'notes.md', to: null });
    expect(await window.ganymede!.command('file-moved', gone)).toBe(false);
    remote.unmount();

    // A machine window is the same server's mount, so its files open too,
    // and its search says so (#855).
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        openFile: { postMessage: (m: unknown) => opened.push(m) },
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.connect.mockImplementation(async c => fakeBackend(fakeServices(tree).services, c));
    history.replaceState(null, '', '/?machine=mini-1&machine_name=m4mini');
    const machine = render(<App />);
    await userEvent.click(await screen.findByText('notes.md'));
    expect(opened).toEqual([{ path: 'notes.md' }, { path: 'notes.md' }]);
    machine.unmount();

    // Its search says the app opens the machine's files too (#855).
    history.replaceState(null, '', '/?machine=mini-1&machine_name=m4mini&chrome=native');
    render(<App />);
    expect(await window.ganymede!.command('search', JSON.stringify({ query: 'notes' }))).toBe(true);
    await waitFor(() =>
      expect(states.at(-1)?.search).toMatchObject({
        matches: [{ path: 'notes.md', name: 'notes.md' }],
        opensFiles: true,
      }),
    );
    vi.unstubAllGlobals();
  });

  it('opens CSV, TSV, JSON and Parquet files in the data view, in a browser too (#671)', async () => {
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'ganymede', url: '' }));
    const tree = {
      '': [
        { name: 'moons.csv', type: 'file' as const },
        { name: 'notes.md', type: 'file' as const },
      ],
    };
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices(tree).services));
    render(<App />);
    // A browser has no text editor: the other file stays disabled, the CSV opens.
    expect((await screen.findByText('notes.md')).closest('button')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await userEvent.click(screen.getByText('moons.csv'));
    expect(await screen.findByTestId('data-pane')).toHaveAttribute('data-path', 'moons.csv');
    expect(screen.queryByRole('button', { name: 'Open as Text' })).toBeNull();
    expect(document.title).toBe('moons.csv');
  });

  it('routes a data file the app opens to the page, with Open as Text to its editor (#671)', async () => {
    const opened: unknown[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: { openFile: { postMessage: (m: unknown) => opened.push(m) } },
    });
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'ganymede', url: '' }));
    const tree = { '': [{ name: 'moons.csv', type: 'file' as const }] };
    mocks.connect.mockResolvedValue(fakeBackend(fakeServices(tree).services));
    render(<App />);
    await userEvent.click(await screen.findByText('moons.csv'));
    // In the page, not the editor.
    expect(await screen.findByTestId('data-pane')).toHaveAttribute('data-path', 'moons.csv');
    expect(opened).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'Open as Text' }));
    expect(opened).toEqual([{ path: 'moons.csv' }]);
    vi.unstubAllGlobals();
  });

  it('opens the DuckDB console in the page, with no notebook open for the app (#679)', async () => {
    const states: Record<string, unknown>[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        state: { postMessage: (m: Record<string, unknown>) => states.push(m) },
      },
    });
    mocks.controller = { dirty: false, save: vi.fn(async () => true), kernelName: 'python3' };
    const fake = fakeServices({
      '': [{ name: 'moons', type: 'directory' }],
      moons: [{ name: 'Io.ipynb', type: 'notebook' }],
    });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=moons/Io.ipynb');
    render(<App />);
    await screen.findByTestId('pane');
    await waitFor(() => expect(states.at(-1)).toMatchObject({ path: 'moons/Io.ipynb' }));

    expect(await window.ganymede!.command('new-duckdb-console', '/moons/')).toBe(true);
    // In the notebook's place, for the folder as the app gave it.
    expect(await screen.findByTestId('duck-console')).toHaveAttribute('data-folder', 'moons');
    expect(screen.queryByTestId('pane')).toBeNull();
    // The app's state has no path, so its notebook menus disable.
    await waitFor(() => expect(states.at(-1)).toMatchObject({ path: null }));

    // The app's close closes it; opening anything else does too.
    expect(await window.ganymede!.command('close')).toBe(true);
    await waitFor(() => expect(screen.queryByTestId('duck-console')).toBeNull());
    expect(await window.ganymede!.command('new-duckdb-console', '')).toBe(true);
    expect(await screen.findByTestId('duck-console')).toHaveAttribute('data-folder', '');
    await userEvent.click(screen.getByRole('button', { name: 'Open exported' }));
    await waitFor(() => expect(screen.queryByTestId('duck-console')).toBeNull());
    expect(await screen.findByTestId('pane')).toHaveTextContent('duckdb-console.ipynb');
    vi.unstubAllGlobals();
  });

  it('opens a fresh DuckDB console each time, and keeps one through a move of its folder (#679)', async () => {
    vi.stubGlobal('webkit', {
      messageHandlers: { state: { postMessage: () => {} }, openFile: { postMessage: () => {} } },
    });
    const fake = fakeServices({ '': [{ name: 'moons', type: 'directory' }], moons: [] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&chrome=native');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    const console = () => screen.getByTestId('duck-console');

    expect(await window.ganymede!.command('new-duckdb-console', 'moons/inner')).toBe(true);
    await screen.findByTestId('duck-console');
    const first = console().dataset.mount;
    // New DuckDB Console on the same folder is a new console.
    expect(await window.ganymede!.command('new-duckdb-console', 'moons/inner')).toBe(true);
    await waitFor(() => expect(console().dataset.mount).not.toBe(first));
    const second = console().dataset.mount;

    // A rename of a folder it's in moves it, and keeps it.
    const move = { from: 'moons', to: 'satellites' };
    expect(await window.ganymede!.command('file-moved', JSON.stringify(move))).toBe(true);
    await waitFor(() => expect(console()).toHaveAttribute('data-folder', 'satellites/inner'));
    expect(console().dataset.mount).toBe(second);
    // Others leave it.
    const other = { from: 'mo', to: 'x' };
    expect(await window.ganymede!.command('file-moved', JSON.stringify(other))).toBe(true);
    expect(console()).toHaveAttribute('data-folder', 'satellites/inner');
    // A delete of it closes it.
    const gone = { from: 'satellites', to: null };
    expect(await window.ganymede!.command('file-moved', JSON.stringify(gone))).toBe(true);
    await waitFor(() => expect(screen.queryByTestId('duck-console')).toBeNull());
    vi.unstubAllGlobals();
  });

  describe('DuckDB console tabs (#729)', () => {
    type Posted = Record<string, unknown>;
    const stubApp = (tabs: boolean) => {
      const opened: Posted[] = [];
      const states: Posted[] = [];
      vi.stubGlobal('webkit', {
        messageHandlers: {
          state: { postMessage: (m: Posted) => states.push(m) },
          openFile: { postMessage: () => {} },
          ...(tabs ? { openTab: { postMessage: (m: Posted) => opened.push(m) } } : {}),
        },
      });
      return { opened, states };
    };
    const connectTo = () => {
      const fake = fakeServices({
        '': [{ name: 'moons', type: 'directory' }],
        moons: [{ name: 'Io.ipynb', type: 'notebook' }],
      });
      mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    };

    it('asks the app for a console tab and leaves the notebook open', async () => {
      const { opened } = stubApp(true);
      mocks.controller = { dirty: false, save: vi.fn(async () => true), kernelName: 'python3' };
      connectTo();
      history.replaceState(null, '', '/?kernels=server&chrome=native&open=moons/Io.ipynb');
      render(<App />);
      await screen.findByTestId('pane');

      expect(await window.ganymede!.command('new-duckdb-console', '/moons/')).toBe(true);
      expect(opened).toEqual([{ console: 'duckdb', folder: 'moons' }]);
      // The notebook stays; nothing replaced it.
      expect(screen.getByTestId('pane')).toHaveTextContent('moons/Io.ipynb');
      expect(screen.queryByTestId('duck-console')).toBeNull();
      // Every call is another request, and so another console.
      expect(await window.ganymede!.command('new-duckdb-console', '')).toBe(true);
      expect(opened.at(-1)).toEqual({ console: 'duckdb', folder: '' });
      expect(opened).toHaveLength(2);
      vi.unstubAllGlobals();
    });

    it('shows the console for the launch folder, and opens notebooks in other tabs', async () => {
      const { opened, states } = stubApp(true);
      connectTo();
      history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
      render(<App />);

      expect(await screen.findByTestId('duck-console')).toHaveAttribute('data-folder', 'moons');
      // The app's state has no notebook, so its inspector and menus stand down.
      await waitFor(() => expect(states.at(-1)).toMatchObject({ path: null }));
      // A reload keeps the console: the parameter stays in the URL.
      expect(window.location.search).toContain('console=duckdb');
      expect(window.location.search).toContain('dir=moons');

      // The console's own open action, and the app's sidebar.
      await userEvent.click(screen.getByRole('button', { name: 'Open exported' }));
      expect(opened).toEqual([{ path: 'duckdb-console.ipynb' }]);
      expect(await window.ganymede!.command('open', 'moons/Io.ipynb')).toBe(true);
      expect(opened.at(-1)).toEqual({ path: 'moons/Io.ipynb' });
      // The console keeps running: still there, the same one, nothing opened in the page.
      expect(screen.getByTestId('duck-console')).toHaveAttribute('data-mount');
      expect(screen.queryByTestId('pane')).toBeNull();
      // Its tab closes with the window, not through the page.
      expect(await window.ganymede!.command('close')).toBe(false);
      expect(screen.getByTestId('duck-console')).toBeInTheDocument();
      // New DuckDB Console from the page is another tab.
      expect(await window.ganymede!.command('new-duckdb-console', 'moons')).toBe(true);
      expect(opened.at(-1)).toEqual({ console: 'duckdb', folder: 'moons' });
      expect(screen.getAllByTestId('duck-console')).toHaveLength(1);
      vi.unstubAllGlobals();
    });

    it('opens new and example notebooks in tabs from a console tab', async () => {
      const { opened } = stubApp(true);
      const fake = fakeServices({ '': [{ name: 'moons', type: 'directory' }], moons: [] });
      fake.contents.newUntitled.mockResolvedValue(
        entry({ name: 'Untitled.ipynb', path: 'moons/Untitled.ipynb', type: 'notebook' }),
      );
      fake.contents.get.mockImplementation(async (path: string) =>
        path.endsWith('.ipynb')
          ? entry({ name: path, type: 'notebook', content: { metadata: {}, cells: [] } })
          : entry({ name: '', path: '', type: 'directory', content: [] }),
      );
      mocks.connect.mockResolvedValue(fakeBackend(fake.services));
      mocks.copyExamples = async () => 'moons/Examples/Intro.ipynb';
      history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
      render(<App />);
      await screen.findByTestId('duck-console');

      expect(await window.ganymede!.command('new-notebook', 'moons')).toBe(true);
      expect(opened).toHaveLength(1);
      expect(opened[0]).toMatchObject({
        path: expect.stringMatching(/^moons\/Untitled.*\.ipynb$/),
      });
      expect(await window.ganymede!.command('open-examples', 'moons')).toBe(true);
      expect(opened).toHaveLength(2);
      expect(opened[1]).toEqual({ path: 'moons/Examples/Intro.ipynb' });
      // The console stayed, and the URL never gained an `open`.
      expect(screen.getByTestId('duck-console')).toBeInTheDocument();
      expect(screen.queryByTestId('pane')).toBeNull();
      expect(window.location.search).not.toContain('open=');
      vi.unstubAllGlobals();
    });

    it('opens a notebook dropped on a console tab in a tab of its own', async () => {
      const { opened } = stubApp(true);
      connectTo();
      history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
      const { container } = render(<App />);
      await screen.findByTestId('duck-console');

      const notebook = new File([JSON.stringify({ nbformat: 4, cells: [] })], 'Callisto.ipynb');
      fireEvent.drop(container.querySelector('.content')!, {
        dataTransfer: { types: ['Files'], files: [notebook] },
      });
      await waitFor(() => expect(opened).toEqual([{ path: 'moons/Callisto.ipynb' }]));
      expect(screen.getByTestId('duck-console')).toBeInTheDocument();
      expect(screen.queryByTestId('pane')).toBeNull();
      expect(window.location.search).not.toContain('open=');
      vi.unstubAllGlobals();
    });

    it('opens the sample from a console tab’s start screen in a tab of its own', async () => {
      const { opened } = stubApp(true);
      connectTo();
      history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
      render(<App />);
      await screen.findByTestId('duck-console');
      // The console closes with its folder, leaving the start screen.
      const gone = { from: 'moons', to: null };
      expect(await window.ganymede!.command('file-moved', JSON.stringify(gone))).toBe(true);
      await waitFor(() => expect(screen.queryByTestId('duck-console')).toBeNull());

      await userEvent.click(await screen.findByRole('button', { name: /Open Sample Notebook/ }));
      await waitFor(() => expect(opened).toEqual([{ path: 'moons/Ganymede Tour.ipynb' }]));
      expect(screen.queryByTestId('pane')).toBeNull();
      expect(window.location.search).not.toContain('open=');
      vi.unstubAllGlobals();
    });

    it('shows no console on a second backend picked after a console launch', async () => {
      stubApp(true);
      const fake = fakeServices({ '': [] });
      Object.assign(fake.services, { dispose: vi.fn() });
      mocks.connect.mockResolvedValue(fakeBackend(fake.services));
      history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
      render(<App />);
      expect(await screen.findByTestId('duck-console')).toHaveAttribute('data-folder', 'moons');

      expect(await window.ganymede!.command('connect')).toBe(true);
      await userEvent.click(await screen.findByRole('radio', { name: /This browser/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
      await waitFor(() => expect(screen.queryByTestId('duck-console')).toBeNull());
      // Not back after the second connection has settled.
      await new Promise(r => setTimeout(r, 50));
      expect(screen.queryByTestId('duck-console')).toBeNull();
      vi.unstubAllGlobals();
    });

    describe('names and recent consoles (#735)', () => {
      const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
      const backendFor = (fake: ReturnType<typeof fakeServices>) => {
        const b = fakeBackend(fake.services);
        mocks.connect.mockResolvedValue(b);
        return recentsKey(b.config);
      };
      const fakeMoons = () =>
        fakeServices({
          '': [{ name: 'moons', type: 'directory' }],
          moons: [{ name: 'Io.ipynb', type: 'notebook' }],
        });
      const rec = (id: string, name: string, folder: string, used: number) => ({
        id,
        name,
        folder,
        statements: ['select 1'],
        used,
      });

      it('shows a tab’s own console: its session, a default name, reported to the app', async () => {
        const { states } = stubApp(true);
        const key = backendFor(fakeMoons());
        saveConsole(key, rec('other', 'Console 1', 'x', 1));
        history.replaceState(
          null,
          '',
          `/?kernels=server&chrome=native&dir=moons&console=duckdb&session=${ID.toUpperCase()}`,
        );
        render(<App />);
        const shown = await screen.findByTestId('duck-console');
        expect(shown).toHaveAttribute('data-id', ID);
        // The lowest default name no console of this server has.
        expect(shown).toHaveAttribute('data-name', 'Console 2');
        await waitFor(() => expect(states.at(-1)?.console).toEqual({ id: ID, name: 'Console 2' }));
        // A reload keeps the session, as the app wrote it.
        expect(window.location.search).toContain(`session=${ID.toUpperCase()}`);
        vi.unstubAllGlobals();
      });

      it('restores a tab as the same record: its name and folder', async () => {
        stubApp(true);
        const key = backendFor(fakeMoons());
        saveConsole(key, rec(ID, 'Orbits', 'moons/inner', 1));
        history.replaceState(
          null,
          '',
          `/?kernels=server&chrome=native&dir=moons&console=duckdb&session=${ID}`,
        );
        render(<App />);
        const shown = await screen.findByTestId('duck-console');
        expect(shown).toHaveAttribute('data-name', 'Orbits');
        expect(shown).toHaveAttribute('data-folder', 'moons/inner');
        vi.unstubAllGlobals();
      });

      it('renames the console with the rename command, in the app’s state and the record', async () => {
        const { states } = stubApp(true);
        const key = backendFor(fakeMoons());
        saveConsole(key, rec(ID, 'Console 1', 'moons', 1));
        history.replaceState(
          null,
          '',
          `/?kernels=server&chrome=native&dir=moons&console=duckdb&session=${ID}`,
        );
        render(<App />);
        await screen.findByTestId('duck-console');
        expect(await window.ganymede!.command('rename', '  ')).toBe(false);
        expect(await window.ganymede!.command('rename', 'Orbits')).toBe(true);
        await waitFor(() => expect(states.at(-1)?.console).toEqual({ id: ID, name: 'Orbits' }));
        expect(screen.getByTestId('duck-console')).toHaveAttribute('data-name', 'Orbits');
        expect(loadConsoles(key)[0]).toMatchObject({ id: ID, name: 'Orbits', folder: 'moons' });
        // The console's own header rename takes the same way.
        await userEvent.click(screen.getByRole('button', { name: 'Rename console' }));
        await waitFor(() =>
          expect(screen.getByTestId('duck-console')).toHaveAttribute('data-name', 'Renamed'),
        );
        vi.unstubAllGlobals();
      });

      it('lists recent consoles to the app and opens one as a tab with its session', async () => {
        const { opened, states } = stubApp(true);
        const key = backendFor(fakeMoons());
        saveConsole(key, rec('old', 'Old', '', 1));
        saveConsole(key, rec('past', 'Past', 'moons', 2));
        history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
        render(<App />);
        await screen.findByTestId('duck-console');
        await waitFor(() =>
          expect(states.at(-1)?.consoles).toEqual([
            { id: 'past', name: 'Past', folder: 'moons' },
            { id: 'old', name: 'Old', folder: '' },
          ]),
        );
        expect(await window.ganymede!.command('open-console', 'past')).toBe(true);
        expect(opened).toEqual([{ console: 'duckdb', folder: 'moons', session: 'past' }]);
        // From the console's own menu too; an unknown one is refused.
        await userEvent.click(screen.getByRole('button', { name: 'Open past' }));
        expect(opened).toHaveLength(2);
        expect(await window.ganymede!.command('open-console', 'nope')).toBe(false);
        expect(opened).toHaveLength(2);
        // The tab itself stays.
        expect(screen.getByTestId('duck-console')).toBeInTheDocument();
        expect(await window.ganymede!.command('clear-recent-consoles')).toBe(true);
        expect(loadConsoles(key)).toEqual([]);
        await waitFor(() => expect(states.at(-1)?.consoles).toEqual([]));
        vi.unstubAllGlobals();
      });

      it('opens a recent console in the page, a fresh engine on its folder, without a second copy', async () => {
        stubApp(false);
        mocks.controller = { dirty: false, save: vi.fn(async () => true), kernelName: 'python3' };
        const key = backendFor(fakeMoons());
        saveConsole(key, rec('past', 'Past', 'moons', 2));
        history.replaceState(null, '', '/?kernels=server&chrome=native&open=moons/Io.ipynb');
        render(<App />);
        await screen.findByTestId('pane');
        expect(await window.ganymede!.command('open-console', 'past')).toBe(true);
        const shown = await screen.findByTestId('duck-console');
        expect(shown).toHaveAttribute('data-id', 'past');
        expect(shown).toHaveAttribute('data-name', 'Past');
        expect(shown).toHaveAttribute('data-folder', 'moons');
        expect(screen.queryByTestId('pane')).toBeNull();
        // Already shown: it stays, the same engine.
        const mount = shown.dataset.mount;
        expect(await window.ganymede!.command('open-console', 'past')).toBe(true);
        await act(() => new Promise(r => setTimeout(r, 50)));
        expect(screen.getByTestId('duck-console').dataset.mount).toBe(mount);
        // A new console is a new record with the next name.
        expect(await window.ganymede!.command('new-duckdb-console', 'moons')).toBe(true);
        await waitFor(() =>
          expect(screen.getByTestId('duck-console')).not.toHaveAttribute('data-id', 'past'),
        );
        expect(screen.getByTestId('duck-console')).toHaveAttribute('data-name', 'Console 1');
        vi.unstubAllGlobals();
      });

      it('gives two consoles shown before either ran anything their own names', async () => {
        stubApp(false);
        backendFor(fakeMoons());
        history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
        render(<App />);
        const first = await screen.findByTestId('duck-console');
        expect(first).toHaveAttribute('data-name', 'Console 1');
        expect(await window.ganymede!.command('new-duckdb-console', 'moons')).toBe(true);
        await waitFor(() =>
          expect(screen.getByTestId('duck-console')).toHaveAttribute('data-name', 'Console 2'),
        );
        vi.unstubAllGlobals();
      });

      it('reserves a new console’s name on its folder', async () => {
        stubApp(false);
        const key = backendFor(fakeMoons());
        history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
        render(<App />);
        await screen.findByTestId('duck-console');
        expect(await window.ganymede!.command('new-duckdb-console', 'moons/inner')).toBe(true);
        await waitFor(() =>
          expect(screen.getByTestId('duck-console')).toHaveAttribute('data-folder', 'moons/inner'),
        );
        expect(loadConsoles(key).find(r => r.name === 'Console 2')?.folder).toBe('moons/inner');
        vi.unstubAllGlobals();
      });

      it('leaves the console shown out of the palette’s recent consoles', async () => {
        stubApp(false);
        const key = backendFor(fakeMoons());
        saveConsole(key, rec('past', 'Past', 'moons', 2));
        saveConsole(key, rec('other', 'Other', '', 1));
        history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
        render(<App />);
        await screen.findByTestId('duck-console');
        expect(await window.ganymede!.command('open-console', 'past')).toBe(true);
        await waitFor(() =>
          expect(screen.getByTestId('duck-console')).toHaveAttribute('data-id', 'past'),
        );
        expect(await window.ganymede!.command('command-palette')).toBe(true);
        const palette = await screen.findByRole('dialog', { name: 'Command palette' });
        expect(within(palette).getByText('Open Recent Console: Other')).toBeInTheDocument();
        expect(within(palette).queryByText('Open Recent Console: Past')).toBeNull();
        vi.unstubAllGlobals();
      });

      it('lists recent consoles to the app only with the app’s own chrome', async () => {
        const { states } = stubApp(true);
        const key = backendFor(fakeMoons());
        saveConsole(key, rec('past', 'Past', 'moons', 2));
        history.replaceState(null, '', '/?kernels=server&dir=moons&console=duckdb');
        render(<App />);
        await screen.findByTestId('duck-console');
        await waitFor(() => expect(states.at(-1)?.console).not.toBeNull());
        expect(states.every(st => (st.consoles as unknown[]).length === 0)).toBe(true);
        vi.unstubAllGlobals();
      });

      it('moves a console’s record with its folder, and drops it when the folder is deleted', async () => {
        stubApp(true);
        const key = backendFor(fakeMoons());
        saveConsole(key, rec('a', 'A', 'moons/inner', 2));
        saveConsole(key, rec('b', 'B', 'other', 1));
        history.replaceState(null, '', '/?kernels=server&chrome=native&dir=moons&console=duckdb');
        render(<App />);
        await screen.findByTestId('duck-console');
        const move = (from: string, to: string | null) =>
          window.ganymede!.command('file-moved', JSON.stringify({ from, to }));
        expect(await move('moons', 'planets')).toBe(true);
        const mine = () => loadConsoles(key).filter(r => r.id === 'a' || r.id === 'b');
        expect(mine().map(r => [r.id, r.folder])).toEqual([
          ['a', 'planets/inner'],
          ['b', 'other'],
        ]);
        expect(await move('planets', null)).toBe(true);
        expect(mine().map(r => r.id)).toEqual(['b']);
        vi.unstubAllGlobals();
      });
    });

    it('is unchanged without an openTab handler: in the page, as before', async () => {
      stubApp(false);
      mocks.controller = { dirty: false, save: vi.fn(async () => true), kernelName: 'python3' };
      connectTo();
      history.replaceState(null, '', '/?kernels=server&chrome=native&open=moons/Io.ipynb');
      render(<App />);
      await screen.findByTestId('pane');

      expect(await window.ganymede!.command('new-duckdb-console', 'moons')).toBe(true);
      expect(await screen.findByTestId('duck-console')).toHaveAttribute('data-folder', 'moons');
      expect(screen.queryByTestId('pane')).toBeNull();
      // Its export opens in the page, closing it.
      await userEvent.click(screen.getByRole('button', { name: 'Open exported' }));
      expect(await screen.findByTestId('pane')).toHaveTextContent('duckdb-console.ipynb');
      expect(screen.queryByTestId('duck-console')).toBeNull();
      vi.unstubAllGlobals();
    });

    it('opens a notebook over a launch console in the page when the app has no tabs', async () => {
      stubApp(false);
      connectTo();
      history.replaceState(null, '', '/?kernels=server&dir=moons&console=duckdb');
      render(<App />);
      await screen.findByTestId('duck-console');
      await userEvent.click(screen.getByRole('button', { name: 'Open exported' }));
      expect(await screen.findByTestId('pane')).toBeInTheDocument();
      expect(screen.queryByTestId('duck-console')).toBeNull();
      vi.unstubAllGlobals();
    });
  });

  it('follows a rename of the DuckDB console’s folder from the page’s own sidebar, and closes on its delete (#679)', async () => {
    const fake = fakeServices({ '': [{ name: 'moons', type: 'directory' }], moons: [] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('new-duckdb-console', 'moons')).toBe(true);
    const console = () => screen.getByTestId('duck-console');
    await screen.findByTestId('duck-console');
    const mount = console().dataset.mount;

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for moons' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }));
    const field = screen.getByRole('textbox', { name: 'New name for moons' });
    await userEvent.clear(field);
    await userEvent.type(field, 'satellites{Enter}');
    await waitFor(() => expect(console()).toHaveAttribute('data-folder', 'satellites'));
    expect(console().dataset.mount).toBe(mount);

    // The fake's listing still shows moons: a console there, then its delete.
    Object.assign(fake.services.contents, { delete: vi.fn(async () => {}) });
    expect(await window.ganymede!.command('new-duckdb-console', 'moons')).toBe(true);
    await waitFor(() => expect(console()).toHaveAttribute('data-folder', 'moons'));
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Actions for moons' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    await waitFor(() => expect(screen.queryByTestId('duck-console')).toBeNull());
    confirm.mockRestore();
  });

  it('keeps the DuckDB console open when deleting its folder fails (#679)', async () => {
    const fake = fakeServices({ '': [{ name: 'moons', type: 'directory' }], moons: [] });
    const remove = vi.fn(async () => {
      throw new Error('Forbidden');
    });
    Object.assign(fake.services.contents, { delete: remove });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('new-duckdb-console', 'moons')).toBe(true);
    const mount = (await screen.findByTestId('duck-console')).dataset.mount;

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await userEvent.click(await screen.findByRole('button', { name: 'Actions for moons' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('moons'));
    // The failure is reported, and nothing was deleted: the same console, in the same folder.
    expect(await screen.findByText(/Forbidden/)).toBeInTheDocument();
    expect(screen.getByTestId('duck-console')).toHaveAttribute('data-folder', 'moons');
    expect(screen.getByTestId('duck-console').dataset.mount).toBe(mount);
    confirm.mockRestore();
  });

  it('closes the DuckDB console when the server changes, since its folder was the old one’s (#679)', async () => {
    const fake = fakeServices({ '': [] });
    Object.assign(fake.services, { dispose: vi.fn() });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server');
    render(<App />);
    await waitFor(() => expect(window.ganymede).toBeDefined());
    expect(await window.ganymede!.command('new-duckdb-console', 'moons')).toBe(true);
    expect(await screen.findByTestId('duck-console')).toHaveAttribute('data-folder', 'moons');

    expect(await window.ganymede!.command('connect')).toBe(true);
    await userEvent.click(await screen.findByRole('radio', { name: /This browser/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
    await waitFor(() => expect(screen.queryByTestId('duck-console')).toBeNull());
  });

  describe('switching backends with unsaved edits (#792)', () => {
    /** Opens Orbits on a fake server, with the stand-in controller `controller`. */
    const openOnServer = async (controller: NonNullable<typeof mocks.controller>) => {
      mocks.controller = controller;
      const first = fakeServices({ '': [], work: [{ name: 'Orbits.ipynb', type: 'notebook' }] });
      const dispose = vi.fn();
      Object.assign(first.services, { dispose });
      const second = fakeServices({ '': [] });
      mocks.connect
        .mockResolvedValueOnce(fakeBackend(first.services))
        .mockResolvedValue(fakeBackend(second.services, { kind: 'browser' }));
      history.replaceState(null, '', '/?kernels=server&open=work/Orbits.ipynb');
      render(<App />);
      expect(await screen.findByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');
      expect(await window.ganymede!.command('connect')).toBe(true);
      await userEvent.click(await screen.findByRole('radio', { name: /This browser/ }));
      return { dispose };
    };

    it('saves the open notebook first, and connects once it is saved', async () => {
      let saved!: (ok: boolean) => void;
      const save = vi.fn(() => new Promise<boolean>(r => (saved = r)));
      await openOnServer({ dirty: true, save });
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

      expect(save).toHaveBeenCalledTimes(1);
      // Still on the first backend, with the notebook open, while it saves.
      expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
      expect(mocks.connect).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('pane')).toBeInTheDocument();

      await act(async () => saved(true));
      await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
      await waitFor(() => expect(screen.queryByTestId('pane')).toBeNull());
      // The sheet opened again asks nothing, and connects.
      expect(await window.ganymede!.command('connect')).toBe(true);
      expect(await screen.findByRole('button', { name: 'Connect' })).toBeEnabled();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('connects at once when nothing is unsaved', async () => {
      const save = vi.fn(async () => true);
      await openOnServer({ dirty: false, save });
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
      expect(save).not.toHaveBeenCalled();
    });

    it('blocks the switch when the save fails, and keeps editing on Keep Editing', async () => {
      const save = vi.fn(async () => false);
      await openOnServer({ dirty: true, save, download: vi.fn(), discard: vi.fn() });
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Couldn’t save “Orbits.ipynb”');
      expect(mocks.connect).toHaveBeenCalledTimes(1);
      await userEvent.click(within(alert).getByRole('button', { name: 'Keep Editing' }));

      expect(screen.queryByText('Where should kernels run?')).toBeNull();
      expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');
      expect(mocks.connect).toHaveBeenCalledTimes(1);
      expect(mocks.controller!.discard).not.toHaveBeenCalled();
    });

    it('downloads a copy, then switches without saving when asked', async () => {
      const save = vi.fn(async () => false);
      const download = vi.fn();
      const undo = vi.fn();
      const discard = vi.fn(() => undo);
      await openOnServer({ dirty: true, save, download, discard });
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));

      const alert = await screen.findByRole('alert');
      await userEvent.click(within(alert).getByRole('button', { name: 'Download a Copy' }));
      expect(download).toHaveBeenCalledTimes(1);
      // Still asking: a copy saved is not a choice to switch.
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mocks.connect).toHaveBeenCalledTimes(1);

      await userEvent.click(within(alert).getByRole('button', { name: 'Switch Without Saving' }));
      expect(discard).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
      await waitFor(() => expect(screen.queryByTestId('pane')).toBeNull());
      expect(undo).not.toHaveBeenCalled();
      // The sheet opened again asks nothing, and connects.
      expect(await window.ganymede!.command('connect')).toBe(true);
      expect(await screen.findByRole('button', { name: 'Connect' })).toBeEnabled();
      expect(screen.queryByRole('alert')).toBeNull();
    });

    it('stops the saves of the pane’s controller even after the pane rebuilt it', async () => {
      const discard = vi.fn(() => () => {});
      await openOnServer({
        dirty: true,
        save: vi.fn(async () => false),
        download: vi.fn(),
        discard,
      });
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
      const alert = await screen.findByRole('alert');
      // The kernel went idle, say: the pane hands over a new controller.
      const rebuilt = vi.fn(() => () => {});
      act(() =>
        mocks.onController!({
          ...mocks.controller,
          name: 'Orbits.ipynb',
          path: 'work/Orbits.ipynb',
          status: 'idle',
          trusted: true,
          hostWants: () => [],
          recordedParams: () => '{}',
          discard: rebuilt,
        }),
      );
      await userEvent.click(within(alert).getByRole('button', { name: 'Switch Without Saving' }));
      // The one the save failed on: the pane's controllers share what it sets.
      expect(discard).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
    });

    it('drops a switch cancelled while the notebook saves', async () => {
      let saved!: (ok: boolean) => void;
      const save = vi.fn(() => new Promise<boolean>(r => (saved = r)));
      await openOnServer({ dirty: true, save });
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await screen.findByRole('button', { name: 'Saving…' });
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await act(async () => saved(true));
      expect(screen.queryByText('Where should kernels run?')).toBeNull();
      expect(mocks.connect).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('pane')).toBeInTheDocument();
      // The sheet opened again connects, not still saving.
      expect(await window.ganymede!.command('connect')).toBe(true);
      expect(await screen.findByRole('button', { name: 'Connect' })).toBeEnabled();
    });

    it('stops the switch with the choice when the save doesn’t answer in time', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const save = vi.fn(() => new Promise<boolean>(() => {}));
        await openOnServer({ dirty: true, save, download: vi.fn(), discard: vi.fn() });
        await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await screen.findByRole('button', { name: 'Saving…' });

        // Real time passes too (`shouldAdvanceTime`): well short of the limit.
        await act(async () => vi.advanceTimersByTime(SERVER_TIMEOUT_MS - 10_000));
        expect(screen.queryByRole('alert')).toBeNull();
        expect(screen.getByRole('button', { name: 'Saving…' })).toBeInTheDocument();
        await act(async () => vi.advanceTimersByTime(10_000));
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent('The server didn’t answer in time.');
        expect(alert).toHaveTextContent('Keep editing to try again.');
        expect(mocks.connect).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('connects without saving when the notebook’s pane is gone (a data file is open)', async () => {
      const save = vi.fn(async () => true);
      mocks.controller = { dirty: true, save };
      const first = fakeServices({
        '': [],
        work: [
          { name: 'Orbits.ipynb', type: 'notebook' },
          { name: 'moons.csv', type: 'file' },
        ],
      });
      Object.assign(first.services, { dispose: vi.fn() });
      mocks.connect
        .mockResolvedValueOnce(fakeBackend(first.services))
        .mockResolvedValue(fakeBackend(fakeServices({ '': [] }).services, { kind: 'browser' }));
      history.replaceState(null, '', '/?kernels=server&open=work/Orbits.ipynb');
      render(<App />);
      expect(await screen.findByTestId('pane')).toBeInTheDocument();
      // The data view takes the notebook's place (which saves the dirty
      // notebook first under #808); its stale controller stays behind, so
      // switching backends afterwards must not save it again.
      expect(await window.ganymede!.command('open', 'work/moons.csv')).toBe(true);
      expect(await screen.findByTestId('data-pane')).toBeInTheDocument();
      save.mockClear();

      expect(await window.ganymede!.command('connect')).toBe(true);
      await userEvent.click(await screen.findByRole('radio', { name: /This browser/ }));
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
      expect(save).not.toHaveBeenCalled();
    });

    it('keeps the live backend through StrictMode and unmount', async () => {
      // A backend for each connect: StrictMode's first one is dropped (and disposed).
      const disposes: ReturnType<typeof vi.fn>[] = [];
      mocks.connect.mockImplementation(async () => {
        const fake = fakeServices({ '': [] });
        const dispose = vi.fn();
        disposes.push(dispose);
        Object.assign(fake.services, { dispose });
        return fakeBackend(fake.services);
      });
      history.replaceState(null, '', '/?kernels=server');
      const { unmount } = render(
        <StrictMode>
          <App />
        </StrictMode>,
      );
      await waitFor(() => expect(window.ganymede).toBeDefined());
      await waitFor(() => expect(screen.queryByText('Where should kernels run?')).toBeNull());
      const live = disposes.at(-1)!;
      await act(async () => new Promise(r => setTimeout(r, 10)));
      expect(live).not.toHaveBeenCalled();
      unmount();
      // Past the settling of any pending saves, which comes before a dispose.
      await act(async () => new Promise(r => setTimeout(r, 10)));
      expect(live).not.toHaveBeenCalled();
    });

    it('disposes the old backend only once the closed notebook’s last save is done', async () => {
      const { dispose } = await openOnServer({ dirty: false, save: vi.fn(async () => true) });
      // The pane's teardown save, still going (the real pane hands it off).
      let lastSave!: (failed: string | undefined) => void;
      handOff('work/Orbits.ipynb', new Promise(r => (lastSave = r)));
      await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
      await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
      await waitFor(() => expect(screen.queryByText('Where should kernels run?')).toBeNull());

      expect(dispose).not.toHaveBeenCalled();
      await act(async () => lastSave(undefined));
      await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
    });

    it('disposes the old backend after SERVER_TIMEOUT_MS when a last save never ends', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let lastSave!: (failed: string | undefined) => void;
      try {
        const { dispose } = await openOnServer({ dirty: false, save: vi.fn(async () => true) });
        handOff('work/Orbits.ipynb', new Promise(r => (lastSave = r)));
        await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
        await waitFor(() => expect(mocks.connect).toHaveBeenLastCalledWith({ kind: 'browser' }));
        await waitFor(() => expect(screen.queryByText('Where should kernels run?')).toBeNull());

        // Real time passes too (`shouldAdvanceTime`): well short of the limit.
        await act(async () => vi.advanceTimersByTime(SERVER_TIMEOUT_MS - 10_000));
        expect(dispose).not.toHaveBeenCalled();
        await act(async () => vi.advanceTimersByTime(10_000));
        await waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
      } finally {
        vi.useRealTimers();
        // Out of the pending saves, for the tests after this one.
        lastSave(undefined);
      }
    });
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

  it('moves the view a person chose with the notebook on a rename, and drops it on a delete (#184)', async () => {
    history.replaceState(null, '', '/?kernels=server&open=work%2FOrbits.ipynb');
    const fake = fakeServices({
      '': [{ name: 'work', type: 'directory' }],
      work: [{ name: 'Orbits.ipynb', type: 'notebook' }],
    });
    const backend = fakeBackend(fake.services);
    mocks.connect.mockResolvedValue(backend);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb'));
    const server = recentsKey(backend.config);
    chooseView(server, 'work/Orbits.ipynb', false);
    chooseView('another server', 'work/Orbits.ipynb', true);
    const place = { cell: 'c1', offset: 4, cells: 3 };
    savePosition(server, 'work/Orbits.ipynb', place);
    act(() => mocks.onRenamed!('work/Orbits.ipynb', 'work/Kepler.ipynb'));
    expect(readPosition(server, 'work/Kepler.ipynb')).toEqual(place);
    expect(readPosition(server, 'work/Orbits.ipynb')).toBeUndefined();
    forgetPositions();
    expect(chosenView(server, 'work/Orbits.ipynb')).toBeUndefined();
    expect(chosenView(server, 'work/Kepler.ipynb')).toBe(false);
    // Only this server's choices move.
    expect(chosenView('another server', 'work/Orbits.ipynb')).toBe(true);
    forgetChosenViews();
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

    await userEvent.click(await screen.findByRole('button', { name: 'Connect to a Server…' }));
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
    await userEvent.click(await screen.findByRole('button', { name: 'Connect to a Server…' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('The server refused the token.')).toBeInTheDocument();
    expect(localStorage.getItem('ganymede-ui:backend')).toBeNull();
    // Cancel goes back to the start screen, which isn't "Connecting…".
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('The server refused the token.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try a Notebook' })).toBeInTheDocument();
    expect(screen.queryByText('Connecting…')).not.toBeInTheDocument();
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

  it("shows a machine window's place as a label, with no list of places (#773)", async () => {
    history.replaceState(null, '', '/?machine=mini-1&machine_name=m4mini');
    const fake = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    (fake.services as unknown as { serverSettings: unknown }).serverSettings =
      ServerConnection.makeSettings({
        baseUrl: 'http://127.0.0.1:1/machines/mini-1/',
        fetch: (async () => new Response('{}')) as unknown as typeof fetch,
      });
    mocks.connect.mockImplementation(async c => fakeBackend(fake.services, c));
    render(<App />);
    expect(
      await screen.findByRole('status', { name: /Place: m4mini, reachable/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Place: m4mini/ })).toBeNull();
    expect(screen.queryByRole('menuitemradio')).toBeNull();
  });
});

describe('App start screen (#815)', () => {
  const browser: BackendConfig = { kind: 'browser' };
  const tryNotebook = async () =>
    userEvent.click(await screen.findByRole('button', { name: 'Try a Notebook' }));
  const saved = (fake: ReturnType<typeof fakeServices>) =>
    fake.contents.save.mock.calls.map(([path]) => path);
  /** Runs the palette command that matches `query`. */
  async function openPalette(query: string) {
    fireEvent.keyDown(window, {
      key: 'P',
      code: 'KeyP',
      keyCode: 80,
      ctrlKey: true,
      shiftKey: true,
    });
    await screen.findByRole('dialog', { name: 'Command palette' });
    await userEvent.keyboard(`${query}{Enter}`);
  }
  beforeEach(() => {
    // Not what an earlier test left queued.
    mocks.connect.mockReset();
  });
  /** A connection the test settles by hand. */
  function deferred() {
    let resolve!: (b: Backend) => void;
    const promise = new Promise<Backend>(r => (resolve = r));
    return { promise, resolve };
  }

  it('Try a Notebook connects the browser backend, copies the sample and opens it', async () => {
    const fake = fakeServices({ '': [] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try a Notebook' }));

    await waitFor(() =>
      expect(screen.getByTestId('pane')).toHaveTextContent('Ganymede Tour.ipynb'),
    );
    expect(mocks.connect).toHaveBeenCalledWith(browser);
    expect(saved(fake)).toEqual(['Ganymede Tour.ipynb']);
    // The first cell is the one that runs.
    const nb = fake.contents.save.mock.calls[0][1] as { content: { cells: { source: string }[] } };
    expect(nb.content.cells[0].source).toMatch(/Shift-Enter/);
    // Remembered, so a reload comes back to the browser backend.
    expect(JSON.parse(localStorage.getItem('ganymede-ui:backend')!)).toEqual(browser);
    expect(screen.queryByText('Where should kernels run?')).not.toBeInTheDocument();
  });

  it('copies the sample once under StrictMode, whose first connection is cancelled', async () => {
    const fake = fakeServices({ '': [] });
    mocks.connect.mockImplementation(async () => fakeBackend(fake.services, browser));
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    await tryNotebook();
    await waitFor(() => expect(screen.getByTestId('pane')).toBeInTheDocument());
    expect(saved(fake)).toEqual(['Ganymede Tour.ipynb']);
  });

  it('keeps the start when the sheet is opened and cancelled while Try connects', async () => {
    const fake = fakeServices({ '': [] });
    const trying = deferred();
    mocks.connect.mockReturnValueOnce(trying.promise);
    render(<App />);
    await tryNotebook();
    // The palette can open the sheet meanwhile; it can't pick another backend.
    await openPalette('Connect to');
    const sheet = await screen.findByRole('dialog', { name: 'Where should kernels run?' });
    expect(within(sheet).getByRole('button', { name: 'Connecting…' })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole('button', { name: 'Cancel' }));
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    trying.resolve(fakeBackend(fake.services, browser));
    await waitFor(() =>
      expect(screen.getByTestId('pane')).toHaveTextContent('Ganymede Tour.ipynb'),
    );
    expect(saved(fake)).toEqual(['Ganymede Tour.ipynb']);
  });

  it('does not open the sample in a backend that replaced the one it was copied to', async () => {
    // The browser backend is replaced (the sheet, from the palette) while
    // the copy runs: the notebook isn't opened in the new one.
    const fake = fakeServices({ '': [] });
    let finish!: () => void;
    fake.contents.save.mockImplementation(
      path =>
        new Promise(resolve => (finish = () => resolve(entry({ name: path, type: 'notebook' })))),
    );
    const other = fakeServices({ '': [{ name: 'Io.ipynb', type: 'notebook' }] });
    Object.assign(fake.services, { dispose: vi.fn() });
    mocks.connect
      .mockResolvedValueOnce(fakeBackend(fake.services, browser))
      .mockResolvedValue(fakeBackend(other.services));
    render(<App />);
    await tryNotebook();
    await waitFor(() => expect(fake.contents.save).toHaveBeenCalled());
    await openPalette('Connect to');
    const sheet = await screen.findByRole('dialog', { name: 'Where should kernels run?' });
    await userEvent.click(within(sheet).getByRole('radio', { name: /Ganymede server/ }));
    await userEvent.click(within(sheet).getByRole('button', { name: 'Connect' }));
    await screen.findByText('Io');
    finish();
    await act(async () => {});
    expect(screen.queryByTestId('pane')).not.toBeInTheDocument();
  });

  it('shows a failed browser connection in the sheet, and a retry from it starts nothing', async () => {
    const fake = fakeServices({ '': [] });
    mocks.connect
      .mockRejectedValueOnce(new Error('IndexedDB is off.'))
      .mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    await tryNotebook();
    expect(await screen.findByText('IndexedDB is off.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Where should kernels run?' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByText('This browser');
    // The sample isn't copied by a later connection nobody asked it of.
    expect(saved(fake)).toEqual([]);
    expect(screen.queryByTestId('pane')).not.toBeInTheDocument();
  });

  it('Cancel after a failed Try goes back to the start screen, and Try works again', async () => {
    const fake = fakeServices({ '': [] });
    mocks.connect
      .mockRejectedValueOnce(new Error('IndexedDB is off.'))
      .mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    await tryNotebook();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await tryNotebook();
    await waitFor(() =>
      expect(screen.getByTestId('pane')).toHaveTextContent('Ganymede Tour.ipynb'),
    );
    expect(saved(fake)).toEqual(['Ganymede Tour.ipynb']);
  });

  it('says so when the sample can’t be copied', async () => {
    const fake = fakeServices({ '': [] });
    fake.contents.save.mockRejectedValue(new Error('Storage is full.'));
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    await tryNotebook();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t start with the sample notebook: Storage is full.');
    expect(screen.queryByTestId('pane')).not.toBeInTheDocument();
    // Still usable: the connected empty state.
    expect(screen.getAllByRole('button', { name: /New Notebook/ }).length).toBeGreaterThan(0);
  });

  it('Open a Notebook… saves the file in the browser and opens it', async () => {
    const fake = fakeServices({ '': [] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    const file = new File([JSON.stringify({ nbformat: 4, cells: [] })], 'Mine.ipynb');
    await userEvent.upload(await screen.findByLabelText('Notebook file'), file);
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('Mine.ipynb'));
    expect(mocks.connect).toHaveBeenCalledWith(browser);
    expect(saved(fake)).toEqual(['Mine.ipynb']);
  });

  it('Open a Notebook… with something else says so and connects nothing', async () => {
    render(<App />);
    const input = await screen.findByLabelText('Notebook file');
    await userEvent.upload(input, new File(['{"hello": 1}'], 'Mine.ipynb'));
    expect(await screen.findByRole('alert')).toHaveTextContent('no nbformat');
    await userEvent.upload(input, new File(['hello'], 'notes.txt'), { applyAccept: false });
    expect(await screen.findByRole('alert')).toHaveTextContent('notes.txt');
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Try a Notebook' })).toBeInTheDocument();
  });

  it('Open a Notebook… says so when the file can’t be saved', async () => {
    const fake = fakeServices({ '': [] });
    fake.contents.save.mockRejectedValue(new Error('Storage is full.'));
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    const file = new File([JSON.stringify({ nbformat: 4, cells: [] })], 'Mine.ipynb');
    await userEvent.upload(await screen.findByLabelText('Notebook file'), file);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Mine.ipynb');
    expect(alert).toHaveTextContent('Storage is full.');
    expect(screen.queryByTestId('pane')).not.toBeInTheDocument();
  });

  for (const how of ['Try', 'Open'] as const) {
    it(`${how} drops the launch file and console the link asked for`, async () => {
      // A link with no saved connection: its file and console are the
      // first backend's, not the browser's the start screen connects.
      history.replaceState(null, '', '/?open=Io.ipynb&console=duckdb&dir=data');
      const fake = fakeServices({ '': [] });
      let finish!: () => void;
      fake.contents.save.mockImplementation(
        path =>
          new Promise(resolve => (finish = () => resolve(entry({ name: path, type: 'notebook' })))),
      );
      mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
      render(<App />);
      if (how === 'Try') {
        await tryNotebook();
      } else {
        const file = new File([JSON.stringify({ nbformat: 4, cells: [] })], 'Mine.ipynb');
        await userEvent.upload(await screen.findByLabelText('Notebook file'), file);
      }
      await waitFor(() => expect(fake.contents.save).toHaveBeenCalled());
      // Connected, the copy still running: neither the link's file nor its console.
      expect(screen.queryByTestId('pane')).not.toBeInTheDocument();
      expect(screen.queryByTestId('duck-console')).not.toBeInTheDocument();
      finish();
      const name = how === 'Try' ? 'Ganymede Tour.ipynb' : 'Mine.ipynb';
      await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent(name));
    });
  }

  it('hides the notice until the open notebook’s own controller is in', async () => {
    // Between opening another notebook and its pane handing over its
    // controller, Download a Copy would download the previous one.
    const download = vi.fn();
    mocks.controller = { dirty: false, save: async () => true, download };
    const fake = fakeServices({
      '': [
        { name: 'Io.ipynb', type: 'notebook' },
        { name: 'Europa.ipynb', type: 'notebook' },
      ],
    });
    localStorage.setItem('ganymede-ui:backend', JSON.stringify(browser));
    history.replaceState(null, '', '/?open=Io.ipynb');
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    await screen.findByRole('note');
    // The next pane never reports a controller.
    mocks.controller = undefined;
    await userEvent.click(await screen.findByText('Europa'));
    await waitFor(() => expect(screen.getByTestId('pane')).toHaveTextContent('Europa.ipynb'));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows where browser work is kept above a notebook, and Download a Copy downloads it', async () => {
    const download = vi.fn();
    mocks.controller = { dirty: false, save: async () => true, download };
    const fake = fakeServices({ '': [] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    await tryNotebook();
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('Saved in this browser. Download a copy to keep it elsewhere.');
    await userEvent.click(within(note).getByRole('button', { name: 'Download a Copy' }));
    expect(download).toHaveBeenCalledOnce();
    await userEvent.click(within(note).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(localStorage.getItem('ganymede-ui:storage-notice')).toBe('dismissed');
  });

  it('shows no storage notice for a server, in the apps, or for a data file', async () => {
    mocks.controller = { dirty: false, save: async () => true, download: vi.fn() };
    const fake = fakeServices({ '': [] });
    history.replaceState(null, '', '/?token=abc&open=Io.ipynb');
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    const server = render(<App />);
    await screen.findByTestId('pane');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    server.unmount();

    // The Mac app, on its own server: browser kind is never used there, but
    // the page must not draw its note even if it were.
    history.replaceState(null, '', '/?kernels=page&chrome=native&open=Io.ipynb');
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    await screen.findByTestId('pane');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('keeps the notice off a data file in the browser backend', async () => {
    mocks.controller = { dirty: false, save: async () => true, download: vi.fn() };
    const fake = fakeServices({ '': [] });
    localStorage.setItem('ganymede-ui:backend', JSON.stringify(browser));
    history.replaceState(null, '', '/?open=data.csv');
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    render(<App />);
    await screen.findByTestId('data-pane');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('a reload after Try restores the browser backend and copies no second sample', async () => {
    const fake = fakeServices({ '': [{ name: 'Ganymede Tour.ipynb', type: 'notebook' }] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    localStorage.setItem('ganymede-ui:backend', JSON.stringify(browser));
    history.replaceState(null, '', '/?open=Ganymede%20Tour.ipynb');
    render(<App />);
    await waitFor(() =>
      expect(screen.getByTestId('pane')).toHaveTextContent('Ganymede Tour.ipynb'),
    );
    expect(mocks.connect).toHaveBeenCalledWith(browser);
    expect(saved(fake)).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Try a Notebook' })).not.toBeInTheDocument();
  });

  it('never shows the start screen in the Apple apps, even after a failed connection', async () => {
    history.replaceState(null, '', '/?kernels=server&chrome=native');
    mocks.connect.mockRejectedValue(new Error('The app’s server is not running.'));
    render(<App />);
    expect(await screen.findByText('The app’s server is not running.')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Where should kernels run?' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try a Notebook' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open a Notebook…' })).not.toBeInTheDocument();
  });

  it('opens the sheet from the command palette’s Connect to a Server… with nothing connected', async () => {
    render(<App />);
    await screen.findByRole('button', { name: 'Try a Notebook' });
    await openPalette('Connect to');
    expect(await screen.findByText('Where should kernels run?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Try a Notebook' })).toBeInTheDocument();
  });

  it('opens the sheet from the toolbar’s backend button, and Onboarding’s Change…, once connected', async () => {
    const fake = fakeServices({ '': [] });
    mocks.connect.mockResolvedValue(fakeBackend(fake.services, browser));
    localStorage.setItem('ganymede-ui:backend', JSON.stringify(browser));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Change where kernels run' }));
    expect(await screen.findByText('Where should kernels run?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Where should kernels run?')).not.toBeInTheDocument();
  });
});

describe('closing a notebook with unsaved edits (#808)', () => {
  const openOnServer = async (
    controller: NonNullable<typeof mocks.controller>,
    files: Parameters<typeof fakeServices>[0] = {
      '': [],
      work: [
        { name: 'Orbits.ipynb', type: 'notebook' },
        { name: 'Moons.ipynb', type: 'notebook' },
        { name: 'Rings.ipynb', type: 'notebook' },
      ],
    },
  ) => {
    mocks.controller = controller;
    const fake = fakeServices(files);
    mocks.connect.mockResolvedValue(fakeBackend(fake.services));
    history.replaceState(null, '', '/?kernels=server&open=work/Orbits.ipynb');
    render(<App />);
    expect(await screen.findByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');
    if (controller.dirty) {
      await screen.findByRole('button', { name: /^Edited/ });
    }
    return fake;
  };

  it('saves the open notebook before switching via sidebar, and switches once saved', async () => {
    let saved!: (ok: boolean) => void;
    const save = vi.fn(() => new Promise<boolean>(r => (saved = r)));
    await openOnServer({ dirty: true, save, download: vi.fn(), discard: vi.fn() });

    await userEvent.click(await screen.findByRole('button', { name: 'Moons' }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');

    await act(async () => saved(true));
    expect(await screen.findByTestId('pane')).toHaveTextContent('work/Moons.ipynb');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('treats clicking the already open dirty notebook as a no-op', async () => {
    const save = vi.fn(async () => false);
    await openOnServer({ dirty: true, save, download: vi.fn(), discard: vi.fn() });

    await userEvent.click(await screen.findByRole('button', { name: 'Orbits' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');
  });

  it('blocks switching when saving fails, supports Keep Editing, Download a Copy, and Switch Without Saving', async () => {
    const save = vi.fn(async () => false);
    const download = vi.fn();
    const undo = vi.fn();
    const discard = vi.fn(() => undo);
    await openOnServer({ dirty: true, save, download, discard });

    await userEvent.click(await screen.findByRole('button', { name: 'Moons' }));
    const dialog = await screen.findByRole('dialog', { name: 'Unsaved edits' });
    const alert = within(dialog).getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t save “Orbits.ipynb”');
    expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');

    await userEvent.click(within(alert).getByRole('button', { name: 'Keep Editing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(discard).not.toHaveBeenCalled();
    expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');

    expect(await window.ganymede!.command('open', 'work/Moons.ipynb')).toBe(false);
    const alert2 = within(await screen.findByRole('dialog', { name: 'Unsaved edits' })).getByRole(
      'alert',
    );
    await userEvent.click(within(alert2).getByRole('button', { name: 'Download a Copy' }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Unsaved edits' })).toBeInTheDocument();

    await userEvent.click(within(alert2).getByRole('button', { name: 'Switch Without Saving' }));
    expect(discard).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('pane')).toHaveTextContent('work/Moons.ipynb');
    expect(undo).not.toHaveBeenCalled();
  });

  it('shows the timeout reason when the save does not answer in time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const save = vi.fn(() => new Promise<boolean>(() => {}));
      await openOnServer({ dirty: true, save, download: vi.fn(), discard: vi.fn() });

      await userEvent.click(await screen.findByRole('button', { name: 'Moons' }));
      await act(async () => vi.advanceTimersByTime(SERVER_TIMEOUT_MS));

      const alert = within(await screen.findByRole('dialog', { name: 'Unsaved edits' })).getByRole(
        'alert',
      );
      expect(alert).toHaveTextContent('The server didn’t answer in time.');
      expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a superseded switch when another target is chosen while saving', async () => {
    let firstSave!: (ok: boolean) => void;
    let secondSave!: (ok: boolean) => void;
    const save = vi
      .fn()
      .mockImplementationOnce(() => new Promise<boolean>(r => (firstSave = r)))
      .mockImplementationOnce(() => new Promise<boolean>(r => (secondSave = r)));
    await openOnServer({ dirty: true, save, download: vi.fn(), discard: vi.fn() });

    await userEvent.click(await screen.findByRole('button', { name: 'Moons' }));
    await userEvent.click(screen.getByRole('button', { name: 'Rings' }));

    await act(async () => firstSave(true));
    expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');

    await act(async () => secondSave(true));
    expect(await screen.findByTestId('pane')).toHaveTextContent('work/Rings.ipynb');
  });

  it('guards new-notebook before creating the file and restores undo if creation fails', async () => {
    const undo = vi.fn();
    const fake = await openOnServer({
      dirty: true,
      save: vi.fn(async () => false),
      download: vi.fn(),
      discard: vi.fn(() => undo),
    });
    const newUntitled = vi
      .spyOn(fake.services.contents, 'newUntitled')
      .mockRejectedValue(new Error('read only'));

    expect(await window.ganymede!.command('new-notebook', 'work')).toBe(false);
    expect(newUntitled).not.toHaveBeenCalled();

    const alert = within(await screen.findByRole('dialog', { name: 'Unsaved edits' })).getByRole(
      'alert',
    );
    await userEvent.click(within(alert).getByRole('button', { name: 'Switch Without Saving' }));
    await waitFor(() => expect(newUntitled).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(undo).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('pane')).toHaveTextContent('work/Orbits.ipynb');
  });

  it('guards open-examples, new-duckdb-console, and open-console in the page', async () => {
    const save = vi.fn(async () => false);
    const discard = vi.fn(() => () => {});
    mocks.copyExamples = vi.fn(async () => 'work/Examples/Intro.ipynb');
    await openOnServer({ dirty: true, save, download: vi.fn(), discard });

    expect(await window.ganymede!.command('open-examples', 'work')).toBe(false);
    expect(mocks.copyExamples).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Keep Editing' }));

    expect(await window.ganymede!.command('new-duckdb-console', 'work')).toBe(false);
    expect(screen.queryByTestId('duck-console')).toBeNull();
    await userEvent.click(await screen.findByRole('button', { name: 'Switch Without Saving' }));
    expect(await screen.findByTestId('duck-console')).toHaveAttribute('data-folder', 'work');
    expect(discard).toHaveBeenCalledTimes(1);
  });
});
