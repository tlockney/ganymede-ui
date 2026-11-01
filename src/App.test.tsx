import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Backend, BackendConfig } from './lib/backends';
import { entry, fakeBackend, fakeServices } from './test/fakes';

// The shell's wiring: which backend it connects to, the sheet, and new
// notebooks. The backends and the notebook pane are tested on their own.
const mocks = vi.hoisted(() => ({
  connect: vi.fn<(c: BackendConfig) => Promise<Backend>>(),
  signedInHere: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('./lib/backends', async importOriginal => ({
  ...(await importOriginal<object>()),
  connect: mocks.connect,
  signedInHere: mocks.signedInHere,
}));

vi.mock('./components/NotebookPane', () => ({
  NotebookPane: ({ path }: { path: string }) => <div data-testid="pane">{path}</div>,
}));

const { App } = await import('./App');

beforeEach(() => {
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
    // `kernels` is gone; `open` names the open notebook, for a reload.
    expect(window.location.search).toBe('?open=work%2FOrbits.ipynb');
    expect(document.title).toBe('Orbits');
    expect(container.querySelector('.window')).toHaveClass('sidebar-collapsed');
    // The sidebar lists the notebook's folder.
    expect(await screen.findByRole('button', { name: /work/ })).toBeInTheDocument();
    expect(fake.contents.get).toHaveBeenCalledWith('work', { content: true });
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
});
