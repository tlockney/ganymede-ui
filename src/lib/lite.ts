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
export async function createLiteServices(): Promise<ServiceManager.IManager> {
  // The fake server answers at this page's origin. LiteKernelClient computes
  // its websocket base from PageConfig (this origin, since nothing sets it),
  // so the settings must agree with that.
  const base = window.location.origin + '/';
  const serverSettings = ServerConnection.makeSettings({
    baseUrl: base,
    wsUrl: base.replace(/^http/, 'ws'),
    WebSocket: WebSocket as unknown as typeof globalThis.WebSocket,
  });

  const kernelSpecs = new KernelSpecs();
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
    create: async options => new JavaScriptKernel({ ...options, runtime: 'worker' }),
  });

  const kernelClient = new LiteKernelClient({ kernelSpecs, serverSettings });
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

  const drive = new BrowserStorageDrive({
    // jupyter-react's storage name, so notebooks made before still show.
    storageName: 'JupyterLite Storage',
    localforage,
  });
  await drive.initialize();
  const contents = new ContentsManager({ defaultDrive: drive, serverSettings });

  const services = new ServiceManager({
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
