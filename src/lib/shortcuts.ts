import { CommandRegistry } from '@lumino/commands';

/**
 * Every keyboard shortcut the app binds, in one table: the notebook's
 * commands (JupyterLab's defaults, bound in `createCommands` and
 * `attachEditing`), find, and the app's own. Keys are Lumino keystrokes
 * ("Accel" is ⌘ on a Mac, Ctrl elsewhere); a shortcut can have several
 * bindings, and a binding can be a sequence ("D D"). Where a shortcut
 * applies (edit mode, command mode) is up to the code that binds it.
 */
export type ShortcutGroup = 'Notebook' | 'Command mode' | 'Edit mode' | 'App';

export type Shortcut = {
  /** The command id it runs. */
  id: string;
  label: string;
  group: ShortcutGroup;
  keys: readonly (readonly string[])[];
};

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: 'run-and-advance',
    label: 'Run cell, select below',
    group: 'Notebook',
    keys: [['Shift Enter']],
  },
  { id: 'run-cell', label: 'Run cell', group: 'Notebook', keys: [['Accel Enter']] },
  {
    id: 'run-and-insert',
    label: 'Run cell, insert below',
    group: 'Notebook',
    keys: [['Alt Enter']],
  },
  { id: 'find', label: 'Find', group: 'Notebook', keys: [['Accel F']] },
  { id: 'find-next', label: 'Find next', group: 'Notebook', keys: [['Accel G']] },
  { id: 'find-previous', label: 'Find previous', group: 'Notebook', keys: [['Accel Shift G']] },

  { id: 'edit-mode', label: 'Edit cell', group: 'Command mode', keys: [['Enter']] },
  {
    id: 'select-above',
    label: 'Select cell above',
    group: 'Command mode',
    keys: [['ArrowUp'], ['K']],
  },
  {
    id: 'select-below',
    label: 'Select cell below',
    group: 'Command mode',
    keys: [['ArrowDown'], ['J']],
  },
  {
    id: 'extend-above',
    label: 'Extend selection above',
    group: 'Command mode',
    keys: [['Shift ArrowUp'], ['Shift K']],
  },
  {
    id: 'extend-below',
    label: 'Extend selection below',
    group: 'Command mode',
    keys: [['Shift ArrowDown'], ['Shift J']],
  },
  { id: 'select-all', label: 'Select all cells', group: 'Command mode', keys: [['Accel A']] },
  { id: 'insert-above', label: 'Insert cell above', group: 'Command mode', keys: [['A']] },
  { id: 'insert-below', label: 'Insert cell below', group: 'Command mode', keys: [['B']] },
  { id: 'delete', label: 'Delete cells', group: 'Command mode', keys: [['D', 'D']] },
  { id: 'cut', label: 'Cut cells', group: 'Command mode', keys: [['X']] },
  { id: 'copy', label: 'Copy cells', group: 'Command mode', keys: [['C']] },
  { id: 'paste', label: 'Paste cells below', group: 'Command mode', keys: [['V']] },
  { id: 'undo', label: 'Undo cell operation', group: 'Command mode', keys: [['Z']] },
  { id: 'redo', label: 'Redo cell operation', group: 'Command mode', keys: [['Shift Z']] },
  { id: 'move-up', label: 'Move cells up', group: 'Command mode', keys: [['Ctrl Shift ArrowUp']] },
  {
    id: 'move-down',
    label: 'Move cells down',
    group: 'Command mode',
    keys: [['Ctrl Shift ArrowDown']],
  },
  { id: 'to-code', label: 'Change to code', group: 'Command mode', keys: [['Y']] },
  { id: 'to-markdown', label: 'Change to Markdown', group: 'Command mode', keys: [['M']] },
  { id: 'to-raw', label: 'Change to raw', group: 'Command mode', keys: [['R']] },
  { id: 'show-shortcuts', label: 'Show keyboard shortcuts', group: 'Command mode', keys: [['H']] },

  { id: 'command-mode', label: 'Command mode', group: 'Edit mode', keys: [['Escape'], ['Ctrl M']] },
  { id: 'completer:invoke', label: 'Complete', group: 'Edit mode', keys: [['Tab']] },
  { id: 'tooltip:launch', label: 'Show documentation', group: 'Edit mode', keys: [['Shift Tab']] },

  { id: 'save', label: 'Save', group: 'App', keys: [['Accel S']] },
];

export const GROUPS: readonly ShortcutGroup[] = ['Notebook', 'Command mode', 'Edit mode', 'App'];

/**
 * Dispatched on `window` to open the shortcuts dialog: by the notebook's
 * command, and by the Apple apps' Help menu.
 */
export const SHOW_SHORTCUTS_EVENT = 'ganymede:show-shortcuts';

const byId = new Map(SHORTCUTS.map(s => [s.id, s]));

/** The key bindings of the shortcut `id`; none for an unknown id. */
export function keysFor(id: string): readonly (readonly string[])[] {
  return byId.get(id)?.keys ?? [];
}

/** A binding as this platform writes it: "⇧↩" on a Mac, "Shift+Enter" elsewhere. */
export function formatKeys(keys: readonly string[]): string {
  return keys.map(k => CommandRegistry.formatKeystroke(k)).join(' ');
}

/** Whether a keydown is one of the single-keystroke bindings of `id`. */
export function matches(event: KeyboardEvent, id: string): boolean {
  const pressed = CommandRegistry.keystrokeForKeydownEvent(event);
  if (!pressed) return false;
  return keysFor(id).some(
    keys => keys.length === 1 && CommandRegistry.normalizeKeystroke(keys[0]!) === pressed,
  );
}
