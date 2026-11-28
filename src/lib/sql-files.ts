/**
 * Page-side responder for the browser and in-app kernel SQL preload (#678):
 * watches the session's kernel for `ganymede.sql.files.v1` announcements
 * from a cell this page ran, opens a subshell calls comm back, reads the
 * requested local data file bytes through `backend`, and transfers them to
 * the worker so `jupyter.sql.load` and SQL file queries work without a
 * filesystem working directory.
 */
import type { ISessionContext } from '@jupyterlab/apputils';
import type { Kernel, KernelMessage } from '@jupyterlab/services';
import type { JSONObject } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';
import type { Backend } from './backends';
import { dataKind } from './data-files';
import { TooLarge, megabytes, readBytes } from './data-read';
import { filePaths, limitFor, locate } from './duckdb-console';
import { parentOf } from './launch';
import { notFound } from './rename';
import { SQL_FILES_ANNOUNCE, SQL_FILES_CALLS } from './sql-files-protocol';

const SUBSHELL_WAIT_MS = 3000;

export interface AttachSqlFilesOptions {
  /** Override subshell wait timeout (ms) in tests. */
  subshellTimeoutMs?: number;
}

type CommWithSubshell = Kernel.IComm & { subshellStarted?: Promise<void> };

function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  if (
    bytes.byteOffset === 0 &&
    bytes.byteLength === bytes.buffer.byteLength &&
    bytes.buffer instanceof ArrayBuffer
  ) {
    return bytes.buffer;
  }
  return bytes.slice().buffer;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.then(() => true),
    new Promise<boolean>(resolve => {
      timer = setTimeout(() => resolve(false), ms);
    }),
  ]).then(
    ok => {
      if (timer !== undefined) clearTimeout(timer);
      return ok;
    },
    () => {
      if (timer !== undefined) clearTimeout(timer);
      return false;
    },
  );
}

function answerSqlFiles(
  kernel: Kernel.IKernelConnection,
  backend: Backend,
  getPath: () => string,
  options: AttachSqlFilesOptions = {},
): IDisposable {
  const subshellTimeoutMs = options.subshellTimeoutMs ?? SUBSHELL_WAIT_MS;
  let comm: Kernel.IComm | null = null;
  let opening = false;
  let disposed = false;

  const drop = () => {
    const current = comm;
    comm = null;
    if (current && !current.isDisposed) current.close();
  };

  const readFileBytes = async (
    written: string,
    folder: string,
  ): Promise<{ buffer: ArrayBuffer } | { skip: true } | { error: string }> => {
    const at = locate(written, folder, true);
    if ('other' in at) return { skip: true };
    if ('outside' in at) {
      return {
        error: `${written} is outside this server’s root, so the in-app kernel can’t read it.`,
      };
    }
    const kind = dataKind(at.local);
    if (!kind) return { skip: true };
    const limit = limitFor(kind);
    try {
      const { bytes } = await readBytes(backend, at.local, limit, true);
      return { buffer: exactBuffer(bytes) };
    } catch (e) {
      if (notFound(e)) return { skip: true };
      if (e instanceof TooLarge) {
        return {
          error:
            `${written} is ${megabytes(e.size)}, over the ${megabytes(limit)} the in-app kernel loads in memory. ` +
            'Run the notebook on a server kernel to query it.',
        };
      }
      return { error: `Couldn’t read ${written}: ${errorMessage(e)}` };
    }
  };

  const handleRequest = async (
    data: JSONObject,
  ): Promise<{ reply: JSONObject; buffers: ArrayBuffer[] }> => {
    const id = data.id as number;
    const op = data.op;
    const folder = parentOf(getPath());

    if (op === 'read' && typeof data.path === 'string') {
      const res = await readFileBytes(data.path, folder);
      if ('error' in res) return { reply: { id, error: res.error }, buffers: [] };
      if ('skip' in res) return { reply: { id, skip: true }, buffers: [] };
      return { reply: { id, names: [data.path] }, buffers: [res.buffer] };
    }

    if (op === 'sql' && typeof data.sql === 'string') {
      const loaded = new Set(
        Array.isArray(data.loaded)
          ? data.loaded.filter((n): n is string => typeof n === 'string')
          : [],
      );
      const names: string[] = [];
      const buffers: ArrayBuffer[] = [];
      for (const written of filePaths(data.sql)) {
        if (loaded.has(written)) continue;
        const res = await readFileBytes(written, folder);
        if ('error' in res) return { reply: { id, error: res.error }, buffers: [] };
        if ('skip' in res) continue;
        names.push(written);
        buffers.push(res.buffer);
      }
      if (names.length === 0) return { reply: { id, skip: true }, buffers: [] };
      return { reply: { id, names }, buffers };
    }

    return { reply: { id, skip: true }, buffers: [] };
  };

  const receive = async (target: Kernel.IComm, msg: KernelMessage.ICommMsgMsg): Promise<void> => {
    if (disposed || comm !== target) return;
    const data = msg.content.data;
    if (typeof data.id !== 'number') return;
    const { reply, buffers } = await handleRequest(data);
    if (disposed || comm !== target || target.isDisposed) return;
    target.send(reply, {}, buffers);
  };

  const announced = async (msg: KernelMessage.ICommOpenMsg): Promise<void> => {
    if (disposed || opening) return;
    if (msg.parent_header?.session !== kernel.clientId) return;
    opening = true;
    try {
      const calls = kernel.createComm(SQL_FILES_CALLS) as CommWithSubshell;
      drop();
      comm = calls;
      if (
        kernel.supportsSubshells &&
        calls.subshellStarted &&
        !(await within(calls.subshellStarted, subshellTimeoutMs))
      ) {
        if (comm === calls) drop();
        return;
      }
      if (disposed || comm !== calls) {
        if (comm === calls) drop();
        return;
      }
      calls.onMsg = m => {
        receive(calls, m).catch(() => {});
      };
      calls.onClose = () => {
        if (comm === calls) drop();
      };
      calls.open({});
    } finally {
      opening = false;
    }
  };

  const onAnnounce = (_comm: Kernel.IComm, msg: KernelMessage.ICommOpenMsg): void => {
    announced(msg).catch(() => {});
  };

  kernel.registerCommTarget(SQL_FILES_ANNOUNCE, onAnnounce);

  return {
    get isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      kernel.removeCommTarget(SQL_FILES_ANNOUNCE, onAnnounce);
      drop();
    },
  };
}

/** Answers `sql-preload` comms from the session's active kernel, following kernel changes. */
export function attachSqlFiles(
  session: ISessionContext,
  backend: Backend,
  getPath: () => string,
  options: AttachSqlFilesOptions = {},
): IDisposable {
  let kernel: Kernel.IKernelConnection | null = null;
  let answerer: IDisposable | undefined;
  let disposed = false;

  const update = () => {
    const next = session.session?.kernel ?? null;
    if (next === kernel) return;
    answerer?.dispose();
    answerer = undefined;
    kernel = next;
    if (kernel) answerer = answerSqlFiles(kernel, backend, getPath, options);
  };

  update();
  session.kernelChanged.connect(update);
  session.sessionChanged?.connect(update);

  return {
    get isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session.kernelChanged.disconnect(update);
      session.sessionChanged?.disconnect(update);
      answerer?.dispose();
      answerer = undefined;
    },
  };
}
