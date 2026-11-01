/**
 * The Mac app's document window (#132): the page tells it which notebook is
 * open and whether it has unsaved edits, through the `document` script
 * message handler the app registers, and the app asks the page to save
 * (File > Save, and before a window closes or the app quits) through
 * `window.ganymede.save()`. In a browser there is no handler and these do
 * nothing.
 */

/** What the page posts: the notebook's path on the server, or null. */
export type DocumentMessage = { path: string | null; dirty: boolean };

/** What the app calls: save the open notebook; true when it is saved. */
export type NativeHooks = { save(): Promise<boolean> };

declare global {
  interface Window {
    ganymede?: NativeHooks;
  }
}

type MessageHandler = { postMessage(message: unknown): void };

export function postDocument(message: DocumentMessage): void {
  const webkit = (globalThis as { webkit?: { messageHandlers?: Record<string, MessageHandler> } })
    .webkit;
  webkit?.messageHandlers?.document?.postMessage(message);
}

/** Exposes `hooks` to the app until the returned function is called. */
export function exposeHooks(hooks: NativeHooks): () => void {
  window.ganymede = hooks;
  return () => {
    if (window.ganymede === hooks) delete window.ganymede;
  };
}
