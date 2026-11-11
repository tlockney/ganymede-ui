import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { useEffect, useRef, useState } from 'react';

/**
 * One reading of a kernel's usage: its resident memory in bytes and, when
 * the server says, the host's total and available memory in bytes.
 */
export type KernelReading = {
  memory: number;
  host?: { total: number; available: number };
};

const bytes = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * A kernel's usage, from the server's jupyter-resource-usage endpoint
 * (tlockney/ganymede#361), or null when the server hasn't the endpoint,
 * doesn't know the kernel (an in-page kernel), or can't measure it
 * (`"reason": "no_process"` or `"timeout"`).
 */
export async function kernelUsage(
  settings: ServerConnection.ISettings,
  kernelId: string,
): Promise<KernelReading | null> {
  const url = URLExt.join(
    settings.baseUrl,
    'api/metrics/v1/kernel_usage/get_usage',
    encodeURIComponent(kernelId),
  );
  try {
    const res = await ServerConnection.makeRequest(url, {}, settings);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      content?: {
        kernel_memory?: unknown;
        host_virtual_memory?: { total?: unknown; available?: unknown } | null;
      };
    } | null;
    const memory = body?.content?.kernel_memory;
    if (!bytes(memory)) return null;
    const { total, available } = body?.content?.host_virtual_memory ?? {};
    return bytes(total) && total > 0 && bytes(available)
      ? { memory, host: { total, available } }
      : { memory };
  } catch {
    return null;
  }
}

/** A kernel's resident memory in bytes, or null as {@link kernelUsage} is. */
export async function kernelMemory(
  settings: ServerConnection.ISettings,
  kernelId: string,
): Promise<number | null> {
  return (await kernelUsage(settings, kernelId))?.memory ?? null;
}

/**
 * Whether a reading was near the memory limit (#241): the host had under
 * 5% of its memory available, or the kernel held over 90% of it. The
 * server reports no per-kernel limit, so the host's memory stands in.
 */
export function nearMemoryLimit(reading: KernelReading): boolean {
  const { host } = reading;
  if (!host) return false;
  return host.available < host.total * 0.05 || reading.memory > host.total * 0.9;
}

/** Bytes as Activity Monitor shows them: "812 KB", "61.9 MB", "1.25 GB" (1 KB = 1024 bytes). */
export function formatMemory(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  if (i === 0) return `${n} bytes`;
  const digits = n >= 100 ? 0 : n >= 10 ? 1 : 2;
  return `${n.toFixed(digits)} ${units[i]}`;
}

/** How often a shown list asks again. The server measures at most every 200 ms. */
export const MEMORY_POLL_MS = 5000;

/**
 * Each kernel's memory by kernel id, asked now and every `MEMORY_POLL_MS`
 * while `active`. Nothing is asked while inactive (the list is hidden or
 * the page is in the background), and a kernel without a value has no
 * entry.
 */
export function useKernelMemory(
  settings: ServerConnection.ISettings | undefined,
  kernelIds: readonly string[],
  active: boolean,
): ReadonlyMap<string, number> {
  const [memory, setMemory] = useState<ReadonlyMap<string, number>>(new Map());
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  const key = [...kernelIds].sort().join(' ');
  useEffect(() => {
    const ids = key ? key.split(' ') : [];
    if (!settings || !active || !visible || !ids.length) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The next ask waits for this one: the server can take up to 10 s to
    // answer for a kernel, so asks on a fixed interval would overlap and
    // could land out of order.
    const ask = async () => {
      const values = await Promise.all(ids.map(id => kernelMemory(settings, id)));
      if (stopped) return;
      const next = new Map<string, number>();
      values.forEach((bytes, i) => bytes !== null && next.set(ids[i], bytes));
      setMemory(next);
      timer = setTimeout(() => void ask(), MEMORY_POLL_MS);
    };
    void ask();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [settings, key, active, visible]);

  return memory;
}

/** A kernel's last reading, and when it was answered (`Date.now()`). */
export type LastReading = { kernelId: string; at: number; reading: KernelReading };

/**
 * Asks for one kernel's usage now and every `MEMORY_POLL_MS` while
 * `active` and the page is shown, keeping the last reading in the ref it
 * returns. An ask that gets no reading leaves the last one, so a kernel
 * that just died keeps the reading from before. Nothing renders again on
 * a reading.
 */
export function useLastKernelReading(
  settings: ServerConnection.ISettings | undefined,
  kernelId: string | undefined,
  active: boolean,
): { readonly current: LastReading | undefined } {
  const last = useRef<LastReading>(undefined);
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!settings || !kernelId || !active || !visible) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = async () => {
      const reading = await kernelUsage(settings, kernelId);
      if (stopped) return;
      if (reading) last.current = { kernelId, at: Date.now(), reading };
      timer = setTimeout(() => void ask(), MEMORY_POLL_MS);
    };
    void ask();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [settings, kernelId, active, visible]);

  return last;
}

/**
 * Whether `kernelId` died out of memory, by its last reading (#241): one
 * near the limit, answered within a poll interval of `now`. An ask takes
 * time and the next waits a poll interval after it, so a reading counts
 * up to `MEMORY_POLL_MS` plus `ASK_SLACK_MS` old.
 */
export function diedOutOfMemory(
  last: LastReading | undefined,
  kernelId: string | undefined,
  now = Date.now(),
): boolean {
  return (
    !!last &&
    !!kernelId &&
    last.kernelId === kernelId &&
    now - last.at <= MEMORY_POLL_MS + ASK_SLACK_MS &&
    nearMemoryLimit(last.reading)
  );
}

/** How long an ask may take and its reading still count as the last before a death. */
export const ASK_SLACK_MS = 2000;
