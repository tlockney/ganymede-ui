import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection, ServiceManager } from '@jupyterlab/services';

/**
 * Where notebooks, kernels and sessions come from.
 *
 * The UI only ever talks to a `ServiceManager.IManager`, so anything that can
 * produce one is a backend: a Ganymede server over REST and websocket, or an
 * in-browser JupyterLite server whose kernels run in Web Workers. A future
 * cdp-kernel Worker target plugs in as one more JupyterLite kernel, or as a
 * backend of its own once Ganymede's engine runs in the page.
 */
export type BackendConfig =
  | {
      kind: 'ganymede';
      /** Server origin; empty means this page's origin (the dev proxy). */
      url: string;
      token: string;
    }
  | {
      kind: 'browser';
    };

export type Backend = {
  config: BackendConfig;
  label: string;
  detail: string;
  services: ServiceManager.IManager;
};

export async function connect(config: BackendConfig): Promise<Backend> {
  if (config.kind === 'ganymede') {
    const base = (config.url || window.location.origin).replace(/\/+$/, '') + '/';
    const serverSettings = ServerConnection.makeSettings({
      baseUrl: base,
      wsUrl: base.replace(/^http/, 'ws'),
      token: config.token,
      appendToken: true,
      init: { credentials: config.url ? 'include' : 'same-origin' },
    });
    // Fail fast with a readable error instead of a hung kernel list.
    const res = await ServerConnection.makeRequest(base + 'api/status', {}, serverSettings);
    if (!res.ok) {
      throw new Error(
        res.status === 403 || res.status === 401
          ? 'The server refused the token.'
          : `The server answered ${res.status}.`,
      );
    }
    const services = new ServiceManager({ serverSettings });
    await services.ready;
    return {
      config,
      label: 'Ganymede',
      detail: config.url ? new URL(base).host : 'local server',
      services,
    };
  }
  // Loaded on demand: the in-browser server and its kernels are only
  // needed when this backend is picked.
  const { createLiteServices } = await import('./lite');
  const services = await createLiteServices();
  return {
    config,
    label: 'This browser',
    detail: 'JavaScript in a Web Worker',
    services,
  };
}

/**
 * Trust a notebook on the backend, so its HTML and JavaScript outputs render
 * when it is opened again. Ganymede signs the saved file
 * (`POST /api/contents/{path}/trust`, as jupyter_server); the browser
 * backend keeps no signatures, so trust lasts as long as the open notebook.
 */
export async function trustNotebook(backend: Backend, path: string): Promise<void> {
  if (backend.config.kind !== 'ganymede') return;
  const settings = backend.services.serverSettings;
  const url = URLExt.join(settings.baseUrl, 'api/contents', URLExt.encodeParts(path), 'trust');
  const res = await ServerConnection.makeRequest(url, { method: 'POST' }, settings);
  if (!res.ok) throw new Error(`The server answered ${res.status} to the trust request.`);
}

/**
 * Whether this page's own server already has us signed in. Opened from the
 * URL `ganymede serve` prints, the server trades the token for a login
 * cookie and redirects, so the page arrives with no token to read; the
 * cookie (and the `_xsrf` cookie the server sets with the page) is enough.
 */
export async function signedInHere(): Promise<boolean> {
  try {
    const res = await fetch(new URL('api/status', window.location.origin + '/'), {
      credentials: 'same-origin',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** This page's server, on its login cookie. */
export const SAME_ORIGIN: BackendConfig = { kind: 'ganymede', url: '', token: '' };

const KEY = 'ganymede-ui:backend';

export function loadConfig(): BackendConfig | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BackendConfig) : undefined;
  } catch {
    return undefined;
  }
}

export function saveConfig(config: BackendConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // Private mode: the choice lasts for this page only.
  }
}
