/**
 * Reads a data file's bytes for the data view, capped (#671): a Ganymede
 * server streams `files/<path>` and the read stops at the cap, so a huge
 * CSV never comes into memory whole; the in-browser backend has only its
 * contents API, which hands over the whole file, cut after the fact.
 */
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import type { Backend } from './backends';

export interface Bytes {
  bytes: Uint8Array;
  /** The file has more bytes than were read. */
  truncated: boolean;
}

/** Thrown when a file is over a limit that can't be cut (JSON, Parquet). */
export class TooLarge extends Error {
  constructor(
    readonly size: number,
    readonly limit: number,
  ) {
    super(`This file is ${megabytes(size)}; the data view opens files up to ${megabytes(limit)}.`);
  }
}

export function megabytes(n: number): string {
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/**
 * The first `limit` bytes of the file. With `whole`, a file past `limit`
 * is refused (TooLarge) rather than cut, for formats that can't be.
 */
export async function readBytes(
  backend: Backend,
  path: string,
  limit: number,
  whole = false,
): Promise<Bytes> {
  if (backend.config.kind === 'ganymede') {
    const settings = backend.services.serverSettings;
    const url = URLExt.join(settings.baseUrl, 'files', URLExt.encodeParts(path));
    const res = await ServerConnection.makeRequest(url, {}, settings);
    if (!res.ok) throw new Error(await failure(res));
    return readStream(res, limit, whole);
  }
  const model = await backend.services.contents.get(path, { content: true, format: 'base64' });
  const content = typeof model.content === 'string' ? model.content : '';
  const binary = model.format === 'base64' ? atob(content) : new TextEncoder().encode(content);
  const all = typeof binary === 'string' ? Uint8Array.from(binary, c => c.charCodeAt(0)) : binary;
  if (all.length > limit) {
    if (whole) throw new TooLarge(all.length, limit);
    return { bytes: all.slice(0, limit), truncated: true };
  }
  return { bytes: all, truncated: false };
}

async function failure(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) return body.message;
  } catch {
    // Not JSON: keep the status.
  }
  return res.status === 404 ? 'The file no longer exists.' : `The server answered ${res.status}.`;
}

/** Reads a response's body up to `limit` bytes, then stops the transfer. */
export async function readStream(res: Response, limit: number, whole: boolean): Promise<Bytes> {
  const declared = Number(res.headers.get('content-length'));
  if (whole && declared > limit) {
    await res.body?.cancel();
    throw new TooLarge(declared, limit);
  }
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    if (all.length > limit) {
      if (whole) throw new TooLarge(all.length, limit);
      return { bytes: all.slice(0, limit), truncated: true };
    }
    return { bytes: all, truncated: false };
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    if (size > limit) {
      if (whole) {
        await reader.cancel();
        throw new TooLarge(size, limit);
      }
      truncated = true;
      await reader.cancel();
      break;
    }
  }
  const out = new Uint8Array(Math.min(size, limit));
  let at = 0;
  for (const c of chunks) {
    const take = Math.min(c.length, out.length - at);
    out.set(c.subarray(0, take), at);
    at += take;
    if (at >= out.length) break;
  }
  return { bytes: out, truncated };
}

/**
 * Text from bytes read up to a cap: when the read stopped short, the last
 * record may be cut (and a character too), so everything after the last
 * line break goes. Invalid UTF-8 at the cut shows as U+FFFD at worst.
 */
export function textOf({ bytes, truncated }: Bytes): { text: string; truncated: boolean } {
  let text = new TextDecoder('utf-8').decode(bytes);
  if (truncated) {
    const cut = Math.max(text.lastIndexOf('\n'), text.lastIndexOf('\r'));
    text = cut >= 0 ? text.slice(0, cut + 1) : '';
  }
  return { text, truncated };
}
