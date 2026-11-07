/**
 * The `device` API for kernels that aren't in the app (ganymede-device
 * Phase R; its docs/protocol.md, "Over a Jupyter comm"): a cell on a
 * server kernel calls `connectDevice(jupyter.comm)`, and this page answers
 * for the cells it runs, forwarding the calls to the app's `deviceRemote`
 * handler (DeviceBridge.registerRemote, registered by KernelHost). Only
 * the remote subset, the methods that need no permission, gets through.
 *
 * Outside the app there is no handler, so nothing is registered and the
 * kernel's announce goes unanswered, as in JupyterLab.
 */
import type { ISessionContext } from '@jupyterlab/apputils';
import type { Kernel } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';
import {
  answerDevice,
  canAnswer,
  type DeviceAnswerer,
  type KernelConnectionLike,
} from '@tlockney/ganymede-device/frontend';

export interface AttachDeviceOptions {
  /** Whether the page is in the app; `canAnswer()` by default. */
  available?: () => boolean;
  /** Answers one kernel connection; `answerDevice` by default. */
  answer?: (kernel: KernelConnectionLike) => DeviceAnswerer;
}

/** Answers `connectDevice` from the session's kernel, following it as it changes. */
export function attachDevice(
  session: ISessionContext,
  options: AttachDeviceOptions = {},
): IDisposable {
  const available = options.available ?? (() => canAnswer());
  const answer = options.answer ?? ((kernel: KernelConnectionLike) => answerDevice(kernel));
  let kernel: Kernel.IKernelConnection | null = null;
  let answerer: DeviceAnswerer | undefined;
  let disposed = false;
  const update = () => {
    const next = session.session?.kernel ?? null;
    if (next === kernel) return;
    answerer?.dispose();
    answerer = undefined;
    kernel = next;
    if (kernel && available()) answerer = answer(kernel);
  };
  update();
  session.kernelChanged.connect(update);
  return {
    get isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      session.kernelChanged.disconnect(update);
      answerer?.dispose();
      answerer = undefined;
    },
  };
}
