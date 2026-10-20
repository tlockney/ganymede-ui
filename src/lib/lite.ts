import {
  ContentsManager,
  Event,
  KernelManager,
  KernelSpecManager,
  ServerConnection,
  ServiceManager,
  SessionManager,
  UserManager,
} from '@jupyterlab/services';
import {
  BrowserStorageDrive,
  KernelSpecs,
  LiteKernelClient,
  LiteKernelSpecClient,
  LiteSessionClient,
} from '@jupyterlite/services';
import { JavaScriptKernel } from '@jupyterlite/javascript-kernel';
import { Signal, Stream } from '@lumino/signaling';
import localforage from 'localforage';
import { WebSocket } from 'mock-socket';
import { CDP_KERNEL_SPEC, CdpBrowserKernel } from './cdp-kernel';
import { ServiceWorkerBridge } from './lite-sw';

/**
 * JupyterLite's in-page server, assembled by hand.
 *
 * JupyterLite builds this from its `@jupyterlite/services-extension`
 * plugins inside a Lumino application. The app has no plugin system, so the
 * same pieces are wired here directly: kernels, sessions and kernel specs
 * answered in the page, kernel websockets faked with mock-socket, and
 * notebooks stored in IndexedDB through localforage. Everything else the
 * `ServiceManager` holds (terminals, settings, nbconvert, …) is the stock
 * client, which nothing here calls.
 *
 * Kernels are JupyterLite kernel factories. A Worker cdp-kernel is one more
 * `kernelSpecs.register(...)` call next to the JavaScript one.
 */
export async function createLiteServices(
  options: {
    /** Where notebooks live; IndexedDB in this browser when left out. */
    contents?: ContentsManager;
  } = {},
): Promise<ServiceManager.IManager> {
  // The fake server answers at this page's origin. LiteKernelClient computes
  // its websocket base from PageConfig (this origin, since nothing sets it),
  // so the settings must agree with that.
  const base = window.location.origin + '/';
  const serverSettings = ServerConnection.makeSettings({
    baseUrl: base,
    wsUrl: base.replace(/^http/, 'ws'),
    WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
  });

  const contents = options.contents ?? (await browserContents(serverSettings));

  const kernelSpecs = new KernelSpecs();
  const kernelClient = new CdpAwareKernelClient({ kernelSpecs, serverSettings });

  // Relays kernels' synchronous file and stdin requests through the service
  // worker (see lite-sw.ts). Set up in the background: kernels that never
  // use it shouldn't wait for it.
  const bridge = new ServiceWorkerBridge({
    contents,
    handleStdin: msg => kernelClient.handleStdin(msg),
  });
  bridge.ready.catch(err => console.info('Kernel file access is off:', err));

  kernelSpecs.register({
    spec: {
      // The name jupyter-react's kernel used, so notebooks made with it
      // still open on this one.
      name: 'javascript',
      display_name: 'JavaScript (Web Worker)',
      language: 'javascript',
      argv: [],
      resources: {},
    },
    create: async options => new DriveJavaScriptKernel({ ...options, runtime: 'worker' }, bridge),
  });
  kernelSpecs.register({
    spec: CDP_KERNEL_SPEC,
    create: async options => new CdpBrowserKernel(options),
  });

  const kernelSpecClient = new LiteKernelSpecClient({ kernelSpecs, serverSettings });
  const kernels = new KernelManager({
    kernelAPIClient: kernelClient,
    kernelSpecAPIClient: kernelSpecClient,
    serverSettings,
  });
  const sessions = new SessionManager({
    kernelManager: kernels,
    serverSettings,
    sessionAPIClient: new LiteSessionClient({ kernelClient, serverSettings }),
  });
  const kernelspecs = new KernelSpecManager({
    kernelSpecAPIClient: kernelSpecClient,
    serverSettings,
  });

  const services = new LiteServiceManager(bridge, kernelClient, {
    serverSettings,
    contents,
    kernels,
    sessions,
    kernelspecs,
    events: new LocalEvents(serverSettings),
    user: new LocalUser({ serverSettings }),
  });
  await services.ready;
  return services;
}

