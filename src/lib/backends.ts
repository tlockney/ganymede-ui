import { PageConfig } from '@jupyterlab/coreutils';
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

/**
 * jupyter-react reads the server from PageConfig and falls back to
 * Datalayer's hosted server when it is empty. Point it at ours.
 */
function setPageConfig(base: string, token: string) {
  PageConfig.setOption('baseUrl', base);
  PageConfig.setOption('wsUrl', base.replace(/^http/, 'ws'));
  PageConfig.setOption('token', token);
}

export async function connect(config: BackendConfig): Promise<Backend> {
  if (config.kind === 'ganymede') {
    const base = (config.url || window.location.origin).replace(/\/+$/, '') + '/';
    setPageConfig(base, config.token);
    const serverSettings = ServerConnection.makeSettings({
      baseUrl: base,
      wsUrl: base.replace(/^http/, 'ws'),
      token: config.token,
      appendToken: true,
      init: { credentials: config.url ? 'include' : 'same-origin' },
    });
    // Fail fast with a readable error instead of a hung kernel list.
    const res = await ServerConnection.makeRequest(
      base + 'api/status',
      {},
      serverSettings,
    );
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
  // The in-browser server answers at this page's origin.
  setPageConfig(window.location.origin + '/', '');
  // Loaded on demand: the in-browser server and its kernels are large.
  const { createLiteServiceManager } = await import('@datalayer/jupyter-react');
  const services = await createLiteServiceManager(
    import('@datalayer/jupyter-react/lite/javascript-kernel-extension'),
  );
  await services.ready;
  return {
    config,
    label: 'This browser',
    detail: 'JavaScript in a Web Worker',
    services,
  };
}

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
