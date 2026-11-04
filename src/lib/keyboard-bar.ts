/**
 * The keys above the on-screen keyboard while a cell is edited (#209). An
 * iPhone's keyboard has no Tab, Esc or arrows, and its symbols are a layer
 * or two away; the bar puts them a tap away.
 *
 * Tab and the arrows go to the editor as key presses, so they do what the
 * hardware keys do (Tab indents or completes, an arrow moves the cursor).
 * Run and Esc run the notebook commands that Shift+Enter and Esc run. A
 * symbol is typed into the editor.
 */
import type { CommandRegistry } from '@lumino/commands';
import type { Notebook } from '@jupyterlab/notebook';

export type BarKey =
  | { kind: 'command'; label: string; title: string; command: string }
  | { kind: 'key'; label: string; title: string; key: string }
  | { kind: 'text'; label: string; text: string };

const symbol = (text: string): BarKey => ({ kind: 'text', label: text, text });

/** The bar, in order. */
export const BAR_KEYS: readonly BarKey[] = [
  { kind: 'command', label: 'Run', title: 'Run the cell', command: 'run-and-advance' },
  { kind: 'command', label: 'esc', title: 'Stop editing', command: 'command-mode' },
  { kind: 'key', label: 'tab', title: 'Tab', key: 'Tab' },
  { kind: 'key', label: '←', title: 'Left', key: 'ArrowLeft' },
  { kind: 'key', label: '↑', title: 'Up', key: 'ArrowUp' },
  { kind: 'key', label: '↓', title: 'Down', key: 'ArrowDown' },
  { kind: 'key', label: '→', title: 'Right', key: 'ArrowRight' },
  ...['(', ')', '[', ']', '{', '}', ':', '=', '.', ',', '"', "'", '_', '#', '+', '-', '*', '/'].map(
    symbol,
  ),
];

/**
 * Whether the on-screen keyboard is up: it shrinks the visual viewport and
 * leaves the layout viewport as it was. A hardware keyboard shows no
 * on-screen one, so it gets no bar. 120 points is more than the browser's
 * own bars and less than any keyboard.
 */
export function keyboardUp(viewport: { height: number; scale: number }, innerHeight: number) {
  // A pinch zoom shrinks the visual viewport too.
  return viewport.scale <= 1.01 && innerHeight - viewport.height > 120;
}

/** The focused editor in `notebook`, if a cell is being edited. */
export function editingTarget(notebook: Notebook): HTMLElement | undefined {
  const focused = document.activeElement;
  const editor = notebook.activeCell?.editor;
  if (notebook.mode !== 'edit' || !editor || !(focused instanceof HTMLElement)) return undefined;
  return editor.host.contains(focused) ? focused : undefined;
}

/** Do what `key` does, in the cell being edited. */
export function pressBarKey(notebook: Notebook, commands: CommandRegistry, key: BarKey) {
  const target = editingTarget(notebook);
  if (key.kind === 'command') {
    void commands.execute(key.command);
  } else if (!target) {
    return;
  } else if (key.kind === 'key') {
    // Through the document's listeners first, as a hardware key goes:
    // Tab offers completions there.
    target.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: key.key,
        code: key.key,
        bubbles: true,
        cancelable: true,
      }),
    );
  } else {
    notebook.activeCell?.editor?.replaceSelection?.(key.text);
  }
}
