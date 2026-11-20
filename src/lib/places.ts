/**
 * Places (#701): This Mac, On My iPad, or a connected machine. A machine is
 * reached through the app's own server, which mounts it under
 * `/machines/{id}/`; the pages and Recents of each place stay apart.
 */
import { useEffect, useState } from 'react';
import { ServerConnection } from '@jupyterlab/services';
import { isMachineId } from './backends';

/** A place the app listed, as it passes them to a machine's page (`ganymedePlaces`). */
export type PlaceInfo = { id: string | null; name: string };

declare global {
  interface Window {
    /**
     * Set by the Apple apps before a machine window's page loads: the
     * places the person can switch to (`id` null for this device). Names
     * only, never an address or a token.
     */
    ganymedePlaces?: unknown;
  }
}

/**
 * Fired on `window` by the app after it sets `ganymedePlaces` again; the
 * script is `Places.updateScript` (Place.swift), which names it too.
 */
export const PLACES_EVENT = 'ganymede-places';

/** The places the app lists, kept current as it changes the list. */
export function usePlaces(): PlaceInfo[] {
  const [places, setPlaces] = useState(() => pagePlaces());
  useEffect(() => {
    const update = () => setPlaces(pagePlaces());
    window.addEventListener(PLACES_EVENT, update);
    // A change between the first render and now.
    update();
    return () => window.removeEventListener(PLACES_EVENT, update);
  }, []);
  return places;
}

/** The places the app gave the page, dropping anything malformed. */
export function pagePlaces(
  win: { ganymedePlaces?: unknown } | null = typeof window === 'undefined' ? null : window,
): PlaceInfo[] {
  const raw = win?.ganymedePlaces;
  if (!Array.isArray(raw)) return [];
  const out: PlaceInfo[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const { id, name } = p as { id?: unknown; name?: unknown };
    if (typeof name !== 'string' || !name) continue;
    if (id === null) out.push({ id: null, name });
    else if (typeof id === 'string' && isMachineId(id)) out.push({ id, name });
  }
  return out;
}

/** Seconds between reachability checks while the machine answers. */
export const REACHABLE_POLL_MS = 15_000;
/** The first retry after a failure, doubling up to `MAX_BACKOFF_MS`. */
export const FIRST_RETRY_MS = 1_000;
export const MAX_BACKOFF_MS = 30_000;

/**
 * How long to wait before the next check after `failures` checks in a row
 * failed: none failed means the usual poll; then 1s, 2s, 4s… up to 30s.
 */
export function nextCheckDelay(failures: number): number {
  if (failures <= 0) return REACHABLE_POLL_MS;
  return Math.min(MAX_BACKOFF_MS, FIRST_RETRY_MS * 2 ** (failures - 1));
}

/** Whether `api/status` answers through the mount, within `timeoutMs`. */
export async function checkReachable(
  settings: ServerConnection.ISettings,
  timeoutMs = 5_000,
): Promise<boolean> {
  const url = new URL('api/status', settings.baseUrl).toString();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await ServerConnection.makeRequest(url, { signal: controller.signal }, settings);
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Polls `check` until stopped: every `REACHABLE_POLL_MS` while it answers,
 * with backoff while it doesn't (a gone machine isn't asked every second,
 * and a returned one is noticed within `MAX_BACKOFF_MS`). `onChange` gets
 * each answer. Returns the stop function.
 */
export function watchReachable(
  check: () => Promise<boolean>,
  onChange: (reachable: boolean) => void,
  timers: Pick<typeof globalThis, 'setTimeout' | 'clearTimeout'> = globalThis,
): () => void {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    const ok = await check();
    if (stopped) return;
    failures = ok ? 0 : failures + 1;
    onChange(ok);
    timer = timers.setTimeout(() => void tick(), nextCheckDelay(failures));
  };
  void tick();
  return () => {
    stopped = true;
    if (timer !== undefined) timers.clearTimeout(timer);
  };
}

/** Whether the machine behind `settings` answers now; true until a check says otherwise. */
export function useReachable(settings: ServerConnection.ISettings | undefined): boolean {
  const [reachable, setReachable] = useState(true);
  useEffect(() => {
    if (!settings) return;
    return watchReachable(() => checkReachable(settings), setReachable);
  }, [settings]);
  return reachable;
}
