import {
  ContentsManager,
  type Kernel,
  KernelAPI,
  KernelManager,
  type KernelSpec,
  KernelSpecAPI,
  KernelSpecManager,
  ServerConnection,
  type Session,
  SessionAPI,
  SessionManager,
  ServiceManager,
} from '@jupyterlab/services';
import { WebSocket as PageSocket } from 'mock-socket';
import { createLiteParts, type LiteParts } from './lite';

/**
 * A Ganymede server's kernels and this page's, side by side (#185).
 *
 * The Mac app runs kernels as processes through its server, and those can't
 * reach the app's native bridges (ganymede-device's `device`). This backend
 * keeps the server's notebooks and kernels and adds the in-page kernels
 * (cdp-kernel's TypeScript kernel, which the app runs in its hidden kernel
 * web view) to the same kernel list. One service manager answers the UI:
 * kernel specs are merged, and each kernel or session call goes to the side
 * that owns it, by kernel name when starting and by id afterwards.
 *
 * A page kernel spec whose name the server also has is left out, so the
 * server's kernel keeps the name.
 */
export async function createMixedServices(
  serverSettings: ServerConnection.ISettings,
): Promise<ServiceManager.IManager> {
  const contents = new ContentsManager({ serverSettings });
  const lite = await createLiteParts({ contents });
  const owners = new Owners(lite);

  // Kernel websockets: a page kernel's goes to the page's fake server
  // (mock-socket), every other socket to the network.
  const settings = ServerConnection.makeSettings({
    ...serverSettings,
    WebSocket: dispatchingSocket(url => {
      const id = kernelIdFrom(url);
      return id !== undefined && lite.hasKernel(id);
    }),
  });

  const kernelSpecClient = new MixedKernelSpecClient(
    settings,
    new KernelSpecAPI.KernelSpecAPIClient({ serverSettings }),
    lite.kernelSpecClient,
    owners,
  );
  const kernelClient = new MixedKernelClient(
    settings,
    new KernelAPI.KernelAPIClient({ serverSettings }),
    lite.kernelClient,
    owners,
  );
  const sessionClient = new MixedSessionClient(
    settings,
    new SessionAPI.SessionAPIClient({ serverSettings }),
    lite.sessionClient,
    owners,
  );
  const kernels = new KernelManager({
    serverSettings: settings,
    kernelAPIClient: kernelClient,
    kernelSpecAPIClient: kernelSpecClient,
  });
  const sessions = new SessionManager({
    serverSettings: settings,
    kernelManager: kernels,
    sessionAPIClient: sessionClient,
  });
  const kernelspecs = new KernelSpecManager({
    serverSettings: settings,
    kernelSpecAPIClient: kernelSpecClient,
  });
  const services = new MixedServiceManager(lite.services, {
    serverSettings: settings,
    contents,
    kernels,
    sessions,
    kernelspecs,
  });
  await services.ready;
  return services;
}

type Side = 'server' | 'page';

/** Which side owns a kernel spec, a kernel, or a session. */
export class Owners {
  /** Page kernel spec names that made it into the merged list. */
  readonly pageSpecs = new Set<string>();
  /** The UI's session ids, each with its side and that side's session id. */
  readonly sessions = new Map<string, { side: Side; id: string }>();

  constructor(private _lite: Pick<LiteParts, 'hasKernel'>) {}

  ofSpec(name: string | undefined): Side {
    return name !== undefined && this.pageSpecs.has(name) ? 'page' : 'server';
  }

  ofKernel(id: string): Side {
    return this._lite.hasKernel(id) ? 'page' : 'server';
  }

  /** The side and inner id of the UI's session `id`; an unknown id is taken as the server's. */
  ofSession(id: string): { side: Side; id: string } {
    return this.sessions.get(id) ?? { side: 'server', id };
  }

  /** The UI's id for a side's session `id`. */
  outerSession(side: Side, id: string): string {
    for (const [outer, inner] of this.sessions) {
      if (inner.side === side && inner.id === id) return outer;
    }
    this.sessions.set(id, { side, id });
    return id;
  }
}

/** The server's kernel specs, then the page's whose names the server lacks. */
export class MixedKernelSpecClient implements KernelSpec.IKernelSpecAPIClient {
  constructor(
    readonly serverSettings: ServerConnection.ISettings,
    private _server: KernelSpec.IKernelSpecAPIClient,
    private _page: KernelSpec.IKernelSpecAPIClient,
    private _owners: Owners,
  ) {}

  async get(): Promise<KernelSpec.ISpecModels> {
    const [server, page] = await Promise.all([this._server.get(), this._page.get()]);
    const kernelspecs = { ...server.kernelspecs };
    this._owners.pageSpecs.clear();
    for (const [name, spec] of Object.entries(page.kernelspecs)) {
      if (!spec || name in kernelspecs) continue;
      kernelspecs[name] = { ...spec, display_name: inApp(spec.display_name) };
      this._owners.pageSpecs.add(name);
    }
    return { default: server.default || page.default, kernelspecs };
  }
}

/** "TypeScript (cdp-kernel)" becomes "TypeScript (cdp-kernel, in app)". */
export function inApp(name: string): string {
  return name.endsWith(')') ? `${name.slice(0, -1)}, in app)` : `${name} (in app)`;
}

export class MixedKernelClient implements Kernel.IKernelAPIClient {
  constructor(
    readonly serverSettings: ServerConnection.ISettings,
    private _server: Kernel.IKernelAPIClient,
    private _page: Kernel.IKernelAPIClient,
    private _owners: Owners,
  ) {}

