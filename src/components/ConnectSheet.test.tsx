import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConnectSheet } from './ConnectSheet';

type Props = Parameters<typeof ConnectSheet>[0];

function renderSheet(props: Partial<Props> = {}) {
  const handlers = { onCancel: vi.fn(), onConnect: vi.fn() };
  const utils = render(
    <ConnectSheet connecting={false} canCancel={false} {...handlers} {...props} />,
  );
  return { ...utils, ...handlers };
}

const server = () => screen.getByPlaceholderText('Same origin (dev proxy)') as HTMLInputElement;
const token = () => screen.getByPlaceholderText('From ganymede serve') as HTMLInputElement;
const connectButton = () => screen.getByRole('button', { name: /Connect/ });

describe('ConnectSheet', () => {
  it('defaults to a Ganymede server, same origin', async () => {
    const { onConnect } = renderSheet();
    expect(screen.getByRole('radio', { name: /Ganymede server/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: /This browser/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(server().value).toBe('');
    expect(screen.getByText(`--allow-origin ${window.location.origin}`)).toBeInTheDocument();

    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({ kind: 'ganymede', url: '', token: '' });
  });

  it('submits a trimmed server URL and token', async () => {
    const { onConnect } = renderSheet();
    await userEvent.type(server(), '  https://kernels.example:8888  ');
    await userEvent.type(token(), ' s3cret {Enter}');
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onConnect).toHaveBeenCalledWith({
      kind: 'ganymede',
      url: 'https://kernels.example:8888',
      token: 's3cret',
    });
  });

  it('can keep notebooks on the server and run kernels in the page', async () => {
    const { onConnect } = renderSheet();
    await userEvent.click(screen.getByRole('checkbox', { name: /Run kernels in this page/ }));
    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({
      kind: 'ganymede',
      url: '',
      token: '',
      kernels: 'page',
    });
  });

  it('remembers kernels in the page', () => {
    renderSheet({ initial: { kind: 'ganymede', url: '', token: '', kernels: 'page' } });
    expect(screen.getByRole('checkbox', { name: /Run kernels in this page/ })).toBeChecked();
  });

  it('keeps the token hidden and the server field a URL', async () => {
    renderSheet();
    expect(token()).toHaveAttribute('type', 'password');
    expect(server()).toHaveAttribute('type', 'url');
    await userEvent.type(server(), 'not a url');
    // The browser's own validation stops the form; no app-level checks.
    expect(server().validity.typeMismatch).toBe(true);
    expect(server().checkValidity()).toBe(false);
  });

  it('switches to the browser backend', async () => {
    const { onConnect } = renderSheet();
    await userEvent.click(screen.getByRole('radio', { name: /This browser/ }));
    expect(screen.getByRole('radio', { name: /This browser/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByPlaceholderText('From ganymede serve')).not.toBeInTheDocument();
    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({ kind: 'browser' });
  });

  it('starts from the current config', () => {
    renderSheet({ initial: { kind: 'ganymede', url: 'http://h:1', token: 'tk' } });
    expect(server().value).toBe('http://h:1');
    expect(token().value).toBe('tk');
  });

  it('starts on the browser when that is the current backend', async () => {
    const { onConnect } = renderSheet({ initial: { kind: 'browser' } });
    expect(screen.getByRole('radio', { name: /This browser/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // Switching back to a server starts with empty fields.
    await userEvent.click(screen.getByRole('radio', { name: /Ganymede server/ }));
    expect(server().value).toBe('');
    await userEvent.click(connectButton());
    expect(onConnect).toHaveBeenCalledWith({ kind: 'ganymede', url: '', token: '' });
  });

  it('shows the last error', () => {
    renderSheet({ error: 'The server refused the token.' });
    expect(screen.getByText('The server refused the token.')).toBeInTheDocument();
  });

  it('cannot connect twice while connecting', () => {
    renderSheet({ connecting: true });
    expect(screen.getByRole('button', { name: 'Connecting…' })).toBeDisabled();
  });

  it('can only be cancelled when there is a backend to go back to', async () => {
    const { onCancel, rerender } = renderSheet();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    rerender(<ConnectSheet connecting={false} canCancel onCancel={onCancel} onConnect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
