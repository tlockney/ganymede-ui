import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import { EmptyState } from './EmptyState';

const rest = { onNew: vi.fn(), onTry: vi.fn(), onOpenFile: vi.fn() };

describe('EmptyState', () => {
  it('shows the start screen when there is no backend (#815)', async () => {
    const onConnect = vi.fn();
    const onNew = vi.fn();
    const onTry = vi.fn();
    render(
      <EmptyState
        connecting={false}
        onNew={onNew}
        onConnect={onConnect}
        onTry={onTry}
        onOpenFile={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Ganymede' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Connect…' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect to a Server…' }));
    expect(onConnect).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Try a Notebook' }));
    expect(onTry).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Open a Notebook…' })).toBeInTheDocument();
    expect(onNew).not.toHaveBeenCalled();
  });

  it('keeps a plain Connect… in the Apple apps, which never show the start screen', async () => {
    const onConnect = vi.fn();
    render(<EmptyState connecting={false} native {...rest} onConnect={onConnect} />);
    expect(screen.queryByRole('button', { name: 'Try a Notebook' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect…' }));
    expect(onConnect).toHaveBeenCalledOnce();
  });

  it('shows Connecting…, not the start screen, while connecting with no backend', () => {
    render(<EmptyState connecting {...rest} onConnect={vi.fn()} />);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers a new notebook once connected', async () => {
    const onConnect = vi.fn();
    const onNew = vi.fn();
    render(
      <EmptyState
        backend={fakeBackend(fakeServices().services)}
        connecting={false}
        onNew={onNew}
        onConnect={onConnect}
        onTry={vi.fn()}
        onOpenFile={vi.fn()}
      />,
    );
    expect(screen.getByText(/Choose a notebook in the sidebar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /New Notebook/ }));
    expect(onNew).toHaveBeenCalledOnce();
    expect(onConnect).not.toHaveBeenCalled();
  });

  it('shows progress while connecting, with no buttons', () => {
    render(
      <EmptyState
        backend={fakeBackend(fakeServices().services)}
        connecting
        {...rest}
        onConnect={vi.fn()}
      />,
    );
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('welcomes a first run once connected, when the sample can be opened', () => {
    localStorage.clear();
    const { rerender } = render(
      <EmptyState
        backend={fakeBackend(fakeServices().services)}
        connecting={false}
        onNew={vi.fn()}
        onConnect={vi.fn()}
        onTry={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenSample={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByText('Welcome to Ganymede')).toBeInTheDocument();
    rerender(<EmptyState connecting={false} {...rest} onConnect={vi.fn()} />);
    expect(screen.queryByText('Welcome to Ganymede')).not.toBeInTheDocument();
  });
});
