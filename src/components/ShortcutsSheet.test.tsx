import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ShortcutsSheet } from './ShortcutsSheet';

describe('ShortcutsSheet', () => {
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

  it('closes with Done and with Escape', async () => {
    const onClose = vi.fn();
    render(<ShortcutsSheet onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Done' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