async function browserContents(serverSettings: ServerConnection.ISettings) {
  // The drive only asks the server for seed files
  // (`api/contents/<path>/all.json`, which through the dev proxy reached
  // Ganymede and got 403) when PageConfig's `contentsAllJsonFile` option
  // names one. jupyter-react set it; nothing here sets PageConfig, nor
  // should index.html ever carry a `jupyter-config-data` script with it.
  const drive = new BrowserStorageDrive({
    // jupyter-react's storage name, so notebooks made before still show.
    storageName: 'JupyterLite Storage',
    localforage,
  });
  await drive.initialize();
  return new ContentsManager({ defaultDrive: drive, serverSettings });
}

/**
 * JupyterLite interrupts a kernel by cancelling its own message queue,
 * which cdp-kernel's kernel doesn't use: it gets an `interrupt_request`.
 */
class CdpAwareKernelClient extends LiteKernelClient {
  async interrupt(kernelId: string): Promise<void> {
    // `_kernels` is LiteKernelClient's private map of running kernels.
    const kernels = (this as unknown as { _kernels: Map<string, unknown> })._kernels;
    const kernel = kernels.get(kernelId);
    if (kernel instanceof CdpBrowserKernel) {
      kernel.interrupt();
      return;
    }
    return super.interrupt(kernelId);
  }
}

/**
 * Ends this page's kernels and the relay when the backend is switched.
 *
 * `ServiceManager.dispose()` leaves running kernels alone, which suits a
 * server: they stay listed under Running when the app connects to it again.
 * Kernels in this page have no such home, and their Workers would run on,
 * unreachable, until the tab closes. So they are shut down first, which
 * terminates their Workers, and then the relay answers whatever is still
 * pending (lite-sw.ts).
 */
class LiteServiceManager extends ServiceManager {
  constructor(
    private _bridge: ServiceWorkerBridge,
    private _kernelClient: LiteKernelClient,
    options: Partial<ServiceManager.IOptions>,
  ) {
    super(options);
  }
  dispose(): void {
    if (this.isDisposed) return;
    // Synchronous underneath: each kernel is disposed on the spot.
    void this._kernelClient.shutdownAll();
    this._bridge.dispose();
    super.dispose();
  }
}

/**
 * The JavaScript kernel, told where the drive is: in its Worker,
 * `globalThis.jupyterlite` holds `driveUrl` and `browsingContextId`, what
 * JupyterLite hands its Pyodide kernel for DriveFS. The JavaScript kernel
 * has no file system of its own, so code uses it directly, e.g. a
 * synchronous `POST` of `{ browsingContextId, data: { method: 'get',
 * path } }` to `driveUrl`; see the dev log of #8.
 */
class DriveJavaScriptKernel extends JavaScriptKernel {
  constructor(
    options: JavaScriptKernel.IOptions,
    private _bridge: ServiceWorkerBridge,
  ) {
    super(options);
  }
  protected async onRuntimeReady(context: JavaScriptKernel.IRuntimeReadyContext) {
    const { driveUrl, browsingContextId } = this._bridge;
    await context.execute(
      `globalThis.jupyterlite = ${JSON.stringify({ driveUrl, browsingContextId })}; void 0`,
    );
  }
}

/** No server to ask who the user is. */
class LocalUser extends UserManager {
  protected async requestUser(): Promise<void> {}
}

/**
 * Events stay in the page. The stock manager would open a websocket to
 * `/api/events/subscribe` at this origin, where nothing answers.
 */
class LocalEvents implements Event.IManager {
  constructor(readonly serverSettings: ServerConnection.ISettings) {}
  private _stream = new Stream<this, Event.Emission>(this);
  private _disposed = false;
  get stream(): Event.Stream {
    return this._stream;
  }
  get isDisposed() {
    return this._disposed;
  }
  async emit({ data, schema_id }: Event.Request): Promise<void> {
    this._stream.emit({ ...data, schema_id });
  }
  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;
    this._stream.stop();
    Signal.clearData(this);
  }
}
