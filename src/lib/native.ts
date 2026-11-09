import type { KernelSpec, Session } from '@jupyterlab/services';
import type { SearchState } from './search';
import type { OutlineItem } from './outline';
import type { VariableNode, VariablesState } from './useVariables';
/**
 * The Mac app's document window (#132): the page tells it which notebook is
 * open and whether it has unsaved edits, through the `document` script
 * message handler the app registers, and the app asks the page to save
 * (File > Save, and before a window closes or the app quits) through
 * `window.ganymede.save()`. In a browser there is no handler and these do
 * nothing.
 */

/** What the page posts: the notebook's path on the server, or null. */
export type DocumentMessage = { path: string | null; dirty: boolean };

/**
 * What the app calls. `save` saves the open notebook; true when it is
 * saved. `command` runs one of the page's commands (#205): an id from
 * `PAGE_COMMANDS` or the shortcuts table, with an argument for those that
 * take one; false when the page has no such command or nothing to run it on.
 */
export type NativeHooks = {
  save(): Promise<boolean>;
  command(id: string, arg?: string): Promise<boolean>;
  /** A call that answers with a value: the agent's settings for the app (#210, `native-agent.ts`). */
  call(id: string, arg?: string): Promise<unknown>;
};

/**
 * The commands the page runs for the app beside the notebook's own (the
 * shortcuts table's ids, such as `run-cell` or `move-up`). Those marked
 * `arg` take one: a path, a folder, a new name, a cell type or a kernel
 * name. `shutdown-kernel` takes a running session's id or its notebook's
 * path; `shutdown-others` shuts down every kernel but the open notebook's.
 * `search` takes a `SearchRequest` as JSON (an empty query ends it), and
 * `clear-recents` empties the Recents list (#240). `refresh-kernels` asks
 * the server for its kernelspecs again (#350). `go-to-cell` takes a
 * cell's index, as `PageState.outline` gives it (#212).
 * `watch-memory` takes `on` or `off`: whether the app's Running list shows,
 * so the page asks the server for each kernel's memory and posts it in
 * `RunningSession.memory` (#241).
 * `open-examples` copies the example notebooks into a new folder in the
 * folder it takes, and opens the first (#414).
 * `inspect-variables` takes `on` or `off`: whether the app's inspector
 * shows the Variables view, so the page reads the variables and posts them
 * as `PageState.variables` (#249). `toggle-variable` expands or collapses
 * a row: its `path`, as JSON.
 */
export const PAGE_COMMANDS = {
  open: 'arg',
  close: '',
  rename: 'arg',
  'shutdown-kernel': 'arg',
  'shutdown-others': '',
  'new-notebook': 'arg',
  'open-examples': 'arg',
  save: '',
  download: '',
  trust: '',
  run: '',
  'run-all': '',
  interrupt: '',
  restart: '',
  'insert-code': '',
  'insert-markdown': '',
  'cell-type': 'arg',
  'change-kernel': 'arg',
  'show-shortcuts': '',
  'show-settings': '',
  'command-palette': '',
  'toggle-variables': '',
  connect: '',
  search: 'arg',
  'clear-recents': '',
  'refresh-kernels': '',
  'file-moved': 'arg',
  'go-to-cell': 'arg',
  'watch-memory': 'arg',
  'inspect-variables': 'arg',
  'toggle-variable': 'arg',
} as const;

/** What the app's sidebar searches for (#240): the `search` command's argument. */
export type SearchRequest = {
  query: string;
  /** The folder to search in and below, as a server path; '' for the root. */
  dir?: string;
  /** Also search what the notebooks say. */
  contents?: boolean;
};

/** The `search` command's argument, or null when it isn't one. */
export function searchRequest(arg: string | undefined): SearchRequest | null {
  if (!arg) return null;
  try {
    const value: unknown = JSON.parse(arg);
    if (!value || typeof value !== 'object') return null;
    const { query, dir, contents } = value as Record<string, unknown>;
    if (typeof query !== 'string') return null;
    return {
      query,
      dir: typeof dir === 'string' ? dir.replace(/^\/+|\/+$/g, '') : '',
      contents: contents === true,
    };
  } catch {
    return null;
  }
}

