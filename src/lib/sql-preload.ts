/**
 * Worker-side preload for browser and in-app kernels (#678): wraps
 * `jupyter.sql` so files referenced in `jupyter.sql.load(name, path)` or
 * `jupyter.sql` / `jupyter.sql.query` queries are fetched from the page
 * over a subshell comm and registered in DuckDB wasm before running.
 *
 * Self-contained with zero runtime dependencies outside the worker's own
 * `jupyter` namespace so Rollup bundles it as one standalone chunk.
 */
import { SQL_FILES_ANNOUNCE, SQL_FILES_CALLS, type SqlFilesReply } from './sql-files-protocol';

export interface PreloadCommMessage {
  data: { [key: string]: unknown };
  metadata: { [key: string]: unknown };
  buffers: Uint8Array[];
}

export interface PreloadCommSendOptions {
  metadata?: { [key: string]: unknown };
  buffers?: Uint8Array[];
}

export interface PreloadComm {
  readonly id: string;
  readonly targetName: string;
  readonly closed: boolean;
  send(data?: { [key: string]: unknown }, options?: PreloadCommSendOptions): void;
  close(data?: { [key: string]: unknown }, options?: PreloadCommSendOptions): void;
  onMsg(handler: (msg: PreloadCommMessage) => void | Promise<void>): void;
  onClose(handler: (msg: PreloadCommMessage) => void | Promise<void>): void;
}

export interface PreloadCommApi {
  open(
    targetName: string,
    data?: { [key: string]: unknown },
    options?: PreloadCommSendOptions,
  ): PreloadComm;
  registerTarget(
    targetName: string,
    handler: (comm: PreloadComm, msg: PreloadCommMessage) => void | Promise<void>,
  ): void;
}

export interface PreloadSql {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  query(text: string, params?: unknown[]): Promise<unknown>;
  raw(text: string): unknown;
  load(name: string, source: unknown): Promise<void>;
  close(): Promise<void>;
  connection(): Promise<unknown>;
}

interface BindingsLike {
  registerFileBuffer?(name: string, buffer: Uint8Array): Promise<void> | void;
}

interface ConnectionLike {
  bindings?: BindingsLike;
}

export interface SqlPreloadJupyter {
  sql?: PreloadSql;
  comm?: PreloadCommApi;
  readonly signal?: AbortSignal;
}

export interface SqlPreloadContext {
  jupyter?: SqlPreloadJupyter;
}

