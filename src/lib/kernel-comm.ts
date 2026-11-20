/**
 * One comm to a kernel, as cdp-kernel's frontends use it (type errors,
 * #669; signatures, definitions and renames, #676): opened once the kernel
 * has started and its subshell with it, closed by the kernel when it
 * doesn't answer the target, and opened again after a restart.
 *
 * - The comm opens only for a kernel of `languages`, and only while
 *   `enabled()` says so.
 * - A comm closed before it ever answered is a refusal: nothing more for
 *   that kernel. One closed after it answered was closed under us, as when
 *   the runtime exits: it opens again at the next idle.
 * - A restart disposes the comms without a close: it opens again once the
 *   kernel is back. A new kernel starts afresh.
 * - A counter (`epoch`) is bumped whenever the comm is dropped, so an open
 *   still waiting on the kernel's info or its subshell gives up.
 */
import type { ISessionContext } from '@jupyterlab/apputils';
import type { Kernel } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';

/** The kernel languages cdp-kernel's language service serves. */
export const LANGUAGES = /^(typescript|javascript)$/i;

/** Statuses of a kernel that has started and can answer. */
const READY = new Set<string>(['idle', 'busy']);

/** Statuses in which the kernel's comms are gone: a restart disposes them without closing. */
const RESET = new Set<string>(['restarting', 'autorestarting', 'dead']);

export type KernelCommOptions = {
  target: string;
  /** Whether to hold the comm open; asked at each chance to open. On by default. */
  enabled?: () => boolean;
  /** The kernel's answer: a comm message's `data`. */
  onMessage(data: unknown): void;
  /** The comm is open and requests can go. */
  onOpened?(): void;
  /** The comm was dropped, for whatever reason (also when there was none yet); what hangs on it goes. */
  onClosed?(): void;
};

export interface KernelComm extends IDisposable {
  /** Open, so a request can go. */
  readonly isOpen: boolean;
  /** Send a request; false when it didn't go (the comm is not open, or the connection went). */
  send(data: Record<string, unknown>): boolean;
  /** The switch behind `enabled` changed: open the comm, or drop it. */
  refresh(): void;
}

export function attachKernelComm(session: ISessionContext, options: KernelCommOptions): KernelComm {
  let kernel: Kernel.IKernelConnection | null = null;
  let comm: Kernel.IComm | null = null;
  /** The comm has been sent its open: a request can go. */
  let opened = false;
  /** The kernel has answered on the current comm: a later close is not a refusal. */
  let answered = false;
  /** The kernel closed the comm, or isn't a language the service serves: nothing more for it. */
  let closed = false;
  let epoch = 0;
  let opening = -1;
  let disposed = false;
  const enabled = () => options.enabled?.() ?? true;

  /** Drop the comm and what hangs on it. */
  const stop = () => {
    epoch++;
    answered = false;
    opened = false;
    const old = comm;
    comm = null;
    if (old) {
      // A close we make ourselves isn't the kernel refusing.
      old.onClose = () => {};
      old.onMsg = () => {};
      try {
        if (!old.isDisposed) old.close();
      } catch {
        // The kernel is gone already.
      }
    }
    options.onClosed?.();
  };

  const open = async () => {
    const k = kernel;
    if (!k || comm || closed || disposed || !enabled() || !READY.has(k.status)) return;
    if (opening === epoch) return;
    opening = epoch;
    const mine = epoch;
    let language: string | undefined;
    try {
      language = (await k.info).language_info?.name;
    } catch {
      opening = -1;
      return;
    }
    opening = -1;
    if (mine !== epoch || kernel !== k || disposed) return;
    if (!LANGUAGES.test(language ?? '')) {
      closed = true;
      return;
    }
    let c: Kernel.IComm;
    try {
      c = k.createComm(options.target);
      c.onMsg = msg => {
        answered = true;
        options.onMessage(msg.content.data);
      };
      c.onClose = () => {
        // Defensive: `stop` swaps this handler for a no-op, so the close of
        // a comm that is no longer current should not reach here. If one
        // ever does, it must not stop the comm that replaced it.
        if (comm !== c) return;
        // A comm that never answered is a refusal: for this kernel, that's
        // all. One that did was closed under us, as when the runtime exits
        // ("restarting on next cell"): the next idle opens it again.
        const refused = !answered;
        stop();
        if (refused) closed = true;
      };
      comm = c;
    } catch {
      stop();
      return;
    }
    // The comm's per-target subshell starts as it is made. Until it has, a
    // message goes on the main shell, behind a running cell, and a request
    // sent on the subshell before the kernel handled the open is dropped.
    // `subshellStarted` is CommHandler's public getter; a kernel without
    // subshells never settles it, so wait only when it has them.
    const started = (c as { subshellStarted?: Promise<void> }).subshellStarted;
    if (k.supportsSubshells && started) {
      try {
        await started;
      } catch {
        // No subshell: the open goes on the main shell.
      }
      if (comm !== c || mine !== epoch) return;
    }
    try {
      c.open({});
    } catch {
      stop();
      return;
    }
    opened = true;
    options.onOpened?.();
  };

  const onStatus = (k: Kernel.IKernelConnection, status: Kernel.Status) => {
    if (k !== kernel) return;
    if (RESET.has(status)) {
      stop();
      closed = false;
    } else {
      void open();
    }
  };
  const onDisposed = (k: Kernel.IKernelConnection) => {
    if (k !== kernel) return;
    stop();
    kernel = null;
  };

  const setKernel = () => {
    const next = session.session?.kernel ?? null;
    if (next === kernel) return;
    stop();
    kernel?.statusChanged.disconnect(onStatus);
    kernel?.disposed.disconnect(onDisposed);
    kernel = next;
    closed = false;
    kernel?.statusChanged.connect(onStatus);
    kernel?.disposed.connect(onDisposed);
    void open();
  };

  session.kernelChanged.connect(setKernel);
  session.sessionChanged.connect(setKernel);
  setKernel();

  const link: KernelComm = {
    get isOpen() {
      return opened && comm !== null;
    },
    get isDisposed() {
      return disposed;
    },
    send(data) {
      if (!opened || !comm) return false;
      try {
        comm.send(data as never);
        return true;
      } catch {
        // The kernel's connection went; its status change reopens the comm.
        stop();
        return false;
      }
    },
    refresh() {
      if (disposed) return;
      if (enabled()) void open();
      else stop();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      kernel?.statusChanged.disconnect(onStatus);
      kernel?.disposed.disconnect(onDisposed);
      kernel = null;
      session.kernelChanged.disconnect(setKernel);
      session.sessionChanged.disconnect(setKernel);
    },
  };
  return link;
}
