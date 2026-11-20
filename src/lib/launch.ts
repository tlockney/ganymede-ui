/**
 * What the page URL asks to open, as the Apple apps pass it for a window
 * opened on a file or folder: `open` names a notebook, `dir` the folder the
 * sidebar starts in (the notebook's folder when only `open` is given).
 * Both are server paths, relative to the server's root; a leading `/` is
 * dropped, so `/Users/me/a.ipynb` works against a server rooted at `/`.
 * `console=duckdb` opens the DuckDB console on `dir` instead (#729): the
 * Mac app's console tabs.
 */
export type Launch = { open?: string; dir: string; console?: 'duckdb' };

/** A server path: no leading, trailing or repeated slashes. */
export const clean = (path: string) => path.split('/').filter(Boolean).join('/');

/** The folder a server path is in; '' for the root. */
export const parentOf = (path: string) => path.split('/').slice(0, -1).join('/');

/** Reads `open`, `dir` and `console` from a query string. Pure. */
export function readLaunch(search: string): Launch {
  const params = new URLSearchParams(search);
  const open = params.get('open');
  const dir = params.get('dir');
  const file = open ? clean(open) : '';
  return {
    ...(file ? { open: file } : {}),
    // A console has no notebook, so `open` doesn't mix with it.
    ...(params.get('console') === 'duckdb' && !file ? { console: 'duckdb' as const } : {}),
    dir: dir !== null ? clean(dir) : parentOf(file),
  };
}

/**
 * The query parameters the app reads once and then removes from the URL.
 * `open` and `dir` stay: the app keeps them in step with the open notebook
 * and the sidebar's folder, so a reload comes back to both. So does
 * `console`, so a reload of a console tab keeps its console (#729).
 */
export const LAUNCH_PARAMS = ['token', 'kernels'] as const;

/** `search` with `name` set to `value`, or removed when there is none. */
function withParam(search: string, name: string, value?: string): string {
  const params = new URLSearchParams(search);
  if (value) params.set(name, value);
  else params.delete(name);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

/** `search` with `open` set to `path`, or removed when there is none. */
export const withOpen = (search: string, path?: string) => withParam(search, 'open', path);

/**
 * `search` with `dir` set to `folder`, left out when `readLaunch` would
 * start there anyway (the open notebook's folder, or the root).
 */
export function withDir(search: string, folder: string): string {
  const without = withParam(search, 'dir');
  if (readLaunch(without).dir === folder) return without;
  const params = new URLSearchParams(without);
  params.set('dir', folder);
  return `?${params.toString()}`;
}

/**
 * The window title for an open notebook, or the app's name. A notebook on a
 * connected machine carries the machine's name (#701), so its tab can't be
 * taken for a local one.
 */
export function titleFor(path?: string, machine?: string): string {
  const name = path
    ?.split('/')
    .pop()
    ?.replace(/\.ipynb$/, '');
  if (!machine) return name || 'Ganymede';
  return name ? `${name} · ${machine}` : machine;
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
