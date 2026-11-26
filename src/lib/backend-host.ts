import type { BackendConfig } from './backends';

/**
 * The host a Ganymede config names, in words: a connected machine's name,
 * the server's host, or "local server" for the page's own. The backend's
 * detail (`connect`) and the header's status line (#801) both use it, so
 * they say the same thing. Empty for the browser backend.
 */
export function hostLabel(config: BackendConfig): string {
  if (config.kind !== 'ganymede') return '';
  if (config.machine) return config.machineName ?? 'connected machine';
  if (!config.url) return 'local server';
  try {
    return new URL(config.url).host || config.url;
  } catch {
    return config.url;
  }
}
