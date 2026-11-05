import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PaletteEntry } from '../lib/palette';
import { CommandPalette } from './CommandPalette';

const ENTRIES: PaletteEntry[] = [
  { id: 'save', label: 'Save', group: 'File', keys: '⌘S', disabled: true },
  { id: 'run-all', label: 'Run All Cells', group: 'Cell', keys: '' },
  { id: 'restart', label: 'Restart Kernel', group: 'Kernel', keys: '' },
  {
    id: 'rename',
    label: 'Rename Notebook…',
    group: 'File',
    keys: '',
    prompt: 'New name',
    initial: 'Io',
  },
];

function setup() {
  const onRun = vi.fn();
  const onClose = vi.fn();
  render(<CommandPalette entries={ENTRIES} onRun={onRun} onClose={onClose} />);
  return { onRun, onClose, field: screen.getByRole('combobox', { name: 'Command' }) };
}

const active = () => screen.getByRole('option', { selected: true });

describe('CommandPalette', () => {
  it('focuses the field and selects the first command that can run', () => {
    const { field } = setup();
    expect(field).toHaveFocus();
    expect(active()).toHaveTextContent('Run All Cells');
    expect(field).toHaveAttribute('aria-activedescendant', active().id);
    expect(screen.getByRole('option', { name: /Save/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('4 commands');
  });

  it('filters as you type and runs the first match on Return', async () => {
    const { onRun } = setup();
    await userEvent.keyboard('restart');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    expect(onRun).toHaveBeenCalledWith(ENTRIES[2], undefined);
  });

  it('keeps the selection when the app re-renders with new entries', async () => {
    const onRun = vi.fn();
    const { rerender } = render(
      <CommandPalette entries={ENTRIES} onRun={onRun} onClose={vi.fn()} />,
    );
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toHaveTextContent('Restart Kernel');
    // A kernel starting re-renders App, which builds the entries anew.
    rerender(<CommandPalette entries={[...ENTRIES]} onRun={onRun} onClose={vi.fn()} />);
    expect(active()).toHaveTextContent('Restart Kernel');
    await userEvent.keyboard('{Enter}');
    expect(onRun).toHaveBeenCalledWith(ENTRIES[2], undefined);
  });

  it('ignores Return while an input method is composing', () => {
    const { onRun } = setup();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', isComposing: true });
    expect(onRun).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onRun).toHaveBeenCalledWith(ENTRIES[1], undefined);
  });

  it('gives focus back when it closes', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const { unmount } = render(
      <CommandPalette entries={ENTRIES} onRun={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('combobox')).toHaveFocus();
    unmount();
    expect(before).toHaveFocus();
    before.remove();
  });

  it('moves with the arrows, skipping what can’t run, and wraps', async () => {
    const { onRun } = setup();
    await userEvent.keyboard('{ArrowDown}');
    expect(active()).toHaveTextContent('Restart Kernel');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    // Past the end, over Save, back to the first that runs.
    expect(active()).toHaveTextContent('Run All Cells');
    // Up from the first, over Save, round to the last.
    await userEvent.keyboard('{ArrowUp}');
    expect(active()).toHaveTextContent('Rename Notebook…');
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(onRun).toHaveBeenCalledWith(ENTRIES[2], undefined);
  });

  it('asks for text first when a command needs it', async () => {
    const { onRun } = setup();
    await userEvent.keyboard('rename{Enter}');
    expect(onRun).not.toHaveBeenCalled();
    const name = screen.getByPlaceholderText('New name');
    expect(name).toHaveValue('Io');
    expect(name).toHaveFocus();
    await userEvent.keyboard('Europa{Enter}');
    expect(onRun).toHaveBeenCalledWith(ENTRIES[3], 'Europa');
  });

  it('goes back from a prompt on Esc, and closes on Esc', async () => {
    const { onClose } = setup();
    await userEvent.keyboard('rename{Enter}{Escape}');
    expect(screen.getByRole('combobox', { name: 'Command' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('runs a clicked command, not a disabled one, and says when nothing matches', async () => {
    const { onRun } = setup();
    await userEvent.click(screen.getByText('Save'));
    expect(onRun).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Restart Kernel'));
    expect(onRun).toHaveBeenCalledWith(ENTRIES[2], undefined);
    await userEvent.keyboard('zzz');
    expect(screen.getByText('No matching commands')).toBeInTheDocument();
  });

  it('keeps its keys from the notebook and the app', async () => {
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    setup();
    await userEvent.keyboard('a');
    window.removeEventListener('keydown', outside);
    expect(outside).not.toHaveBeenCalled();
  });
});
