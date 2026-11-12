/**
 * The kernel page (`kernel.html`) is answered from the service worker's
 * precache, so after an app update the first kernel page of a session can
 * be the previous release's, talking to the new release's Swift (#521).
 * Before the page says it is ready, it asks the worker to check for an
 * update; when a newer worker takes over, the page loads again from it.
 *
 * Swift queues the kernels' starts until the page says it is ready, so a
 * reload before then loses nothing. After that, a new worker is left for
 * the next session: reloading would end the running kernels.
 */

/** sessionStorage key: this tab already reloaded once for a new worker. */
export const RELOADED_KEY = 'ganymede-kernel-page-reloaded';

/**
 * Whether the page can say it is ready (`true`), or should load again
 * from a newer service worker (`false`). Gives up after `timeoutMs`, and
 * on any error, so a kernel never waits on the worker for long.
 */
export async function workerIsCurrent(
  sw: ServiceWorkerContainer | undefined,
  timeoutMs = 3000,
): Promise<boolean> {
  if (!sw?.controller) return true;
  const replaced = new Promise<boolean>(resolve =>
    sw.addEventListener('controllerchange', () => resolve(false), { once: true }),
  );
  const checked = (async () => {
    const registration = await sw.getRegistration();
    if (!registration) return true;
    await registration.update();
    // `autoUpdate` activates a new worker at once and claims this page;
    // wait for that, or for the timeout.
    return registration.installing || registration.waiting ? replaced : true;
  })().catch(() => true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>(resolve => {
    timer = setTimeout(() => resolve(true), timeoutMs);
  });
  try {
    return await Promise.race([checked, replaced, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Whether this tab may reload for a new worker: at most once. */
export function mayReload(
  storage: () => Pick<Storage, 'getItem' | 'setItem'> | undefined = () => sessionStorage,
): boolean {
  try {
    const store = storage();
    if (!store || store.getItem(RELOADED_KEY)) return false;
    store.setItem(RELOADED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
