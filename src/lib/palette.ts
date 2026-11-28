import { SHORTCUTS, formatKeys, keysFor } from './shortcuts';
import { EXPORT_FORMATS, EXPORT_LABELS } from './export';
import { DEVICE_LABEL, DEVICE_MARK } from './kernel-device';

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
  /** Accessible name when different from `label` (such as the ◆ device mark). */
  ariaLabel?: string;
  /** Tooltip text, if any. */
  title?: string;
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
  kernels: { name: string; displayName: string; device?: boolean }[];
  /** The running kernel's name, if any. */
  kernel?: string;
  /** Recent notebooks, newest first. */
  recents: string[];
  /** Recent DuckDB consoles, most recent first (#735); the one shown is left out. */
  consoles?: { id: string; name: string; folder: string }[];
  /** Whether the open notebook shows as a journal (#184). */
  journal?: boolean;
  /** Whether the open notebook is read-only because another server owns it (#839). */
  readOnly?: boolean;
  /** Whether the open notebook is trusted. */
  trusted: boolean;
  /** Whether the backend keeps host API grants (a Ganymede server). */
  hostGrants?: boolean;
  /** Whether the backend publishes and exports notebooks (a server). */
  publish?: boolean;
  /** Whether the server can run the notebook with parameters. */
  runParams?: boolean;
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
  // Listed below, one of them with a prompt.
  'go-to-definition',
  'rename-symbol',
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

const READ_ONLY_SHORTCUTS = new Set([
  'select-above',
  'select-below',
  'extend-above',
  'extend-below',
  'select-all',
  'copy',
  'find',
  'find-next',
  'find-previous',
]);

/** Every entry for `context`, in the palette's order. Pure but for the user's key bindings. */
export function paletteEntries(context: PaletteContext): PaletteEntry[] {
  const open = !!context.path;
  const readOnly = !!context.readOnly;
  // The journal view hides the cells; a read-only notebook edits and runs none (#839).
  const cells = open && !context.journal;
  const editCells = cells && !readOnly;
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
    app('open-examples', 'Open Example Notebooks', 'File', {
      arg: context.folder,
      disabled: !context.connected,
    }),
    app('new-duckdb-console', 'New DuckDB Console', 'File', {
      arg: context.folder,
      disabled: !context.connected,
    }),
    // The console's name and folder tell two of them apart, and filter (#735).
    ...(context.consoles ?? []).map(c =>
      app('open-console', `Open Recent Console: ${c.name}`, `Console · ${c.folder || '/'}`, {
        arg: c.id,
        disabled: !context.connected,
      }),
    ),
    ...(context.consoles?.length
      ? [app('clear-recent-consoles', 'Clear Recent Consoles', 'File')]
      : []),
    app('save', 'Save', 'File', { disabled: !open || readOnly }),
    app('rename', 'Rename Notebook…', 'File', {
      prompt: 'New name',
      initial: context.path ? nameOf(context.path) : undefined,
      disabled: !open || readOnly,
    }),
    app('download', 'Download Notebook', 'File', { disabled: !open }),
    app('publish', 'Publish as Web Page…', 'File', { disabled: !open || !context.publish }),
    ...EXPORT_FORMATS.map(f =>
      app('export', EXPORT_LABELS[f], 'File', { arg: f, disabled: !open || !context.publish }),
    ),
    app('trust', 'Trust Notebook', 'File', { disabled: !open || context.trusted }),
    app('notebook-access', 'Notebook Access…', 'File', {
      disabled: !open || !context.hostGrants,
    }),
    app('run-all', 'Run All Cells', 'Cell', { disabled: !editCells }),
    app('run-with-params', 'Run with Parameters…', 'Cell', {
      disabled: !open || readOnly || !context.runParams,
    }),
    app('clear-outputs', 'Clear All Outputs', 'Cell', { disabled: !editCells }),
    app('insert-code', 'Insert Code Cell', 'Cell', { disabled: !editCells }),
    app('insert-markdown', 'Insert Markdown Cell', 'Cell', { disabled: !editCells }),
    app('expand-source', 'Expand Source', 'Cell', { disabled: !cells }),
    app('interrupt', 'Interrupt Kernel', 'Kernel', { disabled: !open }),
    app('restart', 'Restart Kernel', 'Kernel', { disabled: !open }),
    ...context.kernels.map(k =>
      app(
        'change-kernel',
        `Change Kernel to ${k.device ? `${k.displayName} ${DEVICE_MARK}` : k.displayName}`,
        'Kernel',
        {
          arg: k.name,
          disabled: !open || readOnly || k.name === context.kernel,
          ...(k.device
            ? {
                ariaLabel: `Change Kernel to ${k.displayName}, ${DEVICE_LABEL}`,
                title: DEVICE_LABEL,
              }
            : {}),
        },
      ),
    ),
    ...SHORTCUTS.filter(s => !LEFT_OUT.has(s.id)).map(s =>
      app(s.id, sentence(s.label), s.group === 'Notebook' ? 'Cell' : s.group, {
        disabled: READ_ONLY_SHORTCUTS.has(s.id) ? !cells : !editCells,
      }),
    ),
    ...context.recents
      .filter(p => p !== context.path)
      // The folder tells two notebooks of one name apart, and filters.
      .map(p => app('open', `Open ${nameOf(p)}`, recentGroup(p), { arg: p, keys: '' })),
    // Through the kernel's language service (#676); F12 and F2 in a cell by default.
    app('go-to-definition', 'Go to Definition', 'Cell', { disabled: !cells }),
    app('rename-symbol', 'Rename Symbol…', 'Cell', { disabled: !editCells, prompt: 'New name' }),
    app('toggle-journal', context.journal ? 'Open as Notebook' : 'View as Journal', 'View', {
      disabled: !open,
    }),
    app('toggle-variables', 'Show or Hide Variables', 'View', { disabled: !open }),
    // Switches type errors on or off (#669); the page remembers which.
    app('toggle-type-errors', 'Show or Hide Type Errors', 'View'),
    // Switches the live Markdown preview on or off (#672); the page remembers which.
    app('toggle-live-markdown', 'Show or Hide Live Markdown Preview', 'View'),
    // Wraps long lines in cells instead of scrolling them sideways (#813); the page remembers which.
    app('toggle-wrap-code', 'Wrap Code', 'View'),
    app('show-shortcuts', 'Keyboard Shortcuts', 'Help'),
    app('show-settings', 'Settings…', 'App'),
    app('connect', 'Connect to a Server…', 'App'),
  ];
  return entries;
}

/** "Recent", with the notebook's folder when it has one. */
function recentGroup(path: string): string {
  const folder = path.split('/').slice(0, -1).join('/');
  return folder ? `Recent · ${folder}` : 'Recent';
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
