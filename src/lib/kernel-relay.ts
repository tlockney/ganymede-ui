/**
 * The Apple apps run cdp-kernel's browser kernels in a hidden web view of
 * their own (`kernel.html`, `src/kernel-host.ts`), not in this page
 * (#99). Only that web view will get the native `device` bridge, so no
 * output, widget or Markdown rendered here can reach it. Swift relays
 * Jupyter messages between the two pages:
 *
 *   this page   → webkit.messageHandlers.kernelRelay → Swift
 *               → ganymedeKernelHost.deliver(m) in the kernel page
 *   kernel page → webkit.messageHandlers.kernelHost → Swift
 *               → ganymedeKernelRelay.deliver(m) here
 *
 * Swift accepts only main-frame messages, so sandboxed output frames,
 * which WebKit also gives message handlers, can't post into the relay.
 * Outside the apps there is no `kernelRelay` handler and kernels run in
 * this page, as before.
 */
import type {
  BrowserKernel,
  Channel,
  JupyterMessage,
  MessageListener,
} from '@tlockney/cdp-kernel/browser';

export const RELAY_HANDLER = 'kernelRelay';
export const HOST_HANDLER = 'kernelHost';

/** From this page to the kernel page. */
export type ToKernel =
  { kernel: string; op: 'start' } | { kernel: string; op: 'send'; channel: string; msg: unknown };

/**
 * From this page to Swift only, for ganymede-device's permission ledger
 * (#383): which notebook each kernel runs, renames, and what a notebook
 * declares it uses. Paths are the server's, as the contents API has them.
 */
export type ToApp =
  | { kernel: string; op: 'notebook'; path: string | null }
  | { op: 'moved'; from: string; to: string }
  | { op: 'declared'; path: string; capabilities: string[] };

/**
 * From the kernel page to this one; `ready`, and `owner` (the kernel's
 * `device` owner, for the ledger), go to Swift only.
 */
export type FromKernel =
  | { op: 'ready' }
  | { kernel: string; op: 'owner'; owner: number }
  | { kernel: string; op: 'message'; channel: string; msg: unknown }
  | { kernel: string; op: 'closed' };

interface MessageHandler {
  postMessage(message: unknown): void;
}

export function messageHandler(name: string): MessageHandler | undefined {
  const webkit = (globalThis as { webkit?: { messageHandlers?: Record<string, MessageHandler> } })
    .webkit;
  return webkit?.messageHandlers?.[name];
}

/** Whether this page is in an Apple app that runs kernels in its kernel web view. */
export function relayAvailable(): boolean {
  return messageHandler(RELAY_HANDLER) !== undefined;
}

/**
 * Messages cross to Swift as JSON-like values, which can't hold
 * `ArrayBuffer`s; binary buffers (widgets') travel as base64 strings.
 */
export function encodeMessage(msg: unknown): unknown {
  const buffers = (msg as { buffers?: unknown[] } | null)?.buffers;
  if (!Array.isArray(buffers) || buffers.length === 0) return msg;
  return { ...(msg as object), buffers: buffers.map(toBase64) };
}

export function decodeMessage(msg: unknown): unknown {
  const buffers = (msg as { buffers?: unknown[] } | null)?.buffers;
  if (!Array.isArray(buffers) || buffers.length === 0) return msg;
  return {
    ...(msg as object),
    buffers: buffers.map(b => (typeof b === 'string' ? fromBase64(b) : b)),
  };
}

function toBase64(buffer: unknown): unknown {
  const bytes = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    : buffer instanceof ArrayBuffer
      ? new Uint8Array(buffer)
      : null;
  if (!bytes) return buffer;
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

function fromBase64(text: string): ArrayBuffer {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

function tellApp(message: ToApp): void {
  messageHandler(RELAY_HANDLER)?.postMessage(message);
}

/** Kernel `kernel` runs the notebook at `path` (none: no notebook). */
export function reportNotebook(kernel: string, path: string | null): void {
  tellApp({ kernel, op: 'notebook', path });
}

/** A file or folder moved from `from` to `to`: kept permissions follow. */
export function reportMoved(from: string, to: string): void {
  if (from !== to) tellApp({ op: 'moved', from, to });
}

/**
 * The notebook at `path` opened; `metadata` is its metadata. When it lists
 * the device capabilities it uses (`ganymede.device`), the app asks for
 * the ones not yet decided, now rather than mid-run.
 */
export function declareDevice(path: string, metadata: unknown): void {
  const capabilities = declaredDevice(metadata);
  if (capabilities.length > 0) tellApp({ op: 'declared', path, capabilities });
}

/** `metadata.ganymede.device`'s strings, or none. */
export function declaredDevice(metadata: unknown): string[] {
  const ganymede = (metadata as { ganymede?: unknown } | null | undefined)?.ganymede;
  const device = (ganymede as { device?: unknown } | null | undefined)?.device;
  if (!Array.isArray(device)) return [];
  return [...new Set(device.filter((c): c is string => typeof c === 'string' && c !== ''))];
}

const listeners = new Map<string, MessageListener>();
const closers = new Map<string, () => void>();

function installReceiver(): void {
  const w = window as { ganymedeKernelRelay?: { deliver(m: FromKernel): void } };
  w.ganymedeKernelRelay ??= {
    deliver(m) {
      if (m.op === 'closed') {
        closers.get(m.kernel)?.();
        return;
      }
      if (m.op !== 'message') return;
      listeners.get(m.kernel)?.(m.channel as Channel, decodeMessage(m.msg) as JupyterMessage);
    },
  };
}

/** The part of cdp-kernel's `BrowserKernel` that `CdpBrowserKernel` uses. */
export type KernelChannels = Pick<BrowserKernel, 'send' | 'onMessage'> & {
  /**
   * Calls `listener` if the kernel ends without being asked to, as when
   * the Apple apps' kernel web view process dies (#293). Returns a
   * function that stops listening.
   */
  onClosed?(listener: () => void): () => void;
};

/** A kernel in the app's kernel web view, with `id` naming it across the relay. */
export function startRelayedKernel(id: string): KernelChannels {
  installReceiver();
  const relay = messageHandler(RELAY_HANDLER);
  if (!relay) throw new Error('No kernel relay: not in the Ganymede app');
  relay.postMessage({ kernel: id, op: 'start' } satisfies ToKernel);
  return {
    send(channel, msg) {
      relay.postMessage({
        kernel: id,
        op: 'send',
        channel,
        msg: encodeMessage(msg),
      } satisfies ToKernel);
    },
    onMessage(listener) {
      listeners.set(id, listener);
      return () => {
        if (listeners.get(id) === listener) listeners.delete(id);
      };
    },
    onClosed(listener) {
      closers.set(id, listener);
      return () => {
        if (closers.get(id) === listener) closers.delete(id);
      };
    },
  };
}
