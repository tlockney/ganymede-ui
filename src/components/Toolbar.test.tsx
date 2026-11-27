import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KernelSpec } from '@jupyterlab/services';
import type { NotebookController } from './NotebookPane';
import { Toolbar } from './Toolbar';
import { placeOf } from '../lib/header-status';

// jsdom has no matchMedia: a wide window unless a test says otherwise.
window.matchMedia ??= (media: string) =>
  ({
    media,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }) as unknown as MediaQueryList;

function controller(over: Partial<NotebookController> = {}): NotebookController {
  return {
    path: 'moons/Io.ipynb',
    name: 'Io.ipynb',
    status: 'idle',
    kernelName: 'python3',
    dirty: false,
    locked: false,
    reload: vi.fn(() => true),
    unlock: vi.fn(async () => {}),
    trusted: true,
    save: vi.fn(async () => true),
    download: vi.fn(),
    publish: vi.fn(async () => {}),
    trust: vi.fn(async () => {}),
    hostWants: vi.fn(() => []),
    recordedParams: vi.fn(() => '{}'),
    run: vi.fn(async () => {}),
    runAll: vi.fn(async () => {}),
    clearOutputs: vi.fn(),
    exportAs: vi.fn(async () => {}),
    insert: vi.fn(),
    interrupt: vi.fn(async () => {}),
    restart: vi.fn(async () => {}),
    restartAndRunAll: vi.fn(async () => {}),
    changeKernel: vi.fn(async () => {}),
    cellType: 'code',
    changeCellType: vi.fn(),
    command: vi.fn(() => false),
    rename: vi.fn(async () => true),
    discard: vi.fn(() => () => {}),
    moved: vi.fn(async () => {}),
    outline: [],
    notebookFind: null,
    journal: false,
    toggleJournal: vi.fn(),
    goToCell: vi.fn(() => true),
    goToDefinition: vi.fn(async () => true),
    renameSymbol: vi.fn(async () => true),
    ...over,
  };
}

const SPECS: KernelSpec.ISpecModels = {
  default: 'python3',
  kernelspecs: {
    python3: {
      name: 'python3',
      display_name: 'Python 3',
      language: 'python',
      argv: [],
      resources: {},
    },
    javascript: {
      name: 'javascript',
      display_name: 'JavaScript',
      language: 'javascript',
      argv: [],
      resources: {},
    },
  },
};

const BROWSER = placeOf({ kind: 'browser' });

function bar(over: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  return (
    <Toolbar
      controller={controller()}
      specs={SPECS}
      place={BROWSER}
      sidebarOpen
      onToggleSidebar={vi.fn()}
      {...over}
    />
  );
}

const named = (name: string | RegExp) => screen.getByRole('button', { name });
const menuItem = (name: string | RegExp) => screen.getByRole('menuitem', { name });
const status = () => screen.getByRole('button', { name: /^(Saved|Edited|Locked)/ });

async function pick(menu: string, item: string | RegExp) {
  await userEvent.click(named(menu));
  await userEvent.click(menuItem(item));
}

