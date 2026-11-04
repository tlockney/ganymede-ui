import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommandRegistry } from '@lumino/commands';
import type { Notebook } from '@jupyterlab/notebook';
import { BAR_KEYS, type BarKey, editingTarget, keyboardUp, pressBarKey } from './keyboard-bar';

/** A notebook whose active cell's editor is a textarea, focused. */
function editingNotebook(mode: 'edit' | 'command' = 'edit') {
  const host = document.createElement('div');
  const input = document.createElement('textarea');
  host.append(input);
  document.body.append(host);
  input.focus();
  const replaceSelection = vi.fn();
  const notebook = {
    mode,
    activeCell: { editor: { host, replaceSelection } },
  } as unknown as Notebook;
  return { notebook, input, replaceSelection };
}

const byLabel = (label: string) => BAR_KEYS.find(k => k.label === label) as BarKey;

describe('keyboard bar', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows only for an on-screen keyboard', () => {
    expect(keyboardUp({ height: 400, scale: 1 }, 800)).toBe(true);
    // A hardware keyboard, or none: the visual viewport fills the window.
    expect(keyboardUp({ height: 800, scale: 1 }, 800)).toBe(false);
    // The browser's own bars.
    expect(keyboardUp({ height: 740, scale: 1 }, 800)).toBe(false);
    // A pinch zoom.
    expect(keyboardUp({ height: 400, scale: 2 }, 800)).toBe(false);
  });

  it('has Run, Esc, Tab, the arrows and symbols', () => {
    const labels = BAR_KEYS.map(k => k.label);
    expect(labels.slice(0, 7)).toEqual(['Run', 'esc', 'tab', '←', '↑', '↓', '→']);
    expect(labels).toContain('(');
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('finds the editor being edited', () => {
    const { notebook, input } = editingNotebook();
    expect(editingTarget(notebook)).toBe(input);
    input.blur();
    expect(editingTarget(notebook)).toBeUndefined();
    expect(editingTarget(editingNotebook('command').notebook)).toBeUndefined();
  });

  it('runs the commands for Run and Esc', () => {
    const { notebook } = editingNotebook();
    const commands = { execute: vi.fn(async () => {}) } as unknown as CommandRegistry;
    pressBarKey(notebook, commands, byLabel('Run'));
    pressBarKey(notebook, commands, byLabel('esc'));
    expect(commands.execute).toHaveBeenNthCalledWith(1, 'run-and-advance');
    expect(commands.execute).toHaveBeenNthCalledWith(2, 'command-mode');
  });

  it('presses Tab and the arrows in the editor', () => {
    const { notebook, input } = editingNotebook();
    const keys: string[] = [];
    // The document hears it, as it hears a hardware key (Tab completes).
    const onKey = (e: KeyboardEvent) => keys.push(e.key);
    document.addEventListener('keydown', onKey, true);
    for (const label of ['tab', '←', '↑', '↓', '→']) {
      pressBarKey(notebook, {} as CommandRegistry, byLabel(label));
    }
    document.removeEventListener('keydown', onKey, true);
    expect(keys).toEqual(['Tab', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']);
    expect(document.activeElement).toBe(input);
  });

  it('types a symbol', () => {
    const { notebook, replaceSelection } = editingNotebook();
    pressBarKey(notebook, {} as CommandRegistry, byLabel('('));
    expect(replaceSelection).toHaveBeenCalledWith('(');
  });

  it('does nothing to the editor when no cell is being edited', () => {
    const { notebook, input, replaceSelection } = editingNotebook();
    input.blur();
    const onKey = vi.fn();
    document.addEventListener('keydown', onKey, true);
    pressBarKey(notebook, {} as CommandRegistry, byLabel('tab'));
    pressBarKey(notebook, {} as CommandRegistry, byLabel('('));
    document.removeEventListener('keydown', onKey, true);
    expect(onKey).not.toHaveBeenCalled();
    expect(replaceSelection).not.toHaveBeenCalled();
  });
});
