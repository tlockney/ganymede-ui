import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { KernelSpec } from '@jupyterlab/services';
import type { NotebookController } from './NotebookPane';
import { Toolbar } from './Toolbar';
import { overflowing } from '../lib/overflow';

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
    run: vi.fn(async () => {}),
    runAll: vi.fn(async () => {}),
    clearOutputs: vi.fn(),
    insert: vi.fn(),
    interrupt: vi.fn(async () => {}),
    restart: vi.fn(async () => {}),
    changeKernel: vi.fn(async () => {}),
    cellType: 'code',
    changeCellType: vi.fn(),
    command: vi.fn(() => false),
    rename: vi.fn(async () => true),
    discard: vi.fn(() => () => {}),
    moved: vi.fn(async () => {}),
    outline: [],
    goToCell: vi.fn(() => true),
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

const button = (title: string) => screen.getByTitle(title) as HTMLButtonElement;
const ACTIONS = [
  'Run Cell (⇧↩)',
  'Run All',
  'Interrupt',
  'Restart Kernel',
  'Insert Code Cell',
  'Insert Text Cell',
  'Download Notebook',
  'Save (⌘S)',
];

describe('Toolbar', () => {
  it('disables every notebook action with no notebook open', () => {
    render(<Toolbar sidebarOpen onToggleSidebar={vi.fn()} />);
    expect(screen.getByText('Ganymede')).toBeInTheDocument();
    for (const title of ACTIONS) expect(button(title)).toBeDisabled();
    expect(screen.getByLabelText('Cell Type')).toBeDisabled();
    expect(screen.queryByTitle('Kernel')).not.toBeInTheDocument();
  });

  it('shows a kernel that starts on the first run', () => {
    render(
      <Toolbar
        controller={controller({ status: 'none' })}
        specs={SPECS}
        sidebarOpen
        onToggleSidebar={vi.fn()}
      />,
    );
    expect(screen.getByText(/Python 3 · Starts when you run a cell/)).toBeInTheDocument();
    expect(button('Run Cell (⇧↩)')).toBeEnabled();
    expect(button('Restart Kernel')).toBeDisabled();
  });

  it("names a notebook's kernel that isn't installed", () => {
    render(
      <Toolbar
        controller={controller({ status: 'none', kernelName: undefined, missingKernel: 'Julia' })}
        specs={SPECS}
        sidebarOpen
        onToggleSidebar={vi.fn()}
      />,
    );
    expect(screen.getByText(/Julia \(not installed\) · Starts/)).toBeInTheDocument();
    const select = screen.getByTitle('Kernel').querySelector('select')!;
    expect(select.value).toBe('');
    expect(select.selectedOptions[0]).toHaveTextContent('Julia (not installed)');
  });

  it('toggles the sidebar', async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<Toolbar sidebarOpen onToggleSidebar={onToggle} />);
    expect(button('Hide Sidebar')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(button('Hide Sidebar'));
    expect(onToggle).toHaveBeenCalledOnce();
    rerender(<Toolbar sidebarOpen={false} onToggleSidebar={onToggle} />);
    expect(button('Show Sidebar')).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the notebook, its kernel and status', () => {
    render(
      <Toolbar controller={controller()} specs={SPECS} sidebarOpen onToggleSidebar={vi.fn()} />,
    );
    expect(screen.getByText('Io')).toBeInTheDocument();
    expect(screen.queryByText(/Edited/)).not.toBeInTheDocument();
    expect(screen.getByText('Python 3 · Idle')).toBeInTheDocument();
    expect(document.querySelector('.status-dot')).toHaveClass('s-idle');
  });

  it.each([
    ['busy', 'Running'],
    ['connecting', 'Connecting'],
    ['dead', 'Stopped'],
    ['autorestarting', 'Restarting'],
  ] as const)('labels status %s as %s', (status, label) => {
    render(
      <Toolbar
        controller={controller({ status })}
        specs={SPECS}
        sidebarOpen
        onToggleSidebar={vi.fn()}
      />,
    );
    expect(screen.getByText(`Python 3 · ${label}`)).toBeInTheDocument();
  });

  it('falls back to the kernel name, or none', () => {
    const { rerender } = render(
      <Toolbar
        controller={controller({ kernelName: 'rust' })}
        sidebarOpen
        onToggleSidebar={vi.fn()}
      />,
    );
    expect(screen.getByText('rust · Idle')).toBeInTheDocument();
    rerender(
      <Toolbar
        controller={controller({ kernelName: undefined })}
        sidebarOpen
        onToggleSidebar={vi.fn()}
      />,
    );
    expect(screen.getByText('No kernel · Idle')).toBeInTheDocument();
  });

  it('calls the controller from each button', async () => {
    const c = controller({ status: 'busy', dirty: true });
    render(<Toolbar controller={c} specs={SPECS} sidebarOpen onToggleSidebar={vi.fn()} />);
    expect(screen.getByText(/Edited/)).toBeInTheDocument();
    for (const title of ACTIONS) expect(button(title)).toBeEnabled();

    await userEvent.click(button('Run Cell (⇧↩)'));
    await userEvent.click(button('Run All'));
    await userEvent.click(button('Interrupt'));
    await userEvent.click(button('Restart Kernel'));
    await userEvent.click(button('Insert Code Cell'));
    await userEvent.click(button('Insert Text Cell'));
    await userEvent.click(button('Download Notebook'));
    await userEvent.click(button('Save (⌘S)'));
    expect(c.run).toHaveBeenCalledOnce();
    expect(c.runAll).toHaveBeenCalledOnce();
    expect(c.interrupt).toHaveBeenCalledOnce();
    expect(c.restart).toHaveBeenCalledOnce();
    expect(c.insert).toHaveBeenNthCalledWith(1, 'code');
    expect(c.insert).toHaveBeenNthCalledWith(2, 'markdown');
    expect(c.download).toHaveBeenCalledOnce();
    expect(c.save).toHaveBeenCalledOnce();
  });

  it('only interrupts a busy kernel and only saves a dirty notebook', () => {
    render(
      <Toolbar controller={controller()} specs={SPECS} sidebarOpen onToggleSidebar={vi.fn()} />,
    );
    expect(button('Interrupt')).toBeDisabled();
    expect(button('Save (⌘S)')).toBeDisabled();
    expect(button('Run All')).toBeEnabled();
  });

  it('shows the active cell type and changes it', async () => {
    const c = controller({ cellType: 'markdown' });
    render(<Toolbar controller={c} sidebarOpen onToggleSidebar={vi.fn()} />);
    const picker = screen.getByLabelText('Cell Type') as HTMLSelectElement;
    expect(picker).toBeEnabled();
    expect(picker.value).toBe('markdown');
    await userEvent.selectOptions(picker, 'Code');
    expect(c.changeCellType).toHaveBeenCalledWith('code');
  });

  it('offers Trust Notebook only while outputs are untrusted', () => {
    const { rerender } = render(
      <Toolbar controller={controller()} sidebarOpen onToggleSidebar={vi.fn()} />,
    );
    expect(screen.queryByTitle('Trust Notebook')).not.toBeInTheDocument();
    rerender(
      <Toolbar controller={controller({ trusted: false })} sidebarOpen onToggleSidebar={vi.fn()} />,
    );
    expect(button('Trust Notebook')).toBeEnabled();
    render(<Toolbar sidebarOpen onToggleSidebar={vi.fn()} />);
    expect(screen.getAllByTitle('Trust Notebook')).toHaveLength(1);
  });

  it('offers Notebook Access only while the notebook asks for more', async () => {
    const open = vi.fn();
    const { rerender } = render(
      <Toolbar
        controller={controller()}
        sidebarOpen
        onToggleSidebar={vi.fn()}
        onNotebookAccess={open}
      />,
    );
    expect(screen.queryByTitle(/^Notebook Access/)).not.toBeInTheDocument();
    rerender(
      <Toolbar
        controller={controller()}
        sidebarOpen
        onToggleSidebar={vi.fn()}
        accessMissing={['notebooks.run']}
        onNotebookAccess={open}
      />,
    );
    await userEvent.click(button('Notebook Access: asks for notebooks.run'));
    expect(open).toHaveBeenCalledOnce();
  });

  it('trusts the notebook after confirmation', async () => {
    const c = controller({ trusted: false });
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    render(<Toolbar controller={c} sidebarOpen onToggleSidebar={vi.fn()} />);
    await userEvent.click(button('Trust Notebook'));
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/^Trust this notebook\?/));
    expect(c.trust).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await userEvent.click(button('Trust Notebook'));
    expect(c.trust).toHaveBeenCalledOnce();
  });

  it('changes the kernel from the popup', async () => {
    const c = controller();
    render(<Toolbar controller={c} specs={SPECS} sidebarOpen onToggleSidebar={vi.fn()} />);
    const select = screen.getByRole('combobox', { name: 'Kernel' }) as HTMLSelectElement;
    expect(select.value).toBe('python3');
    expect([...select.options].map(o => o.text)).toEqual(['Python 3', 'JavaScript']);
    await userEvent.selectOptions(select, 'javascript');
    expect(c.changeKernel).toHaveBeenCalledWith('javascript');
  });
});

