import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { useEffect, useState } from 'react';

/**
 * A kernel's resident memory in bytes, from the server's
 * jupyter-resource-usage endpoint (tlockney/ganymede#361), or null when the
 * server hasn't the endpoint, doesn't know the kernel (an in-page kernel),
 * or can't measure it (`"reason": "no_process"` or `"timeout"`).
 */
export async function kernelMemory(
  settings: ServerConnection.ISettings,
  kernelId: string,
): Promise<number | null> {
  const url = URLExt.join(
    settings.baseUrl,
    'api/metrics/v1/kernel_usage/get_usage',
    encodeURIComponent(kernelId),
  );
  try {
    const res = await ServerConnection.makeRequest(url, {}, settings);
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { kernel_memory?: unknown } } | null;
    const bytes = body?.content?.kernel_memory;
    return typeof bytes === 'number' && Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
  } catch {
    return null;
  }
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
    const ask = async () => {
      const values = await Promise.all(ids.map(id => kernelMemory(settings, id)));
      if (stopped) return;
      const next = new Map<string, number>();
      values.forEach((bytes, i) => bytes !== null && next.set(ids[i], bytes));
      setMemory(next);
    };
    void ask();
    const timer = setInterval(() => void ask(), MEMORY_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [settings, key, active, visible]);

  return memory;
}
