/**
 * The page of the Apple apps' hidden kernel web view (`kernel.html`):
 * cdp-kernel's browser kernels, one per kernel the UI page starts, with
 * Jupyter messages relayed by Swift (see `src/lib/kernel-relay.ts`).
 * Nothing renders here, so the native bridges this web view gets reach
 * kernels only.
 */
import { startBrowserKernel, type BrowserKernel } from '@tlockney/cdp-kernel/browser';
import workerUrl from '@tlockney/cdp-kernel/browser/worker?worker&url';
import {
  decodeMessage,
  encodeMessage,
  type FromKernel,
  HOST_HANDLER,
  messageHandler,
  type ToKernel,
} from './lib/kernel-relay';

const kernels = new Map<string, BrowserKernel>();

function post(message: FromKernel): void {
  messageHandler(HOST_HANDLER)?.postMessage(message);
}

function start(id: string): void {
  const kernel = startBrowserKernel({
    createWorker: () => new Worker(workerUrl, { type: 'module' }),
  });
  kernels.set(id, kernel);
  kernel.onMessage((channel, msg) =>
    post({ kernel: id, op: 'message', channel, msg: encodeMessage(msg) }),
  );
  void kernel.closed.then(() => {
    if (kernels.get(id) !== kernel) return;
    kernels.delete(id);
    post({ kernel: id, op: 'closed' });
  });
}

/** Called by Swift with each message from the UI page. */
export function deliver(m: ToKernel): void {
  if (m.op === 'start') {
    start(m.kernel);
  } else if (m.op === 'send' && m.channel !== 'iopub') {
    kernels
      .get(m.kernel)
      ?.send(m.channel as Parameters<BrowserKernel['send']>[0], decodeMessage(m.msg) as never);
  }
}

(window as { ganymedeKernelHost?: { deliver: typeof deliver } }).ganymedeKernelHost = { deliver };
post({ op: 'ready' });
