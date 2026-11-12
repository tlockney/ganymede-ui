import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import type { Backend } from './backends';

/**
 * A notebook's host API grant (ganymede `/api/host/grants`): what its
 * cells may ask the server for through `jupyter.host()`. A key that is
 * set replaces the server's `[host]` default for that notebook. Paths
 * are API paths; `""` is the whole root.
 */
export type HostGrant = {
  read?: string[];
  edit_self?: boolean;
  run?: string[];
};

export type HostDefaults = Required<HostGrant>;

export type HostGrants = { path: string; grant: HostGrant; defaults: HostDefaults };

/** Whether `backend` can keep host API grants: only a Ganymede server can. */
export function hostGrantsAvailable(backend: Backend | undefined): boolean {
  return backend?.config.kind === 'ganymede' && backend.config.kernels !== 'page';
}

function url(backend: Backend, path: string): [string, ServerConnection.ISettings] {
  const settings = backend.services.contents.serverSettings;
  return [URLExt.join(settings.baseUrl, 'api/host/grants', URLExt.encodeParts(path)), settings];
}

async function answer(res: Response): Promise<HostGrants> {
  if (res.ok) return (await res.json()) as HostGrants;
  let message = `The server answered ${res.status}.`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // Not JSON: keep the status.
  }
  if (res.status === 404 && message.startsWith('The server answered')) {
    message = 'This server has no notebook access settings. They need a newer Ganymede.';
  }
  throw new Error(message);
}

/** The notebook's own grant and the server's defaults. */
export async function loadHostGrants(backend: Backend, path: string): Promise<HostGrants> {
  const [u, settings] = url(backend, path);
  return answer(await ServerConnection.makeRequest(u, { method: 'GET' }, settings));
}

/** Stores `grant` in place of the notebook's own; `{}` gives it the defaults. */
export async function saveHostGrant(
  backend: Backend,
  path: string,
  grant: HostGrant,
): Promise<HostGrants> {
  const [u, settings] = url(backend, path);
  const init = { method: 'PUT', body: JSON.stringify(grant) };
  return answer(await ServerConnection.makeRequest(u, init, settings));
}

/**
 * What the notebook asks for, from `metadata.ganymede.host.wants`, such
 * as `["notebooks.run"]`. It grants nothing; the sheet shows it.
 */
export function hostWants(metadata: unknown): string[] {
  const wants = (metadata as { host?: { wants?: unknown } } | undefined)?.host?.wants;
  return Array.isArray(wants) ? wants.filter((w): w is string => typeof w === 'string') : [];
}

/** A path list as one path per line, the root as `/`. */
export function pathsText(paths: string[]): string {
  return paths.map(p => (p === '' ? '/' : p)).join('\n');
}

/** Lines back to API paths: trimmed, no blanks, `/` the root. */
export function textPaths(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    const p = t.replace(/^\/+|\/+$/g, '');
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** How a path list reads in a sentence. */
export function describePaths(paths: string[]): string {
  if (paths.includes('')) return 'every notebook';
  if (paths.length === 0) return 'none';
  return paths.join(', ');
}

const READS = ['notebooks.list', 'notebooks.read', 'notebooks.search', 'notebooks.results'];
const SELF_EDITS = ['self.add', 'self.edit', 'self.delete'];

/**
 * What the notebook asks for (`wants`) that its grant doesn't give, in
 * the order it asks. Its own keys replace the server's defaults. A method
 * the server doesn't have is left out: no grant could give it.
 */
export function missingWants(wants: string[], { grant, defaults }: HostGrants): string[] {
  const read = grant.read ?? defaults.read;
  const run = grant.run ?? defaults.run;
  const editSelf = grant.edit_self ?? defaults.edit_self;
  return wants.filter(w => {
    if (READS.includes(w)) return read.length === 0;
    if (w === 'notebooks.run') return run.length === 0;
    if (SELF_EDITS.includes(w)) return !editSelf;
    return false;
  });
}
