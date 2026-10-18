import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('offers to connect when there is no backend', async () => {
    const onConnect = vi.fn();
    const onNew = vi.fn();
    render(<EmptyState connecting={false} onNew={onNew} onConnect={onConnect} />);
    expect(screen.getByText(/Connect to a Ganymede server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Connect…' }));
    expect(onConnect).toHaveBeenCalledOnce();
    expect(onNew).not.toHaveBeenCalled();
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
        onNew={vi.fn()}
        onConnect={vi.fn()}
      />,
    );
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
