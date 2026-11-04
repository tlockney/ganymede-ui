import type { Backend } from './backends';

/**
 * Whether the first-run welcome (#214) was dismissed. Kept in local
 * storage, so per origin, as the other `ganymede-ui:*` settings; the Apple
 * apps keep their origin across launches.
 */
const KEY = 'ganymede-ui:onboarding';

/** Set on dismissal, so it holds for this page when storage is off. */
let dismissedHere = false;

export function onboardingDismissed(): boolean {
  if (dismissedHere) return true;
  try {
    return localStorage.getItem(KEY) === 'dismissed';
  } catch {
    return false;
  }
}

/** For tests: forget a dismissal kept only in this page. */
export function resetOnboardingForTests(): void {
  dismissedHere = false;
}

export function dismissOnboarding(): void {
  dismissedHere = true;
  try {
    localStorage.setItem(KEY, 'dismissed');
  } catch {
    // Private mode: dismissed for this page only.
  }
}

/** The server a backend's notebooks are on, as a sentence names it. */
function serverName(backend: Backend): string {
  if (backend.config.kind !== 'ganymede') return 'this device';
  if (!backend.config.url) return 'this app’s server';
  try {
    return new URL(backend.config.url).host;
  } catch {
    return backend.config.url;
  }
}

/** Where notebooks live, in a sentence. */
export function notebooksWhere(backend: Backend, folder: string): string {
  const where = folder ? `the folder “${folder.split('/').pop()}”` : 'the top folder';
  return backend.config.kind === 'browser'
    ? `Notebooks are files in ${where} of this browser’s storage, on this device.`
    : `Notebooks are files in ${where} on ${serverName(backend)}.`;
}

/** Where kernels run, in a sentence. */
export function kernelsWhere(backend: Backend): string {
  const { config } = backend;
  if (config.kind === 'browser' || config.kernels === 'page') {
    return 'Kernels run in this page, on this device.';
  }
  if (config.kernels === 'both') {
    return `Kernels run on ${serverName(backend)} or in this page, on this device; each notebook picks one.`;
  }
  return `Kernels run on ${serverName(backend)}, which can be this device or another one.`;
}