  private _for(id: string): Kernel.IKernelAPIClient {
    return this._owners.ofKernel(id) === 'page' ? this._page : this._server;
  }

  async listRunning(): Promise<Kernel.IModel[]> {
    const [server, page] = await Promise.all([
      this._server.listRunning(),
      this._page.listRunning(),
    ]);
    return [...server, ...page];
  }
  getModel(id: string): Promise<Kernel.IModel | undefined> {
    return this._for(id).getModel(id);
  }
  startNew(options: Kernel.IKernelOptions = {}): Promise<Kernel.IModel> {
    const side = this._owners.ofSpec(options.name);
    return (side === 'page' ? this._page : this._server).startNew(options);
  }
  restart(id: string): Promise<void> {
    return this._for(id).restart(id);
  }
  interrupt(id: string): Promise<void> {
    return this._for(id).interrupt(id);
  }
  shutdown(id: string): Promise<void> {
    return this._for(id).shutdown(id);
  }
}

/**
 * Sessions on either side, under ids the UI keeps. Changing a session's
 * kernel to one on the other side ends it there and starts it again on the
 * new side for the same path; the UI's session id stays the same, since
 * the UI's session connection never learns a new one.
 */
export class MixedSessionClient implements Session.ISessionAPIClient {
  constructor(
    readonly serverSettings: ServerConnection.ISettings,
    private _server: Session.ISessionAPIClient,
    private _page: Session.ISessionAPIClient,
    private _owners: Owners,
  ) {}

  private _client(side: Side): Session.ISessionAPIClient {
    return side === 'page' ? this._page : this._server;
  }

  private _outer(side: Side, model: Session.IModel): Session.IModel {
    return { ...model, id: this._owners.outerSession(side, model.id) };
  }

  /** The side a kernel request names: by id for a running kernel, else by spec name. */
  private _sideOf(kernel: { id?: string; name?: string } | null | undefined): Side | undefined {
    if (!kernel) return undefined;
    if (kernel.id) return this._owners.ofKernel(kernel.id);
    if (kernel.name) return this._owners.ofSpec(kernel.name);
    return undefined;
  }

  async listRunning(): Promise<Session.IModel[]> {
    const [server, page] = await Promise.all([
      this._server.listRunning(),
      this._page.listRunning(),
    ]);
    return [...server.map(m => this._outer('server', m)), ...page.map(m => this._outer('page', m))];
  }

  async getModel(id: string): Promise<Session.IModel> {
    const inner = this._owners.ofSession(id);
    return { ...(await this._client(inner.side).getModel(inner.id)), id };
  }

  async startNew(options: Session.ISessionOptions): Promise<Session.IModel> {
    const side = this._sideOf(options.kernel) ?? 'server';
    return this._outer(side, await this._client(side).startNew(options));
  }

  async shutdown(id: string): Promise<void> {
    const inner = this._owners.ofSession(id);
    await this._client(inner.side).shutdown(inner.id);
    this._owners.sessions.delete(id);
  }

  async update(model: Parameters<Session.ISessionAPIClient['update']>[0]): Promise<Session.IModel> {
    const inner = this._owners.ofSession(model.id);
    const side = this._sideOf(model.kernel as { id?: string; name?: string } | undefined);
    if (side === undefined || side === inner.side) {
      const updated = await this._client(inner.side).update({ ...model, id: inner.id });
      return { ...updated, id: model.id };
    }
    // The new kernel is on the other side: move the session there.
    const old = await this._client(inner.side).getModel(inner.id);
    await this._client(inner.side).shutdown(inner.id);
    const started = await this._client(side).startNew({
      path: model.path ?? old.path,
      name: model.name ?? old.name,
      type: model.type ?? old.type,
      kernel: model.kernel as Session.ISessionOptions['kernel'],
    });
    this._owners.sessions.set(model.id, { side, id: started.id });
    return { ...started, id: model.id };
  }
}

/** The id in a kernel channels URL, `…/api/kernels/<id>/channels?…`. */
export function kernelIdFrom(url: string): string | undefined {
  const m = /\/api\/kernels\/([^/?#]+)\/channels/.exec(url);
  return m ? decodeURIComponent(m[1]!) : undefined;
}

/**
 * A WebSocket class that opens mock-socket's socket for URLs `isPage`
 * claims and the browser's for the rest. Constructing a class that returns
 * another object yields that object, so `new` works as the services expect.
 */
export function dispatchingSocket(isPage: (url: string) => boolean): typeof WebSocket {
  class DispatchingSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;
    constructor(url: string | URL, protocols?: string | string[]) {
      const href = String(url);
      return (isPage(href)
        ? new PageSocket(href, protocols)
        : new WebSocket(href, protocols)) as unknown as DispatchingSocket;
    }
  }
  return DispatchingSocket as unknown as typeof WebSocket;
}

/**
 * The combined manager. Disposing it also disposes the page's manager,
 * which shuts the page's kernels down (`lite.ts`); the server's kernels
 * are left running, as with any server.
 */
class MixedServiceManager extends ServiceManager {
  constructor(
    private _page: ServiceManager.IManager,
    options: Partial<ServiceManager.IOptions>,
  ) {
    super(options);
  }
  dispose(): void {
    if (this.isDisposed) return;
    this._page.dispose();
    super.dispose();
  }
}