/**
 * The `file-moved` command's argument: a file or folder the app renamed
 * (`to`) or deleted (`to: null`) itself, not through the contents API, so
 * the page's Recents follow it (#240). Null when it isn't one.
 */
export function fileMove(arg: string | undefined): { from: string; to: string | null } | null {
  if (!arg) return null;
  try {
    const value: unknown = JSON.parse(arg);
    if (!value || typeof value !== 'object') return null;
    const { from, to } = value as Record<string, unknown>;
    if (typeof from !== 'string' || !from) return null;
    if (to !== null && (typeof to !== 'string' || !to)) return null;
    return { from, to };
  } catch {
    return null;
  }
}

/**
 * What the page posts to the app's `state` handler whenever any of it
 * changes, so native toolbars and menus can show and enable themselves.
 */
export type PageState = {
  /** The open notebook's server path, or null. */
  path: string | null;
  dirty: boolean;
  /** The kernel's state, as the toolbar's subtitle shows it; null with no notebook open. */
  status: string | null;
  /** The running kernel or the one the first run starts, by name. */
  kernel: string | null;
  /** That kernel's display name, or what the file asks for when it isn't installed. */
  kernelDisplayName: string | null;
  /** True when the file's kernel isn't installed here. */
  kernelMissing: boolean;
  trusted: boolean;
  /** The active cell's type. */
  cellType: string | null;
  /** The kernels a notebook can switch to. */
  kernels: { name: string; displayName: string }[];
  /** Where kernels run: the backend's label and detail, or null before it connects. */
  backend: { label: string; detail: string } | null;
  /** The backend's running sessions: each notebook with a kernel (#225). */
  running: RunningSession[];
  /** The notebooks opened last on this backend, newest first (#240). */
  recents: string[];
  /** The app's sidebar search and what it found, or null with none (#240). */
  search: PageSearch | null;
  /** The open notebook's headings, for the app's Outline (#212); empty with none. */
  outline: OutlineItem[];
  /** The kernel's variables while the app's inspector shows them (#249), or null. */
  variables: PageVariables | null;
};

/** The Variables view's rows, flattened in order, for the app's inspector (#249). */
export type PageVariables = {
  state: VariablesState['kind'];
  /** What went wrong, with `state` `error`. */
  message: string | null;
  rows: PageVariable[];
};

export type PageVariable = {
  name: string;
  type: string;
  value: string;
  /** Its names from the top: the `toggle-variable` command's argument. */
  path: string[];
  depth: number;
  /** It has members to show. */
  expandable: boolean;
  expanded: boolean;
};

/** `PageState.variables` from the Variables hook's state. Pure. */
export function pageVariables(
  state: VariablesState,
  expanded: (node: VariableNode) => boolean,
): PageVariables {
  const rows: PageVariable[] = [];
  const add = (nodes: VariableNode[], depth: number) => {
    for (const node of nodes) {
      const open = !!node.variablesReference && expanded(node);
      rows.push({
        name: node.name,
        type: node.type,
        value: node.value,
        path: node.path,
        depth,
        expandable: !!node.variablesReference,
        expanded: open,
      });
      if (open && node.children) add(node.children, depth + 1);
    }
  };
  if (state.kind === 'ready') add(state.variables, 0);
  return { state: state.kind, message: state.kind === 'error' ? state.message : null, rows };
}

/** The `toggle-variable` command's argument: a row's path, or null when it isn't one. */
export function variablePath(arg: string | undefined): string[] | null {
  if (!arg) return null;
  try {
    const value: unknown = JSON.parse(arg);
    if (!Array.isArray(value) || !value.length) return null;
    return value.every(v => typeof v === 'string') ? (value as string[]) : null;
  } catch {
    return null;
  }
}

