/**
 * The Apple apps run cdp-kernel's browser kernels in a hidden web view of
 * their own (`kernel.html`, `src/kernel-host.ts`) and register them with
 * the app's server (ganymede#266), so this page reaches them through the
 * server's API like any kernel. Only that web view gets the native
 * `device` bridge, so no output, widget or Markdown rendered here can
 * reach it. Swift carries the kernel page's messages to the server:
 *
 *   server → Swift → ganymedeKernelHost.deliver(m) in the kernel page
 *   kernel page → webkit.messageHandlers.kernelHost → Swift → server
 *
 * This page still tells the app what the permission ledger needs
 * (`kernelRelay`): renames and a notebook's declared capabilities. Swift
 * accepts only main-frame messages, so sandboxed output frames, which
 * WebKit also gives message handlers, can't post them.
 */
export const RELAY_HANDLER = 'kernelRelay';
export const HOST_HANDLER = 'kernelHost';

/**
 * From the server, through Swift, to the kernel page. Each start has a run
 * number, which the kernel page puts on what it sends back: a restart
 * reuses the kernel id, and Swift drops what an earlier run sends late.
 * Messages are Jupyter JSON, binary buffers as base64 strings.
 */
export type ToKernel =
  | {
      kernel: string;
      op: 'start';
      run: number;
      /**
       * The run's parameters (`GANYMEDE_PARAMS` in the server's launch),
       * as a JSON object's text: what cells read as `jupyter.params`.
       */
      params?: string;
    }
  | { kernel: string; op: 'send'; channel: string; json: string }
  | { kernel: string; op: 'stop' };

/**
 * From this page to Swift, for ganymede-device's permission ledger (#383):
 * renames, and what a notebook declares it uses. Paths are the server's,
 * as the contents API has them.
 */
export type ToApp =
  | { op: 'moved'; from: string; to: string }
  | { op: 'declared'; path: string; capabilities: string[] };

/**
 * From the kernel page to Swift: `ready`; `owner`, the kernel's `device`
 * owner, for the ledger; a message for the server; and `closed`, a kernel
 * that ended without being stopped.
 */
export type FromKernel =
  | { op: 'ready' }
  | { kernel: string; op: 'owner'; owner: number }
  | { kernel: string; run: number; op: 'message'; channel: string; json: string }
  | { kernel: string; run: number; op: 'closed' };

interface MessageHandler {
  postMessage(message: unknown): void;
}

export function messageHandler(name: string): MessageHandler | undefined {
  const webkit = (globalThis as { webkit?: { messageHandlers?: Record<string, MessageHandler> } })
    .webkit;
  return webkit?.messageHandlers?.[name];
}

/** Whether this page is in an Apple app, which keeps the permission ledger. */
export function relayAvailable(): boolean {
  return messageHandler(RELAY_HANDLER) !== undefined;
}

/**
 * Messages cross to Swift as JSON, which can't hold `ArrayBuffer`s; binary
 * buffers (widgets') travel as base64 strings, as the server takes them.
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
