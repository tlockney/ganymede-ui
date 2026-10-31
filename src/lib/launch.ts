/**
 * What the page URL asks to open, as the Apple apps pass it for a window
 * opened on a file or folder: `open` names a notebook, `dir` the folder the
 * sidebar starts in (the notebook's folder when only `open` is given).
 * Both are server paths, relative to the server's root; a leading `/` is
 * dropped, so `/Users/me/a.ipynb` works against a server rooted at `/`.
 */
export type Launch = { open?: string; dir: string };

const clean = (path: string) => path.replace(/^\/+/, '').replace(/\/+$/, '');
const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');

/** Reads `open` and `dir` from a query string. Pure. */
export function readLaunch(search: string): Launch {
  const params = new URLSearchParams(search);
  const open = params.get('open');
  const dir = params.get('dir');
  const file = open ? clean(open) : '';
  return {
    ...(file ? { open: file } : {}),
    dir: dir !== null ? clean(dir) : parentOf(file),
  };
}

/** The query parameters the app reads once and then removes from the URL. */
export const LAUNCH_PARAMS = ['token', 'kernels', 'open', 'dir'] as const;

/** The window title for an open notebook, or the app's name. */
export function titleFor(path?: string): string {
  const name = path
    ?.split('/')
    .pop()
    ?.replace(/\.ipynb$/, '');
  return name || 'Ganymede';
}
