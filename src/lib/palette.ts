import { SHORTCUTS, formatKeys, keysFor } from './shortcuts';

/**
 * The command palette's entries (#211): every command in the shortcuts
 * table that makes sense outside a cell editor, the app's own (save,
 * rename, new notebook, kernels), and the recent notebooks to open. Each
 * runs as the app's menus run it, through the page's `command(id, arg)`.
 */
export type PaletteEntry = {
  /** The page command it runs. */
  id: string;
  /** Its argument, if fixed. */
  arg?: string;
  label: string;
  /** Where it belongs, shown beside it. */
  group: string;
  /** Its first binding, as this platform writes it; '' with none. */
  keys: string;
  /**
   * Asks for text first (a new name), shown as the field's placeholder;
   * the text becomes the argument.
   */
  prompt?: string;
  /** Typed text to start that prompt with. */
  initial?: string;
  /** Why it can't run now; it is listed but can't be picked. */
  disabled?: boolean;
};

/** What the entries depend on. */
export type PaletteContext = {
  /** The open notebook's path, if any. */
  path?: string;
  /** The folder new notebooks go in ('' for the root). */
  folder: string;
  /** The kernels a notebook can switch to. */
  kernels: { name: string; displayName: string }[];
  /** The running kernel's name, if any. */
  kernel?: string;
  /** Recent notebooks, newest first. */
  recents: string[];
  /** Whether the open notebook is trusted. */
  trusted: boolean;
  /** Whether a backend is connected. */
  connected: boolean;
};

/**
 * The shortcuts table's commands the palette leaves out: those that only
 * make sense in a cell editor, and those it lists as its own.
 */
const LEFT_OUT = new Set([
  'edit-mode',
  'command-mode',
  'completer:invoke',
  'tooltip:launch',
  'command-palette',
  'save',
  'show-shortcuts',
]);

const keysOf = (id: string) => {
  const first = keysFor(id)[0];
  return first ? formatKeys(first) : '';
};

const nameOf = (path: string) =>
  path
    .split('/')
    .pop()!
    .replace(/\.ipynb$/, '');

/** Every entry for `context`, in the palette's order. Pure but for the user's key bindings. */
export function paletteEntries(context: PaletteContext): PaletteEntry[] {
  const open = !!context.path;
  const app = (
    id: string,
    label: string,
    group: string,
    more: Partial<PaletteEntry> = {},
  ): PaletteEntry => ({ id, label, group, keys: keysOf(id), ...more });

  const entries: PaletteEntry[] = [
    app('new-notebook', 'New Notebook', 'File', {
      arg: context.folder,
      disabled: !context.connected,
    }),
    app('save', 'Save', 'File', { disabled: !open }),
    app('rename', 'Rename Notebook…', 'File', {
      prompt: 'New name',
      initial: context.path ? nameOf(context.path) : undefined,
      disabled: !open,
    }),
    app('download', 'Download Notebook', 'File', { disabled: !open }),
    app('trust', 'Trust Notebook', 'File', { disabled: !open || context.trusted }),
    app('run-all', 'Run All Cells', 'Cell', { disabled: !open }),
    app('insert-code', 'Insert Code Cell', 'Cell', { disabled: !open }),
    app('insert-markdown', 'Insert Markdown Cell', 'Cell', { disabled: !open }),
    app('interrupt', 'Interrupt Kernel', 'Kernel', { disabled: !open }),
    app('restart', 'Restart Kernel', 'Kernel', { disabled: !open }),
    ...context.kernels.map(k =>
      app('change-kernel', `Change Kernel to ${k.displayName}`, 'Kernel', {
        arg: k.name,
        disabled: !open || k.name === context.kernel,
      }),
    ),
    ...SHORTCUTS.filter(s => !LEFT_OUT.has(s.id)).map(s =>
      app(s.id, sentence(s.label), s.group === 'Notebook' ? 'Cell' : s.group, {
        disabled: !open,
      }),
    ),
    ...context.recents
      .filter(p => p !== context.path)
      .map(p => app('open', `Open ${nameOf(p)}`, 'Recent', { arg: p, keys: '' })),
    app('show-shortcuts', 'Keyboard Shortcuts', 'Help'),
    app('show-settings', 'Settings…', 'App'),
    app('connect', 'Connect to a Server…', 'App'),
  ];
  return entries;
}

/** The shortcuts table's label with its first letter raised. */
function sentence(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The entries matching `query`, best first: every word of the query must
 * start a word of the label or group, or appear in the label. Entries
 * whose label starts with the query come first, then those where every
 * word starts a word, then the rest; ties keep the palette's order.
 */
export function filterEntries(entries: PaletteEntry[], query: string): PaletteEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return entries;
  const scored: { entry: PaletteEntry; score: number; index: number }[] = [];
  entries.forEach((entry, index) => {
    const label = entry.label.toLowerCase();
    const haystack = `${label} ${entry.group.toLowerCase()}`;
    const starts = haystack.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    let score = 0;
    for (const word of words) {
      if (starts.some(s => s.startsWith(word))) score += 2;
      else if (haystack.includes(word)) score += 1;
      else return;
    }
    if (label.startsWith(query.trim().toLowerCase())) score += 10;
    scored.push({ entry, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map(s => s.entry);
}
