/**
 * Reads a data file's bytes for the data view (#671). The size comes first
 * (a contents request without the content), and a file over the ceiling is
 * refused before any byte is fetched. Then a Ganymede server's
 * `files/<path>` is read as a stream and cancelled at the cap, so the page
 * keeps no more than the cap; the server still reads the whole file into
 * memory to answer (on iOS, in the app's own process), which is why the
 * ceiling exists. The in-browser backend has only the contents API, which
 * hands over the whole file, cut after the fact.
 */
import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import type { Backend } from './backends';
import { MAX_FILE_BYTES } from './data-files';

export interface Bytes {
  bytes: Uint8Array;
  /** The file has more bytes than were read. */
  truncated: boolean;
}

/** Thrown when a file is over what the data view will fetch or hold. */
export class TooLarge extends Error {
  constructor(
    readonly size: number,
    readonly limit: number,
  ) {
    super(`This file is ${megabytes(size)}, over the ${megabytes(limit)} the data view opens.`);
  }
}

export function megabytes(n: number): string {
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** What a model from the contents API holds, as bytes: text, JSON or base64, as stored. */
export function modelBytes(model: { content?: unknown; format?: string | null }): Uint8Array {
  const { content, format } = model;
  if (format === 'base64' && typeof content === 'string') {
    return Uint8Array.from(atob(content), c => c.charCodeAt(0));
  }
  if (typeof content === 'string') return new TextEncoder().encode(content);
  return new TextEncoder().encode(content === undefined ? '' : JSON.stringify(content));
}

/**
 * The first `limit` bytes of the file. With `whole`, a file past `limit`
 * is refused (TooLarge) rather than cut, for formats that can't be. A
 * file past `ceiling` (`limit` when whole) is refused before it is
 * fetched, since the server reads all of it to answer.
 */
export async function readBytes(
  backend: Backend,
  path: string,
  limit: number,
  whole = false,
  ceiling = whole ? limit : MAX_FILE_BYTES,
): Promise<Bytes> {
  const { contents } = backend.services;
  const size = (await contents.get(path, { content: false })).size;
  if (typeof size === 'number' && size > ceiling) throw new TooLarge(size, ceiling);
  if (backend.config.kind === 'ganymede') {
    const settings = backend.services.serverSettings;
    const url = URLExt.join(settings.baseUrl, 'files', URLExt.encodeParts(path));
    const res = await ServerConnection.makeRequest(url, {}, settings);
    if (!res.ok) throw new Error(await failure(res));
    return readStream(res, limit, whole);
  }
  // As stored: asking JupyterLite for base64 runs btoa over text, which
  // garbles accents and throws past U+00FF.
  const all = modelBytes(await contents.get(path, { content: true }));
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
 * Text from bytes: UTF-8 (a BOM is dropped), or UTF-16 when a byte order
 * mark says so. Other encodings (Latin-1, Windows-1252) read as UTF-8, and
 * show U+FFFD where it doesn't fit.
 */
export function decodeText(bytes: Uint8Array): string {
  const [a, b] = bytes;
  const label =
    a === 0xff && b === 0xfe ? 'utf-16le' : a === 0xfe && b === 0xff ? 'utf-16be' : 'utf-8';
  return new TextDecoder(label).decode(bytes);
}
