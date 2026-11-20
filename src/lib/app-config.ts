import { type BackendConfig, loadConfig, machineFromSearch } from './backends';

/**
 * A token in the page URL, as `ganymede serve` prints it, wins once, and so
 * does `kernels=page`, `kernels=both` or `kernels=server`, which the Apple
 * apps add on every launch (`page` on an iPad without a kernel server,
 * `both` on the Mac). Pure, as React
 * may call a state initializer twice (#60); `stripLaunchParams` takes them
 * out of the URL afterwards.
 */
export function initialConfig(search: string = window.location.search): BackendConfig | undefined {
  const params = new URLSearchParams(search);
  const token = params.get('token');
  const kernels = params.get('kernels');
  // A connected machine's window (#701): the page's server is the app's
  // mount of that machine, whatever the page connected to last time. The
  // parameters stay in the URL, so a reload comes back to the machine.
  const machine = machineFromSearch(search);
  if (machine) return { kind: 'ganymede', url: '', token: '', ...machine };
  if (token === null && kernels === null) return loadConfig();
  return {
    kind: 'ganymede',
    url: '',
    token: token ?? '',
    ...(kernels === 'page' || kernels === 'both' ? { kernels } : {}),
  };
}

/** The Apple app's own server: the one this page came from. */
export function isAppServer(config: BackendConfig): boolean {
  return config.kind === 'ganymede' && config.url === '' && !config.machine;
}

/** Whether two configs reach the same notebooks, whatever the token. */
export function sameBackend(a: BackendConfig, b: BackendConfig): boolean {
  if (a.kind !== 'ganymede' || b.kind !== 'ganymede') return a.kind === b.kind;
  return a.url === b.url && a.kernels === b.kernels && a.machine === b.machine;
}
