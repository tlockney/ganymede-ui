import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackendConfig } from '../lib/backends';
import { fakeBackend, fakeServices } from '../test/fakes';
import { Onboarding } from './Onboarding';

const backend = (config?: BackendConfig) => fakeBackend(fakeServices().services, config);

function show(props: Partial<Parameters<typeof Onboarding>[0]> = {}) {
  const callbacks = {
    onShowFolder: vi.fn(),
    onConnect: vi.fn(),
    onOpenSample: vi.fn(async () => {}),
  };
  const result = render(<Onboarding backend={backend()} folder="" {...callbacks} {...props} />);
  return { ...callbacks, ...result };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Onboarding', () => {
  it('explains where notebooks live and kernels run on first run', async () => {
    const { onShowFolder, onConnect } = show({ folder: 'work/moons' });
    expect(screen.getByRole('heading', { name: 'Welcome to Ganymede' })).toBeInTheDocument();
    expect(
      screen.getByText('Notebooks are files in the folder “moons” on this app’s server.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Kernels run on this app’s server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show Folder' }));
    expect(onShowFolder).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Change where kernels run' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('says notebooks and kernels are on this device in the browser', () => {
    show({ backend: backend({ kind: 'browser' }) });
    expect(
      screen.getByText(
        'Notebooks are files in the top folder of this browser’s storage, on this device.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Kernels run in this page, on this device.')).toBeInTheDocument();
  });

  it('names a remote server, and both places for kernels', () => {
    show({
      backend: backend({
        kind: 'ganymede',
        url: 'https://nb.example.com',
        token: '',
        kernels: 'both',
      }),
    });
    expect(screen.getByText(/on nb\.example\.com\.$/)).toBeInTheDocument();
    expect(
      screen.getByText(/^Kernels run on nb\.example\.com or in this page/),
    ).toBeInTheDocument();
  });

  it('has no Show Folder button when the app draws its own sidebar', () => {
    show({ onShowFolder: undefined });
    expect(screen.queryByRole('button', { name: 'Show Folder' })).not.toBeInTheDocument();
  });

  it('opens the sample notebook', async () => {
    const { onOpenSample } = show();
    await userEvent.click(screen.getByRole('button', { name: /Open Sample Notebook/ }));
    expect(onOpenSample).toHaveBeenCalledOnce();
  });

  it('says why the sample could not be copied', async () => {
    show({ onOpenSample: vi.fn(async () => Promise.reject(new Error('Permission denied'))) });
    await userEvent.click(screen.getByRole('button', { name: /Open Sample Notebook/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t copy the sample: Permission denied',
    );
    expect(screen.getByRole('button', { name: /Open Sample Notebook/ })).toBeEnabled();
  });

  it('stays dismissed once dismissed', async () => {
    const { unmount } = show();
    await userEvent.click(screen.getByRole('button', { name: 'Don’t Show Again' }));
    expect(screen.queryByText('Welcome to Ganymede')).not.toBeInTheDocument();
    expect(localStorage.getItem('ganymede-ui:onboarding')).toBe('dismissed');
    unmount();
    show();
    expect(screen.queryByText('Welcome to Ganymede')).not.toBeInTheDocument();
  });

  it('still shows, and dismisses for this page, when storage is off', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    show();
    expect(screen.getByText('Welcome to Ganymede')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Don’t Show Again' }));
    expect(screen.queryByText('Welcome to Ganymede')).not.toBeInTheDocument();
  });
});
