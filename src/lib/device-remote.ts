/**
 * The `device` API for kernels that aren't in the app (ganymede-device
 * Phase R; its docs/protocol.md, "Over a Jupyter comm"): a cell on a
 * server kernel calls `connectDevice(jupyter.comm)`, and this page answers
 * for the cells it runs, forwarding the calls to the app's `deviceRemote`
 * handler (DeviceBridge.registerRemote, registered by KernelHost). Only
 * the remote subset, the methods that need no permission, gets through.
 *
 * In a browser there is no handler, so the page answers with web APIs
 * instead (ganymede-device's `browserForward`). Most of those need a click,
 * so it shows a prompt (`DevicePrompt`) and runs the call from the click.
 */
import type { ISessionContext } from '@jupyterlab/apputils';
import type { Kernel } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';
import {
  answerDevice,
  canAnswer,
  type DeviceAnswerer,
  type Forward,
  type KernelConnectionLike,
} from '@tlockney/ganymede-device/frontend';
import { browserForward, type Click } from '@tlockney/ganymede-device/browser';

export interface AttachDeviceOptions {
  /** Whether the page is in the app; `canAnswer()` by default. */
  available?: () => boolean;
  /**
   * Shows a click-through prompt, for the browser fallback. Without one, a
   * page outside the app answers only what needs no click.
   */
  click?: Click;
  /** Answers one kernel connection; `answerDevice` by default. `forward` is the browser fallback's, outside the app. */
  answer?: (kernel: KernelConnectionLike, forward?: Forward) => DeviceAnswerer;
}

/** A prompt the pane shows for a call that needs a click. */
export interface DevicePromptState {
  /** The button's label, such as "Copy to clipboard". */
  label: string;
  /**
   * What is asking, such as "Io.ipynb (Python 3)", so a person with
   * several notebooks open knows which one it is (#389).
   */
  asker?: string;
  /**
   * What the call carries, shortened for display: the text a clipboard
   * write would copy, or what a share would send (#389).
   */
  preview?: string;
  /** Runs the call; the button's click handler calls it. */
  accept(): void;
  dismiss(): void;
}

/** "A cell in Io.ipynb (Python 3) asks to use this device." */
export function askMessage(asker?: string): string {
  return asker ? `A cell in ${asker} asks to use this device.` : 'A cell asks to use this device.';
}

/** Longest preview a prompt shows, in characters. */
export const PREVIEW_LENGTH = 80;

// Control and format characters: they don't show, and the bidi ones
// reorder what follows them. The zero-width joiner stays, so joined
// emoji keep their shape.
const HIDDEN = /(?!\u200d)[\p{Cc}\p{Cf}]/gu;

/**
 * `detail` on one line, at most `max` characters, ending in "…" when
 * shortened. `undefined` for no detail; an empty text previews as "", and
 * a text of only spaces as " ". Control and format characters (bidi
 * overrides, zero-width and tag characters) are left out, so the preview
 * can't read differently from what is copied.
 */
export function previewText(detail: string | undefined, max = PREVIEW_LENGTH): string | undefined {
  if (detail === undefined) return undefined;
  // Whitespace becomes spaces before the hidden characters go, and runs
  // of spaces fold after, so a removed character leaves no double space.
  const line = detail.replace(/\s/g, ' ').replace(HIDDEN, '').replace(/ +/g, ' ').trim();
  if (line === '' && detail !== '') return ' ';
  const chars = Array.from(line);
  return chars.length > max
    ? `${chars
        .slice(0, max - 1)
        .join('')
        .trimEnd()}…`
    : line;
}

/**
 * A `Click` that shows each prompt through `show` (the pane's state
 * setter) and takes it down when answered, dismissed or cancelled.
 * `asker` names what is asking, read when each prompt shows.
 */
export function promptClick(
  show: (update: (current: DevicePromptState | undefined) => DevicePromptState | undefined) => void,
  asker?: () => string | undefined,
): Click {
  return (request, run) =>
    new Promise((resolve, reject) => {
      const close = () => show(current => (current === prompt ? undefined : current));
      const prompt: DevicePromptState = {
        label: request.label,
        asker: asker?.(),
        preview: previewText(request.detail),
        accept() {
          close();
          // In the click's handler, before any await: the browser's user
          // activation covers the call.
          run().then(resolve, reject);
        },
        dismiss() {
          close();
          reject(new Error('dismissed'));
        },
      };
      request.signal.addEventListener('abort', () => prompt.dismiss(), { once: true });
      show(() => prompt);
    });
}

/** Answers `connectDevice` from the session's kernel, following it as it changes. */
export function attachDevice(
  session: ISessionContext,
  options: AttachDeviceOptions = {},
): IDisposable {
  const inApp = options.available ?? (() => canAnswer());
  const answer =
    options.answer ??
    ((kernel: KernelConnectionLike, forward?: Forward) =>
      answerDevice(kernel, forward ? { forward } : {}));
  let kernel: Kernel.IKernelConnection | null = null;
  let answerer: DeviceAnswerer | undefined;
  let disposed = false;
  const update = () => {
    const next = session.session?.kernel ?? null;
    if (next === kernel) return;
    answerer?.dispose();
    answerer = undefined;
    kernel = next;
    // In the app, the bridge answers; in a browser, web APIs do.
    if (kernel)
      answerer = answer(kernel, inApp() ? undefined : browserForward({ click: options.click }));
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