describe('overflowing', () => {
  const items = [
    { key: 'run', priority: Infinity, width: 28 },
    { key: 'insert', priority: 4, width: 60 },
    { key: 'kernel', priority: 2, width: 120 },
    { key: 'download', priority: 0, width: 28 },
    { key: 'save', priority: 5, width: 28 },
  ];
  // 28 + 60 + 120 + 28 + 28, and four 8px gaps.
  const all = 264 + 32;

  it('hides nothing when everything fits', () => {
    expect(overflowing(items, all)).toEqual(new Set());
  });

  it('hides the lowest priority first, leaving room for the "…" button', () => {
    // Without Download: 236 and three gaps, plus 8 + 28 for "…": 296.
    expect(overflowing(items, all - 1)).toEqual(new Set(['download', 'kernel']));
    expect(overflowing(items, 300)).toEqual(new Set());
    expect(overflowing(items, 200)).toEqual(new Set(['download', 'kernel']));
    expect(overflowing(items, 160)).toEqual(new Set(['download', 'kernel', 'insert']));
  });

  it('never hides what has no priority (Run)', () => {
    expect(overflowing(items, 10)).toEqual(new Set(['download', 'kernel', 'insert', 'save']));
  });
});

describe('Toolbar overflow (#201)', () => {
  /** A toolbar `width` wide, each item 28px but the pickers 110px and the groups 60–90px. */
  function layout(width: number) {
    const sizes: Record<string, number> = {
      'run-more': 90,
      insert: 60,
      'cell-type': 110,
      kernel: 110,
    };
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('toolbar') ? width : 0;
    });
    // The title is wider than the room it keeps (120px).
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.classList.contains('title') ? 200 : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const w = sizes[this.dataset.key ?? ''] ?? 28;
      return { width: w, height: 28, top: 0, left: 0, right: w, bottom: 28, x: 0, y: 0 } as DOMRect;
    });
  }

  afterEach(() => vi.restoreAllMocks());

  it('does not reopen the menu after the window widens and narrows', async () => {
    layout(393);
    const c = controller({ dirty: true });
    const bar = (status: NotebookController['status']) => (
      <Toolbar
        controller={{ ...c, status }}
        sidebarOpen={false}
        onToggleSidebar={() => {}}
        specs={SPECS}
      />
    );
    const { rerender } = render(bar('idle'));
    await userEvent.click(screen.getByTitle('More'));
    vi.restoreAllMocks();
    layout(1280);
    rerender(bar('busy'));
    expect(screen.queryByTitle('More')).not.toBeInTheDocument();
    vi.restoreAllMocks();
    layout(393);
    rerender(bar('idle'));
    rerender(bar('busy'));
    expect(screen.queryByRole('menu', { name: 'More' })).not.toBeInTheDocument();
  });

  const shown = () =>
    [...document.querySelectorAll<HTMLElement>('.toolbar-trailing .tb-item')].map(
      i => i.dataset.key,
    );

  it('keeps everything on a wide window, with no "…"', () => {
    layout(1280);
    render(
      <Toolbar controller={controller()} sidebarOpen onToggleSidebar={() => {}} specs={SPECS} />,
    );
    expect(shown()).toEqual([
      'run',
      'run-more',
      'insert',
      'cell-type',
      'kernel',
      'shortcuts',
      'download',
      'save',
    ]);
    expect(screen.queryByTitle('More')).not.toBeInTheDocument();
  });

  it('keeps the run controls and Save on a phone, with the rest in the menu by name', async () => {
    layout(393);
    const c = controller({ dirty: true });
    render(<Toolbar controller={c} sidebarOpen={false} onToggleSidebar={() => {}} specs={SPECS} />);
    expect(shown()).toEqual(['run', 'run-more', 'save']);
    await userEvent.click(screen.getByTitle('More'));
    const menu = screen.getByRole('menu', { name: 'More' });
    expect([...menu.querySelectorAll('button')].map(b => b.textContent)).toEqual([
      'Insert Code Cell',
      'Insert Text Cell',
      // The checked one is marked.
      '✓Code',
      'Markdown',
      'Raw',
      '✓Python 3',
      'JavaScript',
      'Download Notebook',
    ]);
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Markdown' }));
    expect(c.changeCellType).toHaveBeenCalledWith('markdown');
    await userEvent.click(screen.getByTitle('More'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Download Notebook' }));
    expect(c.download).toHaveBeenCalled();
  });

  it('keeps Run and "…" on the narrowest phone', async () => {
    layout(320);
    const c = controller({ dirty: true });
    render(<Toolbar controller={c} sidebarOpen={false} onToggleSidebar={() => {}} specs={SPECS} />);
    expect(shown()).toEqual(['run']);
    await userEvent.click(screen.getByTitle('More'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Run All' }));
    expect(c.runAll).toHaveBeenCalled();
    await userEvent.click(screen.getByTitle('More'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Clear All Outputs' }));
    expect(c.clearOutputs).toHaveBeenCalled();
    await userEvent.click(screen.getByTitle('More'));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Save' }));
    expect(c.save).toHaveBeenCalled();
  });

  it('moves the least needed first as the window narrows', () => {
    layout(700);
    render(
      <Toolbar controller={controller()} sidebarOpen onToggleSidebar={() => {}} specs={SPECS} />,
    );
    const kept = shown();
    expect(kept).toContain('run');
    expect(kept).toContain('save');
    expect(kept).not.toContain('download');
    expect(screen.getByTitle('More')).toBeInTheDocument();
  });
});

describe('Toolbar publish', () => {
  it('offers Publish as Web Page only when the app can publish', async () => {
    const c = controller();
    const onPublish = vi.fn();
    const { rerender } = render(
      <Toolbar controller={c} specs={SPECS} sidebarOpen onToggleSidebar={vi.fn()} />,
    );
    expect(screen.queryByTitle('Publish as Web Page')).toBeNull();
    rerender(
      <Toolbar
        controller={c}
        specs={SPECS}
        sidebarOpen
        onToggleSidebar={vi.fn()}
        onPublish={onPublish}
      />,
    );
    await userEvent.click(screen.getByTitle('Publish as Web Page'));
    expect(onPublish).toHaveBeenCalledOnce();
  });
});
