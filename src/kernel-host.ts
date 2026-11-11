/**
 * The page of the Apple apps' hidden kernel web view (`kernel.html`):
 * cdp-kernel's browser kernels, one per kernel the app's server starts,
 * with Jupyter messages carried by Swift (see `src/lib/kernel-relay.ts`).
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

/** The running kernels, by id, each with the run Swift gave its start. */
const kernels = new Map<string, { kernel: BrowserKernel; run: number }>();
/**
 * Kernels the server asked to shut down. It knows they end, and stops
 * them, so their end isn't news (#394).
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

/** Whether `kernel` is still the one running under `id`. */
function current(id: string, kernel: BrowserKernel): boolean {
  return kernels.get(id)?.kernel === kernel;
}

function start(id: string, run: number): void {
  // A restart reuses the id: the server stopped the old run first, but
  // a start without one replaces it all the same.
  stop(id);
  const device = deviceOptions();
  const kernel = startBrowserKernel({
    createWorker: () => new Worker(workerUrl, { type: 'module' }),
    ...device,
  });
  kernels.set(id, { kernel, run });
  // Which `device` owner is this kernel, so Swift can tell the permission
  // ledger which notebook its calls come from (#383).
  if (device.host) post({ kernel: id, op: 'owner', owner: device.host.owner });
  kernel.onMessage((channel, msg) => {
    if (!current(id, kernel)) return;
    post({ kernel: id, run, op: 'message', channel, json: JSON.stringify(encodeMessage(msg)) });
  });
  void kernel.closed.then(() => {
    // Swift stops this kernel's sounds and closes its players. A restart
    // closes the kernel too, so this runs then as well, before the new
    // Worker's hello would do it (ganymede-device#37).
    device.host?.release();
    if (!current(id, kernel) || shutDown.has(kernel)) return;
    kernels.delete(id);
    // It ended without the server asking: the server hears it died.
    post({ kernel: id, run, op: 'closed' });
  });
}

/**
 * The server stopped kernel `id`, after asking it to shut down: nothing it
 * sends from now on goes anywhere. A kernel still running gets its own
 * shutdown_request, which ends its Worker.
 */
function stop(id: string): void {
  const running = kernels.get(id);
  if (!running) return;
  kernels.delete(id);
  running.kernel.send('control', {
    header: {
      msg_id: crypto.randomUUID(),
      msg_type: 'shutdown_request',
      session: 'ganymede-app',
      username: '',
      date: new Date().toISOString(),
      version: '5.3',
    },
    parent_header: {},
    metadata: {},
    content: { restart: false },
  } as never);
}

/** Called by Swift with each start, message and stop from the server. */
export function deliver(m: ToKernel): void {
  if (m.op === 'start') {
    start(m.kernel, m.run);
  } else if (m.op === 'stop') {
    stop(m.kernel);
  } else if (m.op === 'send' && m.channel !== 'iopub') {
    const running = kernels.get(m.kernel);
    if (!running) return;
    const msg = decodeMessage(JSON.parse(m.json)) as { header?: { msg_type?: string } };
    if (m.channel === 'control' && msg.header?.msg_type === 'shutdown_request')
      shutDown.add(running.kernel);
    running.kernel.send(m.channel as Parameters<BrowserKernel['send']>[0], msg as never);
  }
}

(window as { ganymedeKernelHost?: { deliver: typeof deliver } }).ganymedeKernelHost = { deliver };
post({ op: 'ready' });
