import type { KernelSpec } from '@jupyterlab/services';

/** The least time between two refreshes the page asks for itself. */
export const REFRESH_GAP_MS = 2000;

/**
 * Asks `manager` for the kernel list again whenever the page comes back:
 * its window gets focus or its tab shows (#350). A kernelspec installed
 * or removed meanwhile (`python -m ipykernel install --user`, say) then
 * shows without waiting for the manager's own poll. Returns the cleanup.
 */
export function refreshKernelsOnReturn(
  manager: Pick<KernelSpec.IManager, 'refreshSpecs'>,
  target: Window = window,
  now: () => number = Date.now,
): () => void {
  let last = -Infinity;
  const refresh = () => {
    if (target.document.visibilityState === 'hidden') return;
    const t = now();
    if (t - last < REFRESH_GAP_MS) return;
    last = t;
    // A failed request keeps the list it had; the poll tries again.
    manager.refreshSpecs().catch(() => {});
  };
  target.addEventListener('focus', refresh);
  target.document.addEventListener('visibilitychange', refresh);
  return () => {
    target.removeEventListener('focus', refresh);
    target.document.removeEventListener('visibilitychange', refresh);
  };
}
