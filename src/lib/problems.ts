/**
 * What went wrong in an open notebook, said so that the user knows what
 * happened and what to do next (#213). The pane shows a {@link Problem} in
 * its notice, with a button for each of its actions.
 */
import { ServerConnection } from '@jupyterlab/services';

/** The next steps a notice offers, besides Dismiss. */
export type ProblemAction = 'restart' | 'retry' | 'pick-kernel' | 'save' | 'reload' | 'unlock';

export type ProblemKind =
  /** The kernel died: it crashed, ran out of memory, or was shut down. */
  | 'kernel-dead'
  /** The kernel's websocket closed and stopped trying to reconnect. */
  | 'connection-lost'
  /** A request never reached the server. */
  | 'unreachable'
  /** The file names a kernel that isn't installed, or there is none at all. */
  | 'missing-kernel'
  /** The file changed on disk, so saving is locked (#367). */
  | 'save-conflict'
  | 'save-failed'
  | 'rename-failed'
  /** Anything else the user asked for that failed. */
  | 'failed';

export type Problem = {
  kind: ProblemKind;
  /** What happened, in a sentence. */
  message: string;
  /** What the next step does, or what is safe; optional. */
  hint?: string;
  actions: ProblemAction[];
};

/** The buttons' labels. */
export const ACTION_LABEL: Record<ProblemAction, string> = {
  restart: 'Restart',
  retry: 'Retry',
  'pick-kernel': 'Pick a Kernel',
  save: 'Save',
  reload: 'Reload',
  unlock: 'Unlock',
};

export const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * The first hidden part of `path`: a folder or file name starting with
 * “.”. Servers don't open these, and a `jupyter_server` answers 404 for
 * them as for a missing file (#337).
 */
export function hiddenPart(path: string): string | undefined {
  return path.split('/').find(p => p.startsWith('.') && p !== '.' && p !== '..');
}

/**
 * Why a file the user opened can't be shown: the error's own message.
 * Ganymede's server says “hidden path” for a hidden file that exists and
 * “no such file” for one that doesn't; other servers say “not found” for
 * both, so a “not found” under a hidden part adds that the server may be
 * refusing it (#390).
 */
export function openFailure(path: string, e: unknown, notFound: boolean): string {
  const message = messageOf(e);
  const hidden = notFound ? hiddenPart(path) : undefined;
  if (hidden === undefined || /hidden/i.test(message)) return message;
  const name = path.split('/').pop() ?? path;
  const why =
    hidden === name
      ? 'it is a hidden file: rename it without the leading dot'
      : `it is in the hidden folder “${hidden}”: move it out`;
  return `${message.replace(/[.\s]*$/, '')}. If the file is there, the server may be refusing it because ${why} to open it here.`;
}

/**
 * Whether `e` means the request never got an answer: the server is down,
 * the network is, or (in a browser) the request was blocked. `fetch` says
 * so with a `TypeError` whose message differs by browser; the services
 * package wraps it in `ServerConnection.NetworkError`.
 */
export function isUnreachable(e: unknown): boolean {
  if (e instanceof ServerConnection.NetworkError) return true;
  return (
    e instanceof TypeError &&
    /failed to fetch|networkerror|network error|load failed|network connection was lost/i.test(
      e.message,
    )
  );
}

/**
 * Whether `e` is a failed dynamic `import()`: one of the page's own
 * chunks didn't load, so the page is older than the files the server (or
 * the service worker's cache) now has, as after an app update (#364). The
 * module map remembers the failure, so only a reload recovers. Each
 * engine words it differently.
 */
export function isStaleBundle(e: unknown): boolean {
  return (
    e instanceof Error &&
    /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|unable to preload css/i.test(
      e.message,
    )
  );
}

/** The kernel stopped. `kernel` is its display name, if known. */
export function kernelDead(kernel?: string): Problem {
  return {
    kind: 'kernel-dead',
    message: `The ${kernel ? `${kernel} ` : ''}kernel stopped. It may have crashed or run out of memory.`,
    hint: 'Restart it to keep working. Variables from before are gone; run the cells again.',
    actions: ['restart'],
  };
}

/** The kernel's connection gave up reconnecting. */
export function connectionLost(): Problem {
  return {
    kind: 'connection-lost',
    message: 'Lost the connection to the kernel.',
    hint: 'The server may have stopped, or the network dropped. Retry once it is back.',
    actions: ['retry'],
  };
}

/** The server couldn't be reached to do `what` ("save Io.ipynb"). */
export function unreachable(what: string, retry = true): Problem {
  return {
    kind: 'unreachable',
    message: `Couldn’t reach the server to ${what}.`,
    hint: 'Check that it is running and the network is up, then try again.',
    actions: retry ? ['retry'] : [],
  };
}

/**
 * Running needs a kernel the file doesn't have here: `missing` is the
 * display name of the one it asks for, or none when there is no kernel to
 * start at all.
 */
export function missingKernel(fileName: string, missing?: string): Problem {
  return {
    kind: 'missing-kernel',
    message: missing
      ? `${fileName} uses ${missing}, which isn’t installed here.`
      : 'There is no kernel to run this notebook.',
    hint: 'Pick a kernel to run it.',
    actions: ['pick-kernel'],
  };
}

/**
 * The file changed on disk since it was opened or last saved here, so
 * saving is locked until the user reloads it or unlocks (#367). `dirty`:
 * there are edits here that a reload drops.
 */
export function changedOnDisk(fileName: string, dirty: boolean): Problem {
  return {
    kind: 'save-conflict',
    message: `${fileName} changed on disk. Saving is locked, so this copy doesn’t replace it.`,
    hint: dirty
      ? 'Reload to open the new version (your unsaved edits here are dropped), or Unlock to save this copy over it.'
      : 'Reload to open the new version, or Unlock to save this copy over it.',
    actions: ['reload', 'unlock'],
  };
}

/** A save (or autosave) of `fileName` failed with `e`. */
export function saveFailed(fileName: string, e: unknown, auto = false): Problem {
  const verb = auto ? 'autosave' : 'save';
  const hint = 'Your edits are still here. Retry, or download a copy.';
  if (isUnreachable(e)) return { ...unreachable(`${verb} ${fileName}`), kind: 'save-failed', hint };
  return {
    kind: 'save-failed',
    message: `Couldn’t ${verb} ${fileName}: ${messageOf(e)}`,
    hint,
    actions: ['retry'],
  };
}

/**
 * Doing `what` ("restart the kernel") failed with `e`. `retry` offers
 * Retry, for a caller that has something to run again.
 */
export function failed(
  what: string,
  e: unknown,
  { retry = false, kind = 'failed' }: { retry?: boolean; kind?: ProblemKind } = {},
): Problem {
  if (isUnreachable(e)) return { ...unreachable(what, retry), kind };
  return { kind, message: `Couldn’t ${what}: ${messageOf(e)}`, actions: retry ? ['retry'] : [] };
}
