import { render, screen } from '@testing-library/react';
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
});