/** A sidebar search's results, as the page's sidebar shows them (#215, #240). */
export type PageSearch = {
  query: string;
  matches: { path: string; name: string; type: string; snippet: string | null }[];
  searching: boolean;
  /** A limit stopped the search short. */
  truncated: boolean;
  error: string | null;
  /**
   * Whether the app can open a file that isn't a notebook: only from its
   * own server, as the page's sidebar offers it (`editsFiles`).
   */
  opensFiles: boolean;
};

/** `PageState.search` from the search hook's state, for `query`. */
export function pageSearch(
  query: string,
  state: SearchState,
  opensFiles = false,
): PageSearch | null {
  if (!query.trim()) return null;
  return {
    query,
    opensFiles,
    matches: state.matches.map(m => ({
      path: m.item.path,
      name: m.item.name,
      type: m.item.type,
      snippet: m.snippet ?? null,
    })),
    searching: state.searching,
    truncated: state.truncated,
    error: state.error ?? null,
  };
}

export type RunningSession = {
  id: string;
  /** The notebook's server path. */
  path: string;
  /** The kernel's display name, or its name when it has no spec here. */
  kernel: string | null;
  /** The kernel's execution state as the server last reported it, or null. */
  state: string | null;
  /** The kernel's id, for its log (#248), or null with no kernel. */
  kernelId: string | null;
  /**
   * The kernel's memory in bytes while the app's Running list asks for it
   * (#241); null otherwise, or when the server can't say.
   */
  memory: number | null;
};

/** `PageState.running` from the backend's sessions. */
export function runningSessions(
  sessions: Iterable<Session.IModel>,
  specs?: KernelSpec.ISpecModels | null,
  memory?: ReadonlyMap<string, number>,
): RunningSession[] {
  return [...sessions].map(s => {
    const name = s.kernel?.name;
    return {
      id: s.id,
      path: s.path,
      kernel: name ? (specs?.kernelspecs[name]?.display_name ?? name) : null,
      state: (s.kernel as { execution_state?: string } | null)?.execution_state ?? null,
      kernelId: s.kernel?.id ?? null,
      memory: (s.kernel && memory?.get(s.kernel.id)) ?? null,
    };
  });
}

declare global {
  interface Window {
    ganymede?: NativeHooks;
  }
}

type MessageHandler = { postMessage(message: unknown): void };

function handler(name: string): MessageHandler | undefined {
  const webkit = (globalThis as { webkit?: { messageHandlers?: Record<string, MessageHandler> } })
    .webkit;
  return webkit?.messageHandlers?.[name];
}

export function postDocument(message: DocumentMessage): void {
  handler('document')?.postMessage(message);
}

/**
 * The tabs of the Apple apps' Settings (#332): the app keeps the agent's
 * settings, the keyboard shortcuts and where kernels run in one place.
 */
export type SettingsTab =
  'general' | 'appearance' | 'kernels' | 'remotes' | 'agent' | 'shortcuts' | 'device';

/**
 * Asks the app to show its Settings at `tab`; false in a browser, which
 * has no `settings` handler, so the page shows its own sheet instead.
 */
export function showAppSettings(tab: SettingsTab): boolean {
  const h = handler('settings');
  if (!h) return false;
  h.postMessage(tab);
  return true;
}

/** Tells the app what it shows: see `PageState`. */
export function postState(state: PageState): void {
  handler('state')?.postMessage(state);
}

/**
 * Whether the app draws the sidebar, toolbar and menus itself (#205): it
 * loads the page with `chrome=native`, and the page then shows only the
 * notebook. The parameter stays in the URL, so a reload keeps it.
 */
export function nativeChrome(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get('chrome') === 'native';
}

/**
 * Whether the app opens text files in its own editor (#122): the Mac and
 * iPad apps register an `openFile` handler, a browser has none.
 */
export function canOpenFiles(): boolean {
  return !!handler('openFile');
}

/** Asks the app to open the file at `path` on its server in its editor. */
export function openFile(path: string): void {
  handler('openFile')?.postMessage({ path });
}

/** Exposes `hooks` to the app until the returned function is called. */
export function exposeHooks(hooks: NativeHooks): () => void {
  window.ganymede = hooks;
  return () => {
    if (window.ganymede === hooks) delete window.ganymede;
  };
}