export interface InstallOptions {
  /** How long to wait for the frontend to open the calls comm, in ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;
const LOCAL_EXT = /\.(csv|tsv|json|parquet)$/i;
const SQL_DATA_EXT = /\.(csv|tsv|json|parquet)\b/i;

function isLocalCandidate(path: string): boolean {
  if (!path) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('/') || path.startsWith('~')) {
    return false;
  }
  if (/[*?[]/.test(path)) return false;
  return LOCAL_EXT.test(path);
}

function parseReply(msg: PreloadCommMessage): SqlFilesReply | null {
  const { data } = msg;
  if (typeof data.id !== 'number') return null;
  const names = Array.isArray(data.names)
    ? data.names.filter((n: unknown): n is string => typeof n === 'string')
    : undefined;
  return {
    id: data.id,
    names,
    skip: data.skip === true ? true : undefined,
    error: typeof data.error === 'string' ? data.error : undefined,
  };
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason !== undefined ? signal.reason : new DOMException('Aborted', 'AbortError');
}

export function installSqlFiles(jupyter: SqlPreloadJupyter, options: InstallOptions = {}): void {
  const origSql = jupyter.sql;
  const commApi = jupyter.comm;
  if (!origSql || !commApi) return;

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const registered = new Set<string>();
  const rawFragments = new WeakMap<object, string>();

  let comm: PreloadComm | null = null;
  let nextId = 0;
  let waiting: { resolve: (c: PreloadComm | null) => void; reject: (err: unknown) => void } | null =
    null;
  let connecting: Promise<PreloadComm | null> | null = null;
  const pending = new Map<
    number,
    {
      resolve: (res: { reply: SqlFilesReply; buffers: Uint8Array[] }) => void;
      reject: (err: unknown) => void;
    }
  >();

  const failPending = (reason: string) => {
    for (const [id, entry] of pending) {
      pending.delete(id);
      entry.reject(new Error(reason));
    }
  };

  const accept = (incoming: PreloadComm) => {
    if (comm && !comm.closed && comm !== incoming) comm.close();
    comm = incoming;
    incoming.onMsg(msg => {
      const reply = parseReply(msg);
      if (!reply) return;
      const entry = pending.get(reply.id);
      if (!entry) return;
      pending.delete(reply.id);
      entry.resolve({ reply, buffers: msg.buffers });
    });
    incoming.onClose(() => {
      if (comm === incoming) {
        comm = null;
        failPending('File channel closed');
      }
    });
    if (waiting) {
      const w = waiting;
      waiting = null;
      w.resolve(incoming);
    }
  };

  commApi.registerTarget(SQL_FILES_CALLS, incoming => accept(incoming));

  const announce = async (): Promise<PreloadComm | null> => {
    if (comm && !comm.closed) return comm;
    const announced = commApi.open(SQL_FILES_ANNOUNCE, { protocol: 1 });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const opened = await new Promise<PreloadComm | null>((resolve, reject) => {
        waiting = { resolve, reject };
        timer = setTimeout(() => {
          if (waiting) {
            waiting = null;
            resolve(null);
          }
        }, timeoutMs);
      });
      return opened;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      waiting = null;
      if (!announced.closed) announced.close();
    }
  };

  const ensureChannel = async (signal?: AbortSignal): Promise<PreloadComm | null> => {
    if (signal?.aborted) throw abortReason(signal);
    if (comm && !comm.closed) return comm;
    connecting ??= announce().finally(() => {
      connecting = null;
    });
    if (!signal) return connecting;
    return await new Promise<PreloadComm | null>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(abortReason(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      connecting!.then(
        c => {
          signal.removeEventListener('abort', onAbort);
          resolve(c);
        },
        err => {
          signal.removeEventListener('abort', onAbort);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
  };

  const request = async (
    payload: { op: 'read'; path: string } | { op: 'sql'; sql: string; loaded: string[] },
  ): Promise<{ reply: SqlFilesReply; buffers: Uint8Array[] } | null> => {
    const signal = jupyter.signal;
    const channel = await ensureChannel(signal);
    if (!channel) return null;
    if (signal?.aborted) throw abortReason(signal);

    const id = ++nextId;
    return await new Promise<{ reply: SqlFilesReply; buffers: Uint8Array[] }>((resolve, reject) => {
      const cleanup = () => signal?.removeEventListener('abort', onAbort);
      const onAbort = () => {
        pending.delete(id);
        cleanup();
        reject(abortReason(signal!));
      };
      pending.set(id, {
        resolve: res => {
          cleanup();
          resolve(res);
        },
        reject: err => {
          cleanup();
          reject(err);
        },
      });
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      try {
        channel.send({ ...payload, id });
      } catch (err) {
        pending.delete(id);
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  };

  const registerBuffers = async (
    names: readonly string[],
    buffers: readonly Uint8Array[],
  ): Promise<void> => {
    if (names.length === 0) return;
    const conn = (await origSql.connection()) as ConnectionLike | null | undefined;
    const bindings = conn?.bindings;
    const register = bindings?.registerFileBuffer;
    if (!bindings || typeof register !== 'function') return;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const bytes = buffers[i];
      if (!name || !bytes) continue;
      // registerFileBuffer transfers the underlying ArrayBuffer to DuckDB's worker.
      const owned =
        bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
          ? bytes
          : bytes.slice();
      await register.call(bindings, name, owned);
      registered.add(name);
    }
  };

  const ensureFiles = async (
    payload: { op: 'read'; path: string } | { op: 'sql'; sql: string; loaded: string[] },
  ): Promise<void> => {
    const res = await request(payload);
    if (!res) return;
    const { reply, buffers } = res;
    if (reply.error) throw new Error(reply.error);
    if (reply.skip || !reply.names?.length) return;
    await registerBuffers(reply.names, buffers);
  };

  const sqlTextFor = (strings: TemplateStringsArray, values: unknown[]): string => {
    let out = strings[0] ?? '';
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const raw = v && typeof v === 'object' ? rawFragments.get(v) : undefined;
      out += raw ?? '?';
      out += strings[i + 1] ?? '';
    }
    return out;
  };

  const wrapped = ((strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown> => {
    if (!Array.isArray(strings) || !Array.isArray(strings.raw)) {
      return origSql(strings, ...values);
    }
    const text = sqlTextFor(strings, values);
    if (!SQL_DATA_EXT.test(text)) {
      return origSql(strings, ...values);
    }
    return (async () => {
      await ensureFiles({ op: 'sql', sql: text, loaded: [...registered] });
      return origSql(strings, ...values);
    })();
  }) as PreloadSql;

  wrapped.query = (text: string, params?: unknown[]): Promise<unknown> => {
    if (typeof text !== 'string' || !SQL_DATA_EXT.test(text)) {
      return origSql.query(text, params);
    }
    return (async () => {
      await ensureFiles({ op: 'sql', sql: text, loaded: [...registered] });
      return origSql.query(text, params);
    })();
  };

  wrapped.raw = (text: string): unknown => {
    const frag = origSql.raw(text);
    if (frag && typeof frag === 'object') rawFragments.set(frag, String(text));
    return frag;
  };

  wrapped.load = async (name: string, source: unknown): Promise<void> => {
    if (
      typeof name === 'string' &&
      name !== '' &&
      typeof source === 'string' &&
      isLocalCandidate(source)
    ) {
      await ensureFiles({ op: 'read', path: source });
    }
    await origSql.load(name, source);
  };

  wrapped.close = async (): Promise<void> => {
    try {
      await origSql.close();
    } finally {
      registered.clear();
    }
  };

  wrapped.connection = () => origSql.connection();

  jupyter.sql = wrapped;
}

export default function preload({ jupyter }: SqlPreloadContext): void {
  if (jupyter) installSqlFiles(jupyter);
}
