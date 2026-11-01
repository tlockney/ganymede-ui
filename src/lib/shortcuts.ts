import { CommandRegistry } from '@lumino/commands';
import { DisposableDelegate, DisposableSet, type IDisposable } from '@lumino/disposable';

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

  {
    id: 'command-mode',
    label: 'Leave the cell (command mode)',
    group: 'Edit mode',
    keys: [['Escape'], ['Ctrl M']],
  },
  { id: 'completer:invoke', label: 'Complete', group: 'Edit mode', keys: [['Tab']] },
  { id: 'tooltip:launch', label: 'Show documentation', group: 'Edit mode', keys: [['Shift Tab']] },

  { id: 'save', label: 'Save', group: 'App', keys: [['Accel S']] },
];

export const GROUPS: readonly ShortcutGroup[] = ['Notebook', 'Command mode', 'Edit mode', 'App'];

/**
 * What each group's mode is and how to get there: single-letter shortcuts
 * work only outside a cell's editor, which is not obvious.
 */
export const GROUP_NOTES: Readonly<Partial<Record<ShortcutGroup, string>>> = {
  'Command mode':
    'When no cell is being edited: press Esc, or click beside the editor, to leave it. ' +
    'Letter keys act on the selected cells here, so M makes a cell Markdown.',
  'Edit mode':
    'While typing in a cell: press Enter or click into a code cell; double-click a Markdown cell.',
};

/**
 * Dispatched on `window` to open the shortcuts dialog: by the notebook's
 * command, and by the Apple apps' Help menu.
 */
export const SHOW_SHORTCUTS_EVENT = 'ganymede:show-shortcuts';

const byId = new Map(SHORTCUTS.map(s => [s.id, s]));

export type Keys = readonly (readonly string[])[];

/**
 * The user's own bindings, by command id, replacing that command's
 * defaults. Kept in local storage, so per origin; the Apple apps keep
 * their origin across launches.
 */
type Overrides = Readonly<Record<string, Keys>>;

const KEY = 'ganymede-ui:shortcuts';

function load(): Overrides {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!raw || typeof raw !== 'object') return {};
    const valid = Object.entries(raw as Record<string, unknown>).filter(
      ([id, keys]) =>
        byId.has(id) &&
        Array.isArray(keys) &&
        keys.every(k => Array.isArray(k) && k.length > 0 && k.every(s => typeof s === 'string')),
    );
    return Object.fromEntries(valid) as Overrides;
  } catch {
    return {};
  }
}

let overrides: Overrides = load();
const listeners = new Set<() => void>();

function update(next: Overrides) {
  overrides = next;
  try {
    if (Object.keys(next).length) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the change lasts for this page only.
  }
  listeners.forEach(l => l());
}

/** The key bindings of the shortcut `id`, the user's if set; none for an unknown id. */
export function keysFor(id: string): Keys {
  return overrides[id] ?? byId.get(id)?.keys ?? [];
}

export function isCustomized(id: string): boolean {
  return id in overrides;
}

/** The current overrides; a new object after every change. */
export function customizations(): Overrides {
  return overrides;
}

const sameKeys = (a: Keys, b: Keys) =>
  a.length === b.length &&
  a.every((k, i) => k.length === b[i]!.length && k.every((s, j) => same(s, b[i]![j]!)));
const same = (a: string, b: string) =>
  CommandRegistry.normalizeKeystroke(a) === CommandRegistry.normalizeKeystroke(b);

/** Bind `id` to `keys`; back to the defaults when they are the defaults. */
export function setKeys(id: string, keys: Keys): void {
  const shortcut = byId.get(id);
  if (!shortcut) return;
  const { [id]: _, ...rest } = overrides;
  update(sameKeys(keys, shortcut.keys) ? rest : { ...rest, [id]: keys });
}

/** Back to the defaults: for `id`, or for every shortcut. */
export function resetKeys(id?: string): void {
  if (id === undefined) {
    update({});
  } else if (isCustomized(id)) {
    const { [id]: _, ...rest } = overrides;
    update(rest);
  }
}

/** Call `listener` after every change; returns the unsubscribe. */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// As Lumino decides it.
const IS_MAC = /Mac/i.test(navigator.platform);

/** Groups whose shortcuts can fire on the same keydown. */
const overlap = (a: ShortcutGroup, b: ShortcutGroup) =>
  !((a === 'Command mode' && b === 'Edit mode') || (a === 'Edit mode' && b === 'Command mode'));

/**
 * Why `keys` can't be added to the shortcut `id`, or undefined if it can:
 * a plain character where text is typed, or a binding another shortcut
 * that can fire at the same time already has.
 */
export function problemWith(id: string, keys: readonly string[]): string | undefined {
  const shortcut = byId.get(id);
  if (!shortcut || !keys.length) return 'Not a shortcut.';
  const typed = shortcut.group !== 'Command mode';
  if (typed) {
    for (const k of keys) {
      const parts = CommandRegistry.parseKeystroke(k);
      // Shift alone still types: ⇧A is "A".
      if (!parts.ctrl && !parts.alt && !parts.cmd && parts.key.length === 1) {
        return `${formatKeys([k])} types a character in a cell; add ${IS_MAC ? '⌘, ⌃ or ⌥' : 'Ctrl or Alt'}.`;
      }
    }
  }
  if (keysFor(id).some(k => sameKeys([k], [keys]))) return undefined;
  const taken = SHORTCUTS.find(
    other =>
      overlap(shortcut.group, other.group) && keysFor(other.id).some(k => sameKeys([k], [keys])),
  );
  return taken && `${formatKeys(keys)} is already ${taken.label}.`;
}

/**
 * Add `commands`' bindings for the shortcuts `scopes` names, each in the
 * selectors given, and keep them in step with the user's changes. Dispose
 * to remove them.
 */
export function bindShortcuts(
  commands: CommandRegistry,
  scopes: readonly (readonly [id: string, selectors: readonly string[]])[],
): IDisposable {
  let bound = new DisposableSet();
  const bind = () => {
    bound.dispose();
    bound = new DisposableSet();
    for (const [id, selectors] of scopes) {
      for (const keys of keysFor(id)) {
        for (const selector of selectors) {
          bound.add(commands.addKeyBinding({ keys: [...keys], command: id, selector }));
        }
      }
    }
  };
  bind();
  const unsubscribe = subscribe(bind);
  return new DisposableDelegate(() => {
    unsubscribe();
    bound.dispose();
  });
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
