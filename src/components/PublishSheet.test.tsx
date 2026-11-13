import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PublishSheet } from './PublishSheet';
import { defaultByline } from '../lib/publish';

describe('PublishSheet', () => {
  it('publishes with the CLI’s defaults', async () => {
    const publish = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<PublishSheet name="Io.ipynb" publish={publish} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'Publish Io.ipynb' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(publish).toHaveBeenCalledWith({ code: 'folded', byline: defaultByline(), copy: true });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('turns the notebook copy off with hidden code, and back on', async () => {
    const publish = vi.fn(async () => {});
    render(<PublishSheet name="Io.ipynb" publish={publish} onClose={vi.fn()} />);
    const code = screen.getByRole('combobox');
    const copy = screen.getByRole('checkbox', { name: 'Download notebook button' });
    await userEvent.selectOptions(code, 'hidden');
    expect(copy).not.toBeChecked();
    await userEvent.selectOptions(code, 'shown');
    expect(copy).toBeChecked();
    await userEvent.selectOptions(code, 'hidden');
    await userEvent.click(copy);
    expect(screen.getByText(/includes the code you hid/)).toBeInTheDocument();
    await userEvent.clear(screen.getByRole('textbox', { name: /Byline/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(publish).toHaveBeenCalledWith({ code: 'hidden', byline: '', copy: true });
  });

  it('can’t be cancelled while it publishes', async () => {
    let finish!: () => void;
    const publish = vi.fn(() => new Promise<void>(r => (finish = r)));
    const onClose = vi.fn();
    render(<PublishSheet name="Io.ipynb" publish={publish} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    finish();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('stays open and says why when publishing fails', async () => {
    const onClose = vi.fn();
    const publish = vi.fn(async () => {
      throw new Error('The server answered 500.');
    });
    render(<PublishSheet name="Io.ipynb" publish={publish} onClose={onClose} />);
    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Not published: The server answered 500.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  });
});
