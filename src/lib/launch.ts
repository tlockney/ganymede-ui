/**
 * What the page URL asks to open, as the Apple apps pass it for a window
 * opened on a file or folder: `open` names a notebook, `dir` the folder the
 * sidebar starts in (the notebook's folder when only `open` is given).
 * Both are server paths, relative to the server's root; a leading `/` is
 * dropped, so `/Users/me/a.ipynb` works against a server rooted at `/`.
 */
export type Launch = { open?: string; dir: string };

/** A server path: no leading, trailing or repeated slashes. */
const clean = (path: string) => path.split('/').filter(Boolean).join('/');

/** The folder a server path is in; '' for the root. */
export const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');

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

/**
 * The query parameters the app reads once and then removes from the URL.
 * `open` stays: the app keeps it in step with the open notebook, so a
 * reload comes back to it.
 */
export const LAUNCH_PARAMS = ['token', 'kernels', 'dir'] as const;

/** `search` with `open` set to `path`, or removed when there is none. */
export function withOpen(search: string, path?: string): string {
  const params = new URLSearchParams(search);
  if (path) params.set('open', path);
  else params.delete('open');
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/** The window title for an open notebook, or the app's name. */
export function titleFor(path?: string): string {
  const name = path
    ?.split('/')
    .pop()
    ?.replace(/\.ipynb$/, '');
  return name || 'Ganymede';
}

/**
 * Whether this page load is a reload. A reload keeps `open` (see
 * `withOpen`) but is not a window newly opened on one file, so it keeps the
 * usual layout.
 */
export function isReload(): boolean {
  try {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    return nav?.type === 'reload';
  } catch {
    return false;
  }
}