describe('Toolbar', () => {
  it('disables every notebook action with no notebook open', async () => {
    render(<Toolbar sidebarOpen onToggleSidebar={vi.fn()} />);
    expect(screen.getByText('Ganymede')).toBeInTheDocument();
    expect(named('Run Cell')).toBeDisabled();
    expect(named('Interrupt')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^Saved/ })).not.toBeInTheDocument();
    await userEvent.click(named('More run actions'));
    for (const name of ['Run All', 'Clear All Outputs', 'Restart Kernel', 'Restart & Run All']) {
      expect(menuItem(name), name).toBeDisabled();
    }
    await userEvent.keyboard('{Escape}');
    await userEvent.click(named('Share'));
    expect(menuItem('Download Notebook')).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(named('More'));
    for (const name of ['Insert Code Cell', 'Insert Text Cell', 'Save']) {
      expect(menuItem(name), name).toBeDisabled();
    }
    expect(screen.getByRole('menuitemradio', { name: 'Code' })).toBeDisabled();
  });

  it('keeps Run Cell, its menu, Interrupt, Share and More in view, in that order', () => {
    render(bar());
    const names = screen
      .getAllByRole('button')
      .map(b => b.getAttribute('aria-label'))
      .filter(Boolean);
    expect(names.slice(-5)).toEqual(['Run Cell', 'More run actions', 'Interrupt', 'Share', 'More']);
    expect(named('Run Cell')).toHaveTextContent('Run Cell');
    expect(named('Run Cell')).toHaveAttribute('title', 'Run Cell (⇧↩)');
    expect(named('More run actions')).toHaveAttribute('aria-haspopup', 'menu');
  });

  it('shows a kernel that starts on the first run, without a state', () => {
    render(bar({ controller: controller({ status: 'none' }) }));
    expect(status()).toHaveAccessibleName('Saved in this browser · Runs here · Python 3');
    expect(named('Run Cell')).toBeEnabled();
  });

  it("names a notebook's kernel that isn't installed, and offers the picker", async () => {
    render(
      bar({
        controller: controller({ status: 'none', kernelName: undefined, missingKernel: 'Julia' }),
      }),
    );
    expect(status()).toHaveAccessibleName(
      'Saved in this browser · Runs here · Julia (not installed) · Choose kernel',
    );
    await userEvent.click(status());
    expect(screen.getByRole('menuitemradio', { name: 'Python 3' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('says where the notebook is saved and runs, for each backend (#801)', () => {
    const { rerender } = render(
      bar({
        place: placeOf({ kind: 'ganymede', url: 'https://lab.example.com', token: '' }),
      }),
    );
    expect(status()).toHaveAccessibleName(
      'Saved on lab.example.com · Runs on lab.example.com · Python 3',
    );
    rerender(
      bar({
        place: placeOf({
          kind: 'ganymede',
          url: '',
          token: '',
          machine: 'm1',
          machineName: 'Studio Mac',
        }),
      }),
    );
    expect(status()).toHaveAccessibleName('Saved on Studio Mac · Runs on Studio Mac · Python 3');
  });

  it('says Edited for unsaved edits and Locked when the file changed on disk', () => {
    const { rerender } = render(bar({ controller: controller({ dirty: true }) }));
    expect(screen.getByRole('button', { name: 'Edited · Runs here · Python 3' })).toBeVisible();
    rerender(bar({ controller: controller({ dirty: true, locked: true }) }));
    expect(
      screen.getByRole('button', {
        name: 'Edited · Locked: changed on disk · Runs here · Python 3',
      }),
    ).toBeVisible();
    // Not in the title any more.
    expect(screen.queryByText(/— /)).not.toBeInTheDocument();
  });

  it.each([
    ['busy', 'Running'],
    ['connecting', 'Connecting'],
    ['dead', 'Stopped'],
    ['autorestarting', 'Restarting'],
  ] as const)('adds the kernel state %s as %s', (kernelStatus, label) => {
    render(bar({ controller: controller({ status: kernelStatus }) }));
    expect(status()).toHaveAccessibleName(
      `Saved in this browser · Runs here · Python 3 · ${label}`,
    );
    expect(document.querySelector('.status-dot')).toHaveClass(`s-${kernelStatus}`);
  });

  it('leaves the state out while idle', () => {
    render(bar());
    expect(status()).toHaveAccessibleName('Saved in this browser · Runs here · Python 3');
    expect(document.querySelector('.status-dot')).toHaveClass('s-idle');
  });

  it('has a short form that keeps where it runs, for a phone, with a long host (#801)', () => {
    render(
      bar({
        place: placeOf({
          kind: 'ganymede',
          url: 'https://a-rather-long-hostname.lab.example.com:8888',
          token: '',
        }),
      }),
    );
    // The CSS shows one of the two by width; the name has the whole line.
    expect(document.querySelector('.status-short')).toHaveTextContent(
      'Saved · Runs on a-rather-long-hostname.lab.example.com:8888',
    );
    expect(document.querySelector('.status-full')).toHaveTextContent(
      /^Saved on a-rather-long-hostname.* · Python 3$/,
    );
  });

  it('opens the file, the kernel version and the kernel picker from the status line', async () => {
    const c = controller({ kernelVersionLine: 'cdp-kernel 0.14.0 · node 24.11.0' });
    render(bar({ controller: c }));
    await userEvent.click(status());
    const menu = screen.getByRole('menu', { name: 'Notebook and Kernel' });
    expect(menu).toHaveTextContent('moons/Io.ipynb');
    // The notes aren't items, so the menu describes itself with them.
    expect(menu).toHaveAccessibleDescription('moons/Io.ipynb cdp-kernel 0.14.0 · node 24.11.0');
    expect(menu).toHaveTextContent('cdp-kernel 0.14.0 · node 24.11.0');
    const python = screen.getByRole('menuitemradio', { name: 'Python 3' });
    expect(python).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'JavaScript' }));
    expect(c.changeKernel).toHaveBeenCalledWith('javascript');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('leaves out the kernel version line when it is unknown', async () => {
    render(bar());
    await userEvent.click(status());
    expect(screen.getByRole('menu')).not.toHaveTextContent('cdp-kernel');
    expect(screen.getByRole('menu')).toHaveTextContent('Kernel');
  });

  it('marks a kernel that offers the device API (#648)', async () => {
    const specs: KernelSpec.ISpecModels = {
      default: 'python3',
      kernelspecs: {
        ...SPECS.kernelspecs,
        'cdp-browser': {
          name: 'cdp-browser',
          display_name: 'TypeScript (cdp-kernel, in app)',
          language: 'typescript',
          argv: [],
          resources: {},
          metadata: { capabilities: { device: true } },
        },
      },
    };
    render(bar({ specs }));
    await userEvent.click(status());
    const item = screen.getByRole('menuitemradio', {
      name: 'TypeScript (cdp-kernel, in app), offers the device API',
    });
    expect(item).toHaveTextContent('TypeScript (cdp-kernel, in app) ◆');
    expect(item).toHaveAttribute('title', 'offers the device API');
    expect(screen.getByRole('menuitemradio', { name: 'Python 3' })).not.toHaveAttribute('title');
  });

  it('marks a kernel that runs on a remote, and says when it isn’t answering (#832)', async () => {
    const down = {
      remote: { name: 'workmbp', reachable: false, error: 'gateway: error sending request' },
      gateway: ['javascript'],
    };
    const { rerender } = render(bar({ places: down }));
    await userEvent.click(status());
    expect(screen.getByRole('menuitemradio', { name: 'JavaScript · workmbp' })).toHaveTextContent(
      'JavaScript · workmbp',
    );
    // This server's own kernel carries no mark.
    expect(screen.getByRole('menuitemradio', { name: 'Python 3' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', {
        name: 'workmbp isn’t answering: gateway: error sending request',
      }),
    ).toBeDisabled();

    await userEvent.keyboard('{Escape}');
    rerender(
      bar({ places: { ...down, remote: { ...down.remote, reachable: true, error: null } } }),
    );
    await userEvent.click(status());
    expect(screen.getByRole('menuitemradio', { name: 'JavaScript · workmbp' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /isn’t answering/ })).not.toBeInTheDocument();
  });

  it("names the machine a remote runs kernels for, in a machine's window (#832)", async () => {
    render(
      bar({
        machine: 'm5air',
        places: {
          remote: { name: 'workmbp', reachable: false, error: 'gateway: error sending request' },
          gateway: ['javascript'],
        },
      }),
    );
    await userEvent.click(status());
    expect(
      screen.getByRole('menuitem', {
        name: 'm5air runs kernels on workmbp, which isn’t answering',
      }),
    ).toBeDisabled();
  });

  it('runs the cell, and interrupts only a busy kernel, from visible buttons', async () => {
    const c = controller({ status: 'busy' });
    const { rerender } = render(bar({ controller: c }));
    await userEvent.click(named('Run Cell'));
    await userEvent.click(named('Interrupt'));
    expect(c.run).toHaveBeenCalledOnce();
    expect(c.interrupt).toHaveBeenCalledOnce();
    rerender(bar({ controller: controller() }));
    expect(named('Interrupt')).toBeDisabled();
  });

  it('keeps Interrupt in the same place before, during and after a run', () => {
    const { rerender } = render(bar());
    const before = named('Interrupt');
    const order = () => [...before.parentElement!.children].indexOf(before);
    const at = order();
    rerender(bar({ controller: controller({ status: 'busy' }) }));
    expect(named('Interrupt')).toBe(before);
    expect(order()).toBe(at);
    rerender(bar());
    expect(named('Interrupt')).toBe(before);
  });

  it('calls the controller from the run menu', async () => {
    const c = controller();
    render(bar({ controller: c }));
    await pick('More run actions', 'Run All');
    await pick('More run actions', 'Clear All Outputs');
    await pick('More run actions', 'Restart Kernel');
    await pick('More run actions', 'Restart & Run All');
    expect(c.runAll).toHaveBeenCalledOnce();
    expect(c.clearOutputs).toHaveBeenCalledOnce();
    expect(c.restart).toHaveBeenCalledOnce();
    expect(c.restartAndRunAll).toHaveBeenCalledOnce();
    // Restart & Run All is the controller's one call, not a restart and a run from here.
    expect(c.restart).toHaveBeenCalledOnce();
  });

  it('only restarts a kernel that has started', async () => {
    render(bar({ controller: controller({ status: 'none' }) }));
    await userEvent.click(named('More run actions'));
    expect(menuItem('Restart Kernel')).toBeDisabled();
    expect(menuItem('Restart & Run All')).toBeEnabled();
  });

  it('lists Run with Parameters only where the app can run it', async () => {
    const onRunWithParams = vi.fn();
    const { rerender } = render(bar());
    await userEvent.click(named('More run actions'));
    expect(screen.queryByRole('menuitem', { name: 'Run with Parameters…' })).toBeNull();
    await userEvent.keyboard('{Escape}');
    rerender(bar({ onRunWithParams }));
    await pick('More run actions', 'Run with Parameters…');
    expect(onRunWithParams).toHaveBeenCalledOnce();
  });

  it('downloads, exports and publishes from Share, only where the app can', async () => {
    const c = controller();
    const onExport = vi.fn();
    const onPublish = vi.fn();
    const { rerender } = render(bar({ controller: c }));
    await userEvent.click(named('Share'));
    expect(menuItem('Download Notebook')).toBeEnabled();
    expect(screen.queryByRole('menuitem', { name: 'Export as Script' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Publish/ })).toBeNull();
    await userEvent.click(menuItem('Download Notebook'));
    expect(c.download).toHaveBeenCalledOnce();
    rerender(bar({ controller: c, onExport, onPublish }));
    await pick('Share', 'Export as Script');
    expect(onExport).toHaveBeenCalledWith('script');
    await pick('Share', 'Publish as Web Page…');
    expect(onPublish).toHaveBeenCalledOnce();
  });

  it('switches to the journal view and back, named for where it goes (#184)', async () => {
    const onToggleJournal = vi.fn();
    const { rerender } = render(bar({ onToggleJournal }));
    await pick('More', 'View as Journal');
    expect(onToggleJournal).toHaveBeenCalledOnce();
    rerender(bar({ onToggleJournal, controller: controller({ journal: true }) }));
    await userEvent.click(named('More'));
    expect(menuItem('Open as Notebook')).toBeEnabled();
  });

  it('shows Notebook | Journal beside the title only with a journal toggle (#819)', () => {
    const { rerender } = render(bar());
    expect(screen.queryByRole('group', { name: /^View/ })).not.toBeInTheDocument();
    rerender(bar({ onToggleJournal: vi.fn() }));
    // The control's name says which mode shows; each part says which it is.
    const view = screen.getByRole('group', { name: 'View: Notebook' });
    expect(within(view).getByRole('button', { name: 'Notebook' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(view).getByRole('button', { name: 'Journal' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('switches the view from the header, as the More menu item does (#819)', async () => {
    const onToggleJournal = vi.fn();
    const { rerender } = render(bar({ onToggleJournal }));
    await userEvent.click(named('Journal'));
    expect(onToggleJournal).toHaveBeenCalledOnce();
    // The part that already shows switches nothing.
    await userEvent.click(named('Notebook'));
    expect(onToggleJournal).toHaveBeenCalledOnce();
    rerender(bar({ onToggleJournal, controller: controller({ journal: true }) }));
    expect(screen.getByRole('group', { name: 'View: Journal' })).toBeInTheDocument();
    expect(named('Journal')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(named('Notebook'));
    expect(onToggleJournal).toHaveBeenCalledTimes(2);
    await userEvent.click(named('Journal'));
    expect(onToggleJournal).toHaveBeenCalledTimes(2);
  });

  it('shows Notebook | Journal on a phone only in the journal view (#819)', () => {
    const narrow = vi.spyOn(window, 'matchMedia').mockImplementation(
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
    try {
      const onToggleJournal = vi.fn();
      const { rerender } = render(bar({ onToggleJournal }));
      expect(screen.queryByRole('group', { name: /^View/ })).not.toBeInTheDocument();
      rerender(bar({ onToggleJournal, controller: controller({ journal: true }) }));
      expect(screen.getByRole('group', { name: 'View: Journal' })).toBeInTheDocument();
    } finally {
      narrow.mockRestore();
    }
  });

  it('moves focus to More when a phone loses the header control (#819)', async () => {
    const narrow = vi.spyOn(window, 'matchMedia').mockImplementation(
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
    try {
      const onToggleJournal = vi.fn();
      const { rerender } = render(
        bar({ onToggleJournal, controller: controller({ journal: true }) }),
      );
      await userEvent.click(named('Notebook'));
      expect(onToggleJournal).toHaveBeenCalledOnce();
      // The control leaves with the journal view; the More (⋯) button has
      // its focus, rather than it falling out of the header to the page.
      rerender(bar({ onToggleJournal, controller: controller({ journal: false }) }));
      expect(screen.queryByRole('group', { name: /^View/ })).not.toBeInTheDocument();
      expect(named('More')).toHaveFocus();
    } finally {
      narrow.mockRestore();
    }
  });

  it('leaves focus on the Notebook button on a wide window, where the control stays (#830)', async () => {
    const wide = vi.spyOn(window, 'matchMedia').mockImplementation(
      q =>
        ({
          media: q,
          matches: false,
          addEventListener() {},
          removeEventListener() {},
          addListener() {},
          removeListener() {},
        }) as unknown as MediaQueryList,
    );
    try {
      const onToggleJournal = vi.fn();
      const { rerender } = render(
        bar({ onToggleJournal, controller: controller({ journal: true }) }),
      );
      await userEvent.click(named('Notebook'));
      expect(onToggleJournal).toHaveBeenCalledOnce();
      rerender(bar({ onToggleJournal, controller: controller({ journal: false }) }));
      // The control is still in the header, so focus stays where the click
      // put it; only a phone, which loses the control, moves it to More.
      expect(screen.getByRole('group', { name: /^View/ })).toBeInTheDocument();
      expect(named('Notebook')).toHaveFocus();
      expect(named('More')).not.toHaveFocus();
    } finally {
      wide.mockRestore();
    }
  });

  it('disables what runs or edits cells while the journal shows them hidden (#184)', async () => {
    const c = controller({ journal: true });
    render(bar({ controller: c }));
    expect(named('Run Cell')).toBeDisabled();
    await userEvent.click(named('More run actions'));
    expect(menuItem('Run All')).toBeDisabled();
    expect(menuItem('Restart & Run All')).toBeDisabled();
    // The kernel and the file go on working.
    expect(menuItem('Restart Kernel')).toBeEnabled();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(named('More'));
    expect(menuItem('Insert Code Cell')).toBeDisabled();
    expect(menuItem('Insert Text Cell')).toBeDisabled();
    expect(screen.getByRole('menuitemradio', { name: 'Markdown' })).toBeDisabled();
  });

  it('shows and hides the Variables view from More', async () => {
    const onToggleVariables = vi.fn();
    const { rerender } = render(bar({ onToggleVariables }));
    await pick('More', 'Show Variables');
    expect(onToggleVariables).toHaveBeenCalledOnce();
    rerender(bar({ onToggleVariables, variablesOpen: true }));
    await userEvent.click(named('More'));
    expect(menuItem('Hide Variables')).toBeEnabled();
  });

  it('inserts cells, changes the cell type, saves and opens the sheets from More', async () => {
    const c = controller({ cellType: 'markdown', dirty: true });
    const onShowPalette = vi.fn();
    const onShowShortcuts = vi.fn();
    render(bar({ controller: c, onShowPalette, onShowShortcuts }));
    await pick('More', 'Insert Code Cell');
    await pick('More', 'Insert Text Cell');
    expect(c.insert).toHaveBeenNthCalledWith(1, 'code');
    expect(c.insert).toHaveBeenNthCalledWith(2, 'markdown');
    await userEvent.click(named('More'));
    expect(screen.getByRole('menuitemradio', { name: 'Markdown' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Raw' }));
    expect(c.changeCellType).toHaveBeenCalledWith('raw');
    await pick('More', 'Save');
    expect(c.save).toHaveBeenCalledOnce();
    await pick('More', 'Command Palette…');
    await pick('More', 'Keyboard Shortcuts');
    expect(onShowPalette).toHaveBeenCalledOnce();
    expect(onShowShortcuts).toHaveBeenCalledOnce();
  });

  it('only saves a dirty notebook', async () => {
    render(bar());
    await userEvent.click(named('More'));
    expect(menuItem('Save')).toBeDisabled();
  });

  it('toggles the sidebar', async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Toolbar sidebarOpen onToggleSidebar={onToggle} />);
    expect(screen.getByTitle('Hide Sidebar')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByTitle('Hide Sidebar'));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<Toolbar sidebarOpen={false} onToggleSidebar={onToggle} />);
    expect(screen.getByTitle('Show Sidebar')).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers Trust Notebook only while outputs are untrusted', async () => {
    const c = controller({ trusted: false });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const { rerender } = render(bar());
    expect(screen.queryByTitle('Trust Notebook')).not.toBeInTheDocument();
    rerender(bar({ controller: c }));
    await userEvent.click(screen.getByTitle('Trust Notebook'));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Trust this notebook\?/));
    expect(c.trust).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(screen.getByTitle('Trust Notebook'));
    expect(c.trust).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('offers Notebook Access only while the notebook asks for more', async () => {
    const open = vi.fn();
    const { rerender } = render(bar({ onNotebookAccess: open }));
    expect(screen.queryByTitle(/^Notebook Access/)).not.toBeInTheDocument();
    rerender(bar({ accessMissing: ['notebooks.run'], onNotebookAccess: open }));
    await userEvent.click(screen.getByTitle('Notebook Access: asks for notebooks.run'));
    expect(open).toHaveBeenCalledOnce();
  });

  it('also puts Trust Notebook and Notebook Access in More, for a phone', async () => {
    const c = controller({ trusted: false });
    const open = vi.fn();
    const confirm = vi.fn(() => true);
    vi.stubGlobal('confirm', confirm);
    render(bar({ controller: c, accessMissing: ['notebooks.run'], onNotebookAccess: open }));
    // The buttons carry the class a phone hides (app.css), so the menu is their way in there.
    expect(screen.getByTitle('Trust Notebook')).toHaveClass('tb-decision');
    expect(screen.getByTitle(/^Notebook Access/)).toHaveClass('tb-decision');
    await pick('More', 'Trust Notebook…');
    expect(c.trust).toHaveBeenCalledOnce();
    await pick('More', 'Notebook Access…');
    expect(open).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("leaves Trust Notebook and Notebook Access out of More when they don't apply", async () => {
    render(bar());
    await userEvent.click(named('More'));
    expect(screen.queryByRole('menuitem', { name: 'Trust Notebook…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Notebook Access…' })).not.toBeInTheDocument();
  });

  it('does not reopen a menu by itself after its notebook closes and another opens', async () => {
    const { rerender } = render(bar({ controller: controller() }));
    await userEvent.click(status());
    expect(screen.getByRole('menu')).toBeInTheDocument();
    rerender(bar({ controller: undefined }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    rerender(bar({ controller: controller() }));
    rerender(bar({ controller: controller() }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(status()).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves to the other menu when one opener follows another', async () => {
    render(bar());
    await userEvent.click(named('Share'));
    expect(screen.getByRole('menu', { name: 'Share' })).toBeInTheDocument();
    await userEvent.click(named('More'));
    expect(screen.getByRole('menu', { name: 'More' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(named('More')).toHaveFocus();
  });

  it('closes a menu with Escape and opens one at a time', async () => {
    render(bar());
    await userEvent.click(named('Share'));
    expect(screen.getByRole('menu', { name: 'Share' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(named('Share')).toHaveAttribute('aria-expanded', 'false');
  });
});
