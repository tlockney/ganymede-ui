import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { keysFor, resetKeys } from '../lib/shortcuts';
import { ShortcutsSheet } from './ShortcutsSheet';

// Lumino reads the key from keyCode, which user-event leaves out.
const press = (key: string) =>
  fireEvent.keyDown(window, {
    key: key.toLowerCase(),
    code: `Key${key}`,
    keyCode: key.charCodeAt(0),
  });

describe('ShortcutsSheet', () => {
  afterEach(() => resetKeys());

  it('lists the shortcuts by group', () => {
    render(<ShortcutsSheet onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    for (const group of ['Notebook', 'Command mode', 'Edit mode', 'App']) {
      expect(within(dialog).getByRole('heading', { name: group })).toBeInTheDocument();
    }
    const row = screen.getByText('Select cell above').closest('.shortcut-row') as HTMLElement;
    // Two bindings, each its own key cap.
    expect(row.querySelectorAll('kbd')).toHaveLength(2);
    expect(row.querySelectorAll('kbd')[1]).toHaveTextContent('K');
    expect(screen.getByText('Delete cells').nextSibling).toHaveTextContent('D D');
  });

  it('says how to reach command mode', () => {
    render(<ShortcutsSheet onClose={vi.fn()} />);
    expect(screen.getByText(/press Esc/)).toBeInTheDocument();
    expect(screen.getByText('Leave the cell (command mode)').nextSibling).toHaveTextContent('Esc');
  });

  it('closes with Done and with Escape', async () => {
    const onClose = vi.fn();
    render(<ShortcutsSheet onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('adds a recorded keystroke, removes a binding, and resets', async () => {
    render(<ShortcutsSheet onClose={vi.fn()} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Add a shortcut to Insert cell below' }),
    );
    expect(screen.getByText('Type a shortcut…')).toBeInTheDocument();
    press('N');
    expect(keysFor('insert-below')).toEqual([['B'], ['N']]);

    await userEvent.click(screen.getByRole('button', { name: 'Remove B from Insert cell below' }));
    expect(keysFor('insert-below')).toEqual([['N']]);

    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(keysFor('insert-below')).toEqual([['B']]);
    expect(screen.queryByRole('button', { name: 'Reset All' })).not.toBeInTheDocument();
  });

  it('explains a keystroke it refuses, and Escape stops recording without closing', async () => {
    const onClose = vi.fn();
    render(<ShortcutsSheet onClose={onClose} />);
    await userEvent.click(
      screen.getByRole('button', { name: 'Add a shortcut to Insert cell below' }),
    );
    press('A');
    expect(screen.getByRole('alert')).toHaveTextContent('A is already Insert cell above.');
    expect(keysFor('insert-below')).toEqual([['B']]);

    await userEvent.click(screen.getByRole('button', { name: 'Add a shortcut to Run cell' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByText('Type a shortcut…')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
