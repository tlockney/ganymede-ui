import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStorageNoticeForTests } from '../lib/storage-notice';
import { StorageNotice } from './StorageNotice';

beforeEach(() => {
  localStorage.clear();
  resetStorageNoticeForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('StorageNotice', () => {
  it('says where the notebook is kept, as a note and not an alert', () => {
    render(<StorageNotice onDownload={vi.fn()} />);
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Saved in this browser. Download a copy to keep it elsewhere.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Download a Copy downloads the notebook', async () => {
    const onDownload = vi.fn();
    render(<StorageNotice onDownload={onDownload} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download a Copy' }));
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('Dismiss closes it for this origin, so the next one doesn’t show it', async () => {
    const first = render(<StorageNotice onDownload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(localStorage.getItem('ganymede-ui:storage-notice')).toBe('dismissed');
    first.unmount();
    render(<StorageNotice onDownload={vi.fn()} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('keeps the dismissal for the page when storage is off', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const first = render(<StorageNotice onDownload={vi.fn()} />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    first.unmount();
    render(<StorageNotice onDownload={vi.fn()} />);
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('shows when reading storage fails and nothing was dismissed', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<StorageNotice onDownload={vi.fn()} />);
    expect(screen.getByRole('note')).toBeInTheDocument();
  });
});
