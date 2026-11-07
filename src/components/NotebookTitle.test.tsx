import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NotebookTitle } from './NotebookTitle';

const field = () => screen.getByRole('textbox', { name: 'Notebook Name' });

describe('NotebookTitle', () => {
  it('is plain text with nothing to rename', () => {
    render(<NotebookTitle name="Ganymede" dirty={false} />);
    expect(screen.getByText('Ganymede')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('says when saving is locked', () => {
    const { rerender } = render(<NotebookTitle name="Io" dirty={false} locked />);
    expect(screen.getByText('— Locked')).toBeInTheDocument();
    rerender(<NotebookTitle name="Io" dirty locked />);
    expect(screen.getByText('— Edited, locked')).toBeInTheDocument();
  });

  it('edits in place and renames on Enter', async () => {
    const onRename = vi.fn(async () => true);
    render(<NotebookTitle name="Untitled" dirty onRename={onRename} />);
    expect(screen.getByText('— Edited')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Untitled' }));
    expect(field()).toHaveFocus();
    expect(field()).toHaveValue('Untitled');
    await userEvent.clear(field());
    await userEvent.type(field(), 'Io{Enter}');
    expect(onRename).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledWith('Io');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('cancels on Escape without renaming', async () => {
    const onRename = vi.fn(async () => true);
    render(<NotebookTitle name="Untitled" dirty={false} onRename={onRename} />);
    await userEvent.click(screen.getByRole('button', { name: 'Untitled' }));
    await userEvent.type(field(), 'x{Escape}');
    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Untitled' })).toBeInTheDocument();
  });

  it('stays open after a failed Enter, to try another name', async () => {
    const onRename = vi.fn(async () => false);
    render(<NotebookTitle name="Untitled" dirty={false} onRename={onRename} />);
    await userEvent.click(screen.getByRole('button', { name: 'Untitled' }));
    await userEvent.type(field(), '2{Enter}');
    expect(onRename).toHaveBeenCalledOnce();
    expect(field()).toBeInTheDocument();
    onRename.mockResolvedValueOnce(true);
    await userEvent.type(field(), '3{Enter}');
    expect(onRename).toHaveBeenLastCalledWith('Untitled23');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('lets ⌘S through to the app', async () => {
    const onKey = vi.fn();
    window.addEventListener('keydown', onKey);
    try {
      render(<NotebookTitle name="Untitled" dirty onRename={vi.fn(async () => true)} />);
      await userEvent.click(screen.getByRole('button', { name: 'Untitled' }));
      await userEvent.keyboard('{Meta>}s{/Meta}');
      expect(onKey).toHaveBeenCalledWith(expect.objectContaining({ key: 's', metaKey: true }));
    } finally {
      window.removeEventListener('keydown', onKey);
    }
  });

  it('renames when the field loses focus', async () => {
    const onRename = vi.fn(async () => true);
    render(
      <>
        <NotebookTitle name="Untitled" dirty={false} onRename={onRename} />
        <button>elsewhere</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Untitled' }));
    await userEvent.type(field(), '1');
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(onRename).toHaveBeenCalledOnce();
    expect(onRename).toHaveBeenCalledWith('Untitled1');
  });

  it('closes after a failed Enter once focus has moved on', async () => {
    let fail!: () => void;
    const onRename = vi.fn(() => new Promise<boolean>(r => (fail = () => r(false))));
    render(
      <>
        <NotebookTitle name="Untitled" dirty={false} onRename={onRename} />
        <button>elsewhere</button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Untitled' }));
    await userEvent.type(field(), '2{Enter}');
    // Into a cell while it renames; then the rename fails.
    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    await act(async () => fail());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'elsewhere' })).toHaveFocus();
  });
});
