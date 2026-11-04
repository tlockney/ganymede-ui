import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandRegistry } from '@lumino/commands';
import type { Notebook } from '@jupyterlab/notebook';
import {
  BAR_KEYS,
  type BarKey,
  editingTarget,
  heightWithoutKeyboard,
  keepCaretAbove,
  keyboardUp,
  pressBarKey,
  resetHeights,
  typeText,
} from './keyboard-bar';

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
  afterEach(() => {
    document.body.replaceChildren();
    resetHeights();
    vi.restoreAllMocks();
  });

  it('shows only for an on-screen keyboard', () => {
    expect(keyboardUp({ height: 400, scale: 1 }, 800)).toBe(true);
    // A hardware keyboard, or none: the visual viewport fills the window.
    expect(keyboardUp({ height: 800, scale: 1 }, 800)).toBe(false);
    // The browser's own bars.
    expect(keyboardUp({ height: 740, scale: 1 }, 800)).toBe(false);
    // A pinch zoom.
    expect(keyboardUp({ height: 400, scale: 2 }, 800)).toBe(false);
  });

  it('remembers the window’s height from before the keyboard, at each width', () => {
    expect(heightWithoutKeyboard(390, 800, false)).toBe(800);
    // The app's web view shrinks with the keyboard: still 800 without it.
    expect(heightWithoutKeyboard(390, 450, true)).toBe(800);
    expect(keyboardUp({ height: 450, scale: 1 }, heightWithoutKeyboard(390, 450, true))).toBe(true);
    // Turned sideways: another width, its own height.
    expect(heightWithoutKeyboard(800, 390, false)).toBe(390);
    // A window made shorter while no cell is edited (Stage Manager) is
    // shorter: a hardware keyboard then gets no bar.
    expect(heightWithoutKeyboard(390, 500, false)).toBe(500);
    expect(keyboardUp({ height: 500, scale: 1 }, heightWithoutKeyboard(390, 500, true))).toBe(
      false,
    );
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

  it('runs nothing when no cell is being edited', () => {
    const { notebook, input } = editingNotebook();
    input.blur();
    const commands = { execute: vi.fn(async () => {}) } as unknown as CommandRegistry;
    pressBarKey(notebook, commands, byLabel('Run'));
    expect(commands.execute).not.toHaveBeenCalled();
  });

  it('presses Tab through the notebook’s key bindings, as a hardware Tab goes', () => {
    const { notebook, input } = editingNotebook();
    input.className = 'cell-editor';
    const commands = new CommandRegistry();
    const complete = vi.fn();
    commands.addCommand('completer:invoke', { execute: complete });
    commands.addKeyBinding({
      keys: ['Tab'],
      selector: '.cell-editor',
      command: 'completer:invoke',
    });
    const onKey = (e: KeyboardEvent) => commands.processKeydownEvent(e);
    document.addEventListener('keydown', onKey, true);
    pressBarKey(notebook, commands, byLabel('tab'));
    document.removeEventListener('keydown', onKey, true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('presses Tab and the arrows in the editor', () => {
    const { notebook, input } = editingNotebook();
    const keys: string[] = [];
    const codes: number[] = [];
    // The document hears it, as it hears a hardware key (Tab completes).
    const onKey = (e: KeyboardEvent) => {
      keys.push(e.key);
      codes.push(e.keyCode);
    };
    document.addEventListener('keydown', onKey, true);
    for (const label of ['tab', '←', '↑', '↓', '→']) {
      pressBarKey(notebook, {} as CommandRegistry, byLabel(label));
    }
    document.removeEventListener('keydown', onKey, true);
    expect(keys).toEqual(['Tab', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight']);
    expect(codes).toEqual([9, 37, 38, 40, 39]);
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

  it('scrolls the caret out from under the bar', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    Object.defineProperty(scroller, 'scrollHeight', { value: 2000 });
    Object.defineProperty(scroller, 'clientHeight', { value: 800 });
    const { input } = editingNotebook();
    scroller.append(input.parentElement!);
    document.body.append(scroller);
    const caretAt = (bottom: number) =>
      vi.spyOn(document, 'getSelection').mockReturnValue({
        rangeCount: 1,
        getRangeAt: () => ({ getBoundingClientRect: () => ({ bottom, height: 18 }) }),
      } as unknown as Selection);

    caretAt(380);
    keepCaretAbove(402, input);
    expect(scroller.scrollTop).toBe(0);

    // Under the bar, whose top is at 402: up by the overlap and a margin.
    caretAt(410);
    keepCaretAbove(402, input);
    expect(scroller.scrollTop).toBe(16);
  });

  it('types into every selection as input, and not into a read-only cell', () => {
    const dispatch = vi.fn();
    const view = {
      state: { readOnly: false, replaceSelection: (text: string) => ({ changes: text }) },
      dispatch,
    };
    const replaceSelection = vi.fn();
    typeText({ editor: view, replaceSelection }, '(');
    expect(dispatch).toHaveBeenCalledWith({
      changes: '(',
      scrollIntoView: true,
      userEvent: 'input.type',
    });
    expect(replaceSelection).not.toHaveBeenCalled();

    view.state.readOnly = true;
    typeText({ editor: view, replaceSelection }, ')');
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(replaceSelection).not.toHaveBeenCalled();
  });
});
