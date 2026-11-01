import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KernelSpec } from '@jupyterlab/services';
import type { NotebookController } from './NotebookPane';
import { Toolbar } from './Toolbar';

function controller(over: Partial<NotebookController> = {}): NotebookController {
  return {
    path: 'moons/Io.ipynb',
    name: 'Io.ipynb',
    status: 'idle',
    kernelName: 'python3',
    dirty: false,
    trusted: true,
    save: vi.fn(async () => true),
    download: vi.fn(),
    trust: vi.fn(async () => {}),
    run: vi.fn(async () => {}),
    runAll: vi.fn(async () => {}),
    insert: vi.fn(),
    interrupt: vi.fn(async () => {}),
    restart: vi.fn(async () => {}),
    changeKernel: vi.fn(async () => {}),
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
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('python3');
    expect([...select.options].map(o => o.text)).toEqual(['Python 3', 'JavaScript']);
    await userEvent.selectOptions(select, 'javascript');
    expect(c.changeKernel).toHaveBeenCalledWith('javascript');
  });
});
