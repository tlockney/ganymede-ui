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
  | { kind: 'command'; label: string; title: string; command: string; primary?: true }
  | { kind: 'key'; label: string; title: string; key: string; keyCode: number }
  | { kind: 'text'; label: string; text: string };

const symbol = (text: string): BarKey => ({ kind: 'text', label: text, text });

/** The bar, in order. */
export const BAR_KEYS: readonly BarKey[] = [
  {
    kind: 'command',
    label: 'Run',
    title: 'Run the cell',
    command: 'run-and-advance',
    primary: true,
  },
  { kind: 'command', label: 'esc', title: 'Stop editing', command: 'command-mode' },
  { kind: 'key', label: 'tab', title: 'Tab', key: 'Tab', keyCode: 9 },
  { kind: 'key', label: '←', title: 'Left', key: 'ArrowLeft', keyCode: 37 },
  { kind: 'key', label: '↑', title: 'Up', key: 'ArrowUp', keyCode: 38 },
  { kind: 'key', label: '↓', title: 'Down', key: 'ArrowDown', keyCode: 40 },
  { kind: 'key', label: '→', title: 'Right', key: 'ArrowRight', keyCode: 39 },
  ...['(', ')', '[', ']', '{', '}', ':', '=', '.', ',', '"', "'", '_', '#', '+', '-', '*', '/'].map(
    symbol,
  ),
];

/** The window's last height at each width while nothing took typing. */
const lastFree = new Map<number, number>();

/**
 * The window's height without the on-screen keyboard, at `width`. In
 * Safari the keyboard shrinks only the visual viewport; in the apps it can
 * shrink the web view itself, and with it `innerHeight`. So the height is
 * recorded only while no text field has the focus (`typing` false), when
 * no keyboard can be up, and a window made shorter, as in Stage Manager,
 * counts as shorter.
 */
export function heightWithoutKeyboard(width: number, height: number, typing: boolean): number {
  if (!typing) {
    lastFree.set(width, height);
    return height;
  }
  return Math.max(lastFree.get(width) ?? 0, height);
}

/** Inputs that bring up no keyboard. */
const NOT_TYPED = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Whether `element` takes typing, and so may hold the on-screen keyboard:
 * a cell's editor, and also the sidebar's search or a kernel's `input()`,
 * and a select, whose picker on an iPhone shows where the keyboard does.
 */
export function takesText(element: Element | null): boolean {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return true;
  // On an iPhone a select's picker takes the keyboard's place.
  if (element instanceof HTMLSelectElement) return true;
  if (element instanceof HTMLInputElement) return !NOT_TYPED.has(element.type);
  return !!element.closest('[contenteditable]:not([contenteditable="false"])');
}

/** For tests: forget the heights seen. */
export function resetHeights(): void {
  lastFree.clear();
}

/**
 * Whether the on-screen keyboard is up: the visible area is more than 120
 * points shorter than the window without it, which is more than the
 * browser's own bars and less than any keyboard. A hardware keyboard shows
 * no on-screen one, so it gets no bar.
 */
export function keyboardUp(viewport: { height: number; scale: number }, fullHeight: number) {
  // A pinch zoom shrinks the visual viewport too.
  return viewport.scale <= 1.01 && fullHeight - viewport.height > 120;
}

/** The focused editor in `notebook`, if a cell is being edited. */
export function editingTarget(notebook: Notebook): HTMLElement | undefined {
  const focused = document.activeElement;
  const editor = notebook.activeCell?.editor;
  if (notebook.mode !== 'edit' || !editor || !(focused instanceof HTMLElement)) return undefined;
  return editor.host.contains(focused) ? focused : undefined;
}

/**
 * Scrolls the caret up out from under the bar, whose top is at `barTop`:
 * the browser keeps it above the keyboard, which the bar covers the top of.
 */
export function keepCaretAbove(barTop: number, target: HTMLElement) {
  const selection = document.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  // Nothing laid out to measure (an empty line in some engines, jsdom).
  const caret = typeof range.getBoundingClientRect === 'function' && range.getBoundingClientRect();
  if (!caret || !caret.height) return;
  const hidden = caret.bottom + 8 - barTop;
  if (hidden <= 0) return;
  for (let node = target.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      node.scrollTop += hidden;
      return;
    }
  }
}

/** Do what `key` does, in the cell being edited; nothing when none is. */
export function pressBarKey(notebook: Notebook, commands: CommandRegistry, key: BarKey) {
  const target = editingTarget(notebook);
  if (!target) return;
  if (key.kind === 'command') {
    void commands.execute(key.command);
  } else if (key.kind === 'key') {
    // Through the document's listeners first, as a hardware key goes:
    // Tab offers completions there. Lumino matches keys by `keyCode`,
    // which a constructed event doesn't set.
    const event = new KeyboardEvent('keydown', {
      key: key.key,
      code: key.key,
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'keyCode', { get: () => key.keyCode });
    Object.defineProperty(event, 'which', { get: () => key.keyCode });
    target.dispatchEvent(event);
  } else {
    typeText(notebook.activeCell?.editor, key.text);
  }
}

/** A CodeMirror view, as much of it as typing needs. */
type View = {
  state: {
    readOnly: boolean;
    replaceSelection(text: string): object;
  };
  dispatch(spec: object): void;
};

/**
 * Types `text` as a key would: into each selection, as user input, and
 * not into a read-only cell. JupyterLab's `replaceSelection` writes to the
 * model at the first cursor only, and ignores read-only.
 */
export function typeText(
  editor: { replaceSelection?(text: string): void; editor?: unknown } | null | undefined,
  text: string,
) {
  const view = editor?.editor as View | undefined;
  if (view?.state && typeof view.dispatch === 'function') {
    if (view.state.readOnly) return;
    view.dispatch({
      ...view.state.replaceSelection(text),
      scrollIntoView: true,
      userEvent: 'input.type',
    });
  } else {
    editor?.replaceSelection?.(text);
  }
}
