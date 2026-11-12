/**
 * The kernel page (`kernel.html`) is answered from the service worker's
 * precache, so after an app update the first kernel page of a session can
 * be the previous release's, talking to the new release's Swift (#521).
 * Before the page says it is ready, it asks the worker to check for an
 * update; when a newer worker takes over, the page loads again from it.
 *
 * Swift queues the kernels' starts until the page says it is ready, so a
 * reload before then loses nothing. After that the page stays on its
 * release until the next session, since a reload would end the running
 * kernels. A newer worker still takes control of it at once (`autoUpdate`
 * claims open pages) and drops the old precache, so a later start in that
 * page can miss its own release's files.
 */

/** sessionStorage key: this tab already reloaded once for a new worker. */
export const RELOADED_KEY = 'ganymede-kernel-page-reloaded';

/** How long the update check may take before the page says it is ready. */
export const CHECK_TIMEOUT_MS = 3000;
/** How long to wait for a newer worker, once found, to finish installing. */
export const INSTALL_TIMEOUT_MS = 20000;

const wait = (ms: number) =>
  new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), ms));

/**
 * Whether the page can say it is ready (`true`), or should load again
 * from a newer service worker (`false`). The update check gives up after
 * `checkMs`; a newer worker it finds gets `installMs` to take control.
 * Errors count as current, so a kernel never waits on the worker for long.
 */
export async function workerIsCurrent(
  sw: ServiceWorkerContainer | undefined,
  checkMs = CHECK_TIMEOUT_MS,
  installMs = INSTALL_TIMEOUT_MS,
): Promise<boolean> {
  if (!sw?.controller) return true;
  const controller = sw.controller;
  const replaced = new Promise<'replaced'>(resolve =>
    sw.addEventListener('controllerchange', () => resolve('replaced'), { once: true }),
  );
  let resolveFailed: (value: 'failed') => void = () => {};
  const failed = new Promise<'failed'>(resolve => (resolveFailed = resolve));
  const checked = (async () => {
    const registration = await sw.getRegistration();
    if (!registration) return 'current' as const;
    await registration.update();
    // A newer worker may be installing, waiting, or already activating
    // (the notebook page's own update can run first): `autoUpdate`
    // activates it and claims this page.
    const active = registration.active;
    const newer =
      registration.installing || registration.waiting || (active && active !== controller);
    // An install that fails (a precache fetch errors) never claims the
    // page; stop waiting for it.
    registration.installing?.addEventListener('statechange', event => {
      if ((event.target as ServiceWorker | null)?.state === 'redundant') resolveFailed('failed');
    });
    return newer ? ('newer' as const) : ('current' as const);
  })().catch(() => {
    console.warn('kernel page: the service worker update check failed; starting kernels');
    return 'current' as const;
  });
  const first = await Promise.race([checked, replaced, wait(checkMs)]);
  if (first === 'replaced') return false;
  if (first === 'current') return true;
  if (first === 'timeout') {
    console.warn('kernel page: the service worker update check timed out; starting kernels');
    return true;
  }
  const installed = await Promise.race([replaced, failed, wait(installMs)]);
  if (installed === 'replaced') return false;
  if (installed === 'failed') {
    console.warn('kernel page: a newer service worker failed to install; starting kernels');
    return true;
  }
  console.warn(
    'kernel page: a newer service worker did not take control in time; starting kernels',
  );
  return true;
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

/**
 * Says ready at once with no worker in control (the dev server, tests);
 * under one, after checking it is the current release's, reloading
 * instead (once per session) when it isn't.
 */
export async function readyWhenCurrent(
  sw: ServiceWorkerContainer | undefined,
  on: { ready: () => void; reload: () => void },
  check: typeof workerIsCurrent = workerIsCurrent,
  canReload: () => boolean = mayReload,
): Promise<void> {
  if (!sw?.controller) return on.ready();
  if (await check(sw)) return on.ready();
  if (canReload()) return on.reload();
  console.warn(
    'kernel page: a newer service worker is in control, but this tab already reloaded once',
  );
  on.ready();
}
