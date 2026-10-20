import type { Contents, KernelMessage } from '@jupyterlab/services';
import { DriveContentsProcessor } from '@jupyterlite/services';

/** The channel JupyterLite's service worker relays requests on. */
const CHANNEL = '/sw-api.v1';

/**
 * The page side of JupyterLite's service-worker requests: what
 * `ServiceWorkerManager` in `@jupyterlite/apputils` does, without that
 * package (it brings JupyterLab's application shell along).
 *
 * A kernel in a Worker posts a synchronous XMLHttpRequest to `api/drive`
 * (Emscripten's DriveFS: read, write, list notebook files) or
 * `api/stdin/kernel` (`input()`); the service worker
 * (public/lite-service-worker.js) relays it here on a BroadcastChannel,
 * tagged with this page's `browsingContextId`, and the answer goes back the
 * same way. Drive requests are answered from the in-browser contents
 * manager, stdin requests by the kernel client.
 *
 * Only Workers can use this: a synchronous request from the page itself
 * would block the thread that has to answer it.
 */
export class ServiceWorkerBridge {
  readonly browsingContextId = crypto.randomUUID();
  /** The drive endpoint a kernel posts to. */
  readonly driveUrl = new URL('api/drive', window.location.origin + '/').href;

  constructor(options: {
    contents: Contents.IManager;
    handleStdin(msg: KernelMessage.IInputRequestMsg): Promise<KernelMessage.IInputReplyMsg>;
  }) {
    this._drive = new DriveContentsProcessor({ contentsManager: options.contents });
    this._handleStdin = options.handleStdin;
    this._channel.addEventListener('message', this._onMessage);
    this.ready = register();
  }

  /**
   * Resolves once a service worker controls this page, so Workers started
   * from now on are controlled too; rejects where there are none.
   */
  readonly ready: Promise<void>;

  /**
   * Answers what is still pending with `null`, so no kernel Worker waits on
   * a page that has stopped listening, then stops listening.
   */
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    for (const requestId of this._pending) this._post(requestId, null);
    this._pending.clear();
    this._channel.removeEventListener('message', this._onMessage);
    this._channel.close();
  }

  private _onMessage = async (event: MessageEvent) => {
    const { data, browsingContextId, requestId, pathname } = event.data ?? {};
    // Other tabs' requests and replies share the channel.
    if (browsingContextId !== this.browsingContextId || typeof pathname !== 'string') return;
    if (this._disposed) return;
    // Every request gets an answer: the Worker sits in a synchronous
    // request until it does. A failure answers `null`, which DriveFS turns
    // into EINVAL and a stdin reader into no input; better than a hang.
    this._pending.add(requestId);
    let response: unknown = null;
    try {
      if (!pathname.includes('/api/stdin/')) {
        response = await this._drive.processDriveRequest(data);
      } else if (pathname.endsWith('/kernel')) {
        response = await this._handleStdin(data);
      } else {
        console.warn(`No stdin handler for ${pathname}`);
      }
    } catch (err) {
      console.warn(`Request to ${pathname} failed`, data, err);
    }
    // Already answered with `null` if the bridge was disposed meanwhile.
    if (this._pending.delete(requestId)) this._post(requestId, response);
  };

  private _post(requestId: unknown, response: unknown) {
    this._channel.postMessage({ response, browsingContextId: this.browsingContextId, requestId });
  }

  private _pending = new Set<unknown>();
  private _disposed = false;
  private _channel = new BroadcastChannel(CHANNEL);
  private _drive: DriveContentsProcessor;
  private _handleStdin: (
    msg: KernelMessage.IInputRequestMsg,
  ) => Promise<KernelMessage.IInputReplyMsg>;
}

/**
 * In the production build the service worker is Workbox's (registered in
 * main.tsx), which imports the relay; registering the relay here as well
 * would replace it at the same scope. `npm run dev` has no Workbox worker,
 * so the relay is registered on its own.
 */
async function register(): Promise<void> {
  const sw = navigator.serviceWorker;
  if (!sw) throw new Error('No service workers in this browser');
  if (import.meta.env.DEV) {
    await sw.register('/lite-service-worker.js', { scope: '/' });
  }
  await sw.ready;
  if (!sw.controller) {
    // First visit: the worker claims the page when it activates.
    await new Promise(resolve => sw.addEventListener('controllerchange', resolve, { once: true }));
  }
}
