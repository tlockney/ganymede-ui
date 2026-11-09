/**
 * The page of the Apple apps' hidden kernel web view (`kernel.html`):
 * cdp-kernel's browser kernels, one per kernel the UI page starts, with
 * Jupyter messages relayed by Swift (see `src/lib/kernel-relay.ts`).
 * Nothing renders here, so the native bridges this web view gets reach
 * kernels only.
 *
 * When Swift registers ganymede-device's `device` handler on this web view,
 * each kernel gets its preload, which installs `globalThis.device` in the
 * cells' Worker, and reports `capabilities.device` in kernel_info_reply.
 */
import { startBrowserKernel, type BrowserKernel } from '@tlockney/cdp-kernel/browser';
import workerUrl from '@tlockney/cdp-kernel/browser/worker?worker&url';
import { findMessageHandler, webkitHost } from '@tlockney/ganymede-device/webkit';
import devicePreloadUrl from '@tlockney/ganymede-device/preload.js?url&no-inline';
import {
  decodeMessage,
  encodeMessage,
  type FromKernel,
  HOST_HANDLER,
  messageHandler,
  type ToKernel,
} from './lib/kernel-relay';

const kernels = new Map<string, BrowserKernel>();
/**
 * Kernels the UI page asked to shut down. It knows they end, and a restart
 * starts the next one under the same id, so their `closed` would reach the
 * new kernel if it came after that `start` (#394).
 */
const shutDown = new WeakSet<BrowserKernel>();

function post(message: FromKernel): void {
  messageHandler(HOST_HANDLER)?.postMessage(message);
}

/** The `device` options, or none outside an app that registered the handler. */
export function deviceOptions() {
  if (!findMessageHandler()) return {};
  return {
    preload: [new URL(devicePreloadUrl, location.href).href],
    host: webkitHost(),
    capabilities: { device: true },
  };
}

function start(id: string): void {
  const device = deviceOptions();
  const kernel = startBrowserKernel({
    createWorker: () => new Worker(workerUrl, { type: 'module' }),
    ...device,
  });
  kernels.set(id, kernel);
  // Which `device` owner is this kernel, so Swift can tell the permission
  // ledger which notebook its calls come from (#383).
  if (device.host) post({ kernel: id, op: 'owner', owner: device.host.owner });
  kernel.onMessage((channel, msg) =>
    post({ kernel: id, op: 'message', channel, msg: encodeMessage(msg) }),
  );
  void kernel.closed.then(() => {
    // Swift stops this kernel's sounds and closes its players. A restart
    // closes the kernel too, so this runs then as well, before the new
    // Worker's hello would do it (ganymede-device#37).
    device.host?.release();
    if (kernels.get(id) !== kernel) return;
    kernels.delete(id);
    if (!shutDown.has(kernel)) post({ kernel: id, op: 'closed' });
  });
}

/** Called by Swift with each message from the UI page. */
export function deliver(m: ToKernel): void {
  if (m.op === 'start') {
    start(m.kernel);
  } else if (m.op === 'send' && m.channel !== 'iopub') {
    const kernel = kernels.get(m.kernel);
    if (!kernel) return;
    const msg = decodeMessage(m.msg) as { header?: { msg_type?: string } };
    if (m.channel === 'control' && msg.header?.msg_type === 'shutdown_request')
      shutDown.add(kernel);
    kernel.send(m.channel as Parameters<BrowserKernel['send']>[0], msg as never);
  }
}

(window as { ganymedeKernelHost?: { deliver: typeof deliver } }).ganymedeKernelHost = { deliver };
post({ op: 'ready' });
