import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { useEffect, useRef, useState } from 'react';

/**
 * A remote the server runs kernels on, as its `/api/kernelspecs` says
 * (tlockney/ganymede#969, #832). `reachable` false with no `error` is before
 * the server's first check: nothing to say yet. False with one is not
 * answering.
 */
export type KernelsRemote = {
  name: string;
  reachable: boolean;
  /** Why it isn't answering; null before the first check. */
  error: string | null;
};

/**
 * Where kernels run, beyond the kernelspecs JupyterLab keeps: its manager
 * drops the keys the server adds (ganymede#969), so the page asks for them
 * itself. Both are absent from a released server, when this is
 * {@link NO_PLACES}.
 */
export type KernelPlaces = {
  /** The remote, whenever the server runs kernels on one. */
  remote: KernelsRemote | null;
  /** The names of the specs that run there. */
  gateway: readonly string[];
};

/** Kernels run on this server, or it predates ganymede#969: no mark, no line. */
export const NO_PLACES: KernelPlaces = { remote: null, gateway: [] };

/** How often a page with a remote asks again: the server retries it every 15 s. */
export const PLACES_POLL_MS = 15_000;

/** The remote in a `/api/kernelspecs` answer, or null when there is none. */
function remoteIn(value: unknown): KernelsRemote | null {
  if (!value || typeof value !== 'object') return null;
  const { name, reachable, error } = value as Record<string, unknown>;
  if (typeof name !== 'string' || !name || typeof reachable !== 'boolean') return null;
  // An empty error is no more than a missing one.
  return { name, reachable, error: typeof error === 'string' && error ? error : null };
}

/** Where kernels run, from a `/api/kernelspecs` body. Pure. */
export function kernelPlaces(body: unknown): KernelPlaces {
  if (!body || typeof body !== 'object') return NO_PLACES;
  const { gateway, kernelspecs } = body as { gateway?: unknown; kernelspecs?: unknown };
  const remote = remoteIn(gateway);
  if (!kernelspecs || typeof kernelspecs !== 'object') return { remote, gateway: [] };
  const names = Object.entries(kernelspecs as Record<string, unknown>)
    .filter(
      ([, spec]) =>
        !!spec && typeof spec === 'object' && (spec as { gateway?: unknown }).gateway === true,
    )
    .map(([name]) => name);
  return { remote, gateway: names };
}

/**
 * `/api/kernelspecs` for what JupyterLab drops: the remote and the specs
 * that run on it. Through the backend's settings, so a machine's request
 * stays under its mount. Null when the server couldn't be asked.
 */
export async function fetchKernelPlaces(
  settings: ServerConnection.ISettings,
): Promise<KernelPlaces | null> {
  const url = URLExt.join(settings.baseUrl, 'api/kernelspecs');
  try {
    const res = await ServerConnection.makeRequest(url, { method: 'GET' }, settings);
    if (!res.ok) return null;
    return kernelPlaces(await res.json());
  } catch {
    return null;
  }
}

/** Whether two answers say the same: the hook then keeps the one it has. */
function samePlaces(a: KernelPlaces, b: KernelPlaces): boolean {
  return (
    a.remote?.name === b.remote?.name &&
    a.remote?.reachable === b.remote?.reachable &&
    a.remote?.error === b.remote?.error &&
    a.gateway.length === b.gateway.length &&
    a.gateway.every((name, i) => name === b.gateway[i])
  );
}

/**
 * Where kernels run on `settings`' backend, asked now, again every
 * `PLACES_POLL_MS` while there is a remote (the server retries it at the
 * same pace, so its answer changes), and when the page comes back. A server
 * without a remote keeps its kernels here for as long as the page is open,
 * so the asking stops after its first answer. Nothing is asked while the
 * page is hidden.
 */
export function useKernelPlaces(settings: ServerConnection.ISettings | undefined): KernelPlaces {
  const [places, setPlaces] = useState<KernelPlaces>(NO_PLACES);
  // What the last answer said, for whether to keep asking.
  const last = useRef<KernelPlaces>(NO_PLACES);
  last.current = places;
  useEffect(() => {
    // Another server's answer isn't this one's.
    setPlaces(NO_PLACES);
    last.current = NO_PLACES;
    if (!settings) return;
    let stopped = false;
    let asking = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void ask(), PLACES_POLL_MS);
    };
    const ask = async () => {
      if (stopped || asking) return;
      asking = true;
      clearTimeout(timer);
      const next = document.visibilityState === 'hidden' ? null : await fetchKernelPlaces(settings);
      asking = false;
      if (stopped) return;
      if (next) {
        setPlaces(prev => (samePlaces(prev, next) ? prev : next));
        last.current = next;
        if (!next.remote) return;
      }
      // A failed ask keeps the last answer, and asks again while it named a
      // remote: that is the one coming back that the page is waiting for.
      if (last.current.remote) schedule();
    };
    const onShow = () => {
      if (document.visibilityState !== 'hidden') void ask();
    };
    void ask();
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, [settings]);
  return places;
}

/**
 * A kernel's label where it runs: "Python 3 · workmbp" for a spec that runs
 * on `gateway` (the remote's name), its display name alone otherwise.
 */
export function placeLabel(spec: { display_name: string }, gateway?: string | null): string {
  return gateway ? `${spec.display_name} · ${gateway}` : spec.display_name;
}

/**
 * The one line a kernel list shows when the remote that runs them isn't
 * answering, or null when it answers, hasn't been checked yet, or there is
 * no remote. In a machine's window it names the machine whose kernels those
 * are: "m5air runs kernels on workmbp, which isn’t answering".
 */
export function notAnsweringLine(
  remote: KernelsRemote | null | undefined,
  machine?: string | null,
): string | null {
  if (!remote || remote.reachable || !remote.error) return null;
  return machine
    ? `${machine} runs kernels on ${remote.name}, which isn’t answering`
    : `${remote.name} isn’t answering: ${remote.error}`;
}
