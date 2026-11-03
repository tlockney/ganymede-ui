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
};

/**
 * The commands the page runs for the app beside the notebook's own (the
 * shortcuts table's ids, such as `run-cell` or `move-up`). Those marked
 * `arg` take one: a path, a folder, a cell type or a kernel name.
 */
export const PAGE_COMMANDS = {
  open: 'arg',
  'new-notebook': 'arg',
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
  connect: '',
} as const;

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
};

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
