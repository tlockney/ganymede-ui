import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { UnsavedSheet } from './UnsavedSheet';

describe('UnsavedSheet', () => {
  const renderSheet = (overrides: Partial<React.ComponentProps<typeof UnsavedSheet>> = {}) => {
    const props = {
      name: 'Orbits.ipynb',
      onKeepEditing: vi.fn(),
      onDownloadCopy: vi.fn(),
      onSwitchAnyway: vi.fn(),
      ...overrides,
    };
    const result = render(<UnsavedSheet {...props} />);
    return { ...result, ...props };
  };

  it('shows the notebook name, timeout detail when given, and three choices', () => {
    renderSheet({ why: 'The server didn’t answer in time.' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t save “Orbits.ipynb”.');
    expect(alert).toHaveTextContent('The server didn’t answer in time.');
    expect(alert).toHaveTextContent('Keep editing to try again.');
    expect(screen.getByRole('button', { name: 'Switch Without Saving' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download a Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep Editing' })).toHaveFocus();
  });

  it('calls each action callback and ignores backdrop mousedown', async () => {
    const { container, onKeepEditing, onDownloadCopy, onSwitchAnyway } = renderSheet();
    const backdrop = container.querySelector('.sheet-backdrop')!;
    expect(fireEvent.mouseDown(backdrop)).toBe(false);
    expect(screen.getByRole('button', { name: 'Keep Editing' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Download a Copy' }));
    expect(onDownloadCopy).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Switch Without Saving' }));
    expect(onSwitchAnyway).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole('button', { name: 'Keep Editing' }));
    expect(onKeepEditing).toHaveBeenCalledOnce();
  });

  it('closes via Keep Editing on Escape without leaking to behind listeners', async () => {
    const behind = vi.fn();
    window.addEventListener('keydown', behind);
    try {
      const { onKeepEditing } = renderSheet();
      await userEvent.keyboard('{Escape}');
      expect(onKeepEditing).toHaveBeenCalledOnce();
      expect(behind).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', behind);
    }
  });

  it('ignores Escape while composing text', () => {
    const { onKeepEditing } = renderSheet();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape', isComposing: true });
    expect(onKeepEditing).not.toHaveBeenCalled();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onKeepEditing).toHaveBeenCalledOnce();
  });

  it('restores focus to the opener under StrictMode', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(
      <StrictMode>
        <UnsavedSheet
          name="Orbits.ipynb"
          onKeepEditing={vi.fn()}
          onDownloadCopy={vi.fn()}
          onSwitchAnyway={vi.fn()}
        />
      </StrictMode>,
    );
    expect(screen.getByRole('button', { name: 'Keep Editing' })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
