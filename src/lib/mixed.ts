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
import { CDP_KERNEL_NAME } from './cdp-kernel';
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
      return id !== undefined && owners.ofKernel(id) === 'page';
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
  const services = new MixedServiceManager(() => lite.dispose(), {
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

/** The page's kernel specs that join the server's: cdp-kernel, for `device`. */
export const PAGE_SPECS: ReadonlySet<string> = new Set([CDP_KERNEL_NAME]);

/** Which side owns a kernel spec, a kernel, or a session. */
export class Owners {
  /** Page kernel spec names that made it into the merged list. */
  readonly pageSpecs = new Set<string>();
  /**
   * Every page kernel id seen, kept after the kernel ends, so a late call
   * or socket for it (a restart's, say) still goes to the page and not to
   * the server.
   */
  private _pageKernels = new Set<string>();
  /** The UI's session ids, each with its side and that side's session id. */
  private _sessions = new Map<string, { side: Side; id: string }>();
  /** The reverse: `side:id` to the UI's id. */
  private _outer = new Map<string, string>();

  constructor(private _lite: Pick<LiteParts, 'hasKernel'>) {}

  ofSpec(name: string | undefined): Side {
    return name !== undefined && this.pageSpecs.has(name) ? 'page' : 'server';
  }

  ofKernel(id: string): Side {
    return this._pageKernels.has(id) || this._lite.hasKernel(id) ? 'page' : 'server';
  }

  /** Remembers `id` as a page kernel. */
  pageKernel(id: string | undefined): void {
    if (id) this._pageKernels.add(id);
  }

  /** The side and inner id of the UI's session `id`; an unknown id is taken as the server's. */
  ofSession(id: string): { side: Side; id: string } {
    return this._sessions.get(id) ?? { side: 'server', id };
  }

  /** The UI's id for a side's session `id`, which becomes its own if it has none. */
  outerSession(side: Side, id: string): string {
    const outer = this._outer.get(`${side}:${id}`);
    if (outer !== undefined) return outer;
    this.setSession(id, side, id);
    return id;
  }

  /** Points the UI's session `outer` at a side's session `id`. */
  setSession(outer: string, side: Side, id: string): void {
    this.deleteSession(outer);
    this._sessions.set(outer, { side, id });
    this._outer.set(`${side}:${id}`, outer);
  }

  deleteSession(outer: string): void {
    const inner = this._sessions.get(outer);
    if (!inner) return;
    this._sessions.delete(outer);
    this._outer.delete(`${inner.side}:${inner.id}`);
  }

  /** The UI's session ids known now. */
  sessionIds(): Set<string> {
    return new Set(this._sessions.keys());
  }

  /** Forgets the sessions in `known` that are not in `listed`. */
  pruneSessions(known: ReadonlySet<string>, listed: ReadonlySet<string>): void {
    for (const id of known) if (!listed.has(id)) this.deleteSession(id);
  }

  /**
   * Sessions a move left behind because ending them failed: listings skip
   * them, so they don't take the UI's id back, until they are gone.
   */
  private _orphans = new Set<string>();

  orphan(side: Side, id: string): void {
    this._orphans.add(`${side}:${id}`);
  }

  /** Whether a side's session is an orphan; forgets orphans no longer listed. */
  isOrphan(side: Side, id: string): boolean {
    return this._orphans.has(`${side}:${id}`);
  }

  pruneOrphans(listed: ReadonlySet<string>): void {
    for (const key of this._orphans) if (!listed.has(key)) this._orphans.delete(key);
  }

  get sessionCount(): number {
    return this._sessions.size;
  }
}

/** The server's kernel specs, then the page's in PAGE_SPECS that the server lacks. */
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
      if (!spec || !PAGE_SPECS.has(name) || name in kernelspecs) continue;
      kernelspecs[name] = { ...spec, display_name: inApp(spec.display_name) };
      this._owners.pageSpecs.add(name);
    }
    const fallback = this._owners.pageSpecs.values().next().value;
    return { default: server.default || fallback || '', kernelspecs };
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
    for (const k of page) this._owners.pageKernel(k.id);
    return [...server, ...page];
  }
  getModel(id: string): Promise<Kernel.IModel | undefined> {
    return this._for(id).getModel(id);
  }
  async startNew(options: Kernel.IKernelOptions = {}): Promise<Kernel.IModel> {
    if (this._owners.ofSpec(options.name) === 'server') return this._server.startNew(options);
    const model = await this._page.startNew(options);
    this._owners.pageKernel(model.id);
    return model;
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
 * kernel to one on the other side starts it again on the new side for the
 * same path, then ends it on the old one; the UI's session id stays the
 * same, since the UI's session connection never learns a new one.
 */
export class MixedSessionClient implements Session.ISessionAPIClient {
  /** Moves under way; listings wait for them, so none sees a session half moved. */
  private _moves = new Set<Promise<unknown>>();
  /** Counts moves started, so a listing can tell one began while it ran. */
  private _moveCount = 0;

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
    if (side === 'page') this._owners.pageKernel(model.kernel?.id);
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
    for (;;) {
      await Promise.allSettled([...this._moves]);
      const count = this._moveCount;
      // Only ids known before listing may be pruned: a session started
      // meanwhile may be missing from this listing.
      const known = this._owners.sessionIds();
      const [server, page] = await Promise.all([
        this._server.listRunning(),
        this._page.listRunning(),
      ]);
      // A move that began meanwhile may show its session on both sides, or
      // on the new side under an id not yet mapped: list again after it.
      if (this._moveCount !== count || this._moves.size > 0) continue;
      this._owners.pruneOrphans(
        new Set([...server.map(m => `server:${m.id}`), ...page.map(m => `page:${m.id}`)]),
      );
      const live = (side: Side) => (m: Session.IModel) => !this._owners.isOrphan(side, m.id);
      const models = [
        ...server.filter(live('server')).map(m => this._outer('server', m)),
        ...page.filter(live('page')).map(m => this._outer('page', m)),
      ];
      this._owners.pruneSessions(known, new Set(models.map(m => m.id)));
      return models;
    }
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
    this._owners.deleteSession(id);
  }

  async update(model: Parameters<Session.ISessionAPIClient['update']>[0]): Promise<Session.IModel> {
    const inner = this._owners.ofSession(model.id);
    const side = this._sideOf(model.kernel as { id?: string; name?: string } | undefined);
    if (side === undefined || side === inner.side) {
      const updated = await this._client(inner.side).update({ ...model, id: inner.id });
      return { ...updated, id: model.id };
    }
    // The new kernel is on the other side: move the session there.
    this._moveCount++;
    const move = this._move(model, inner, side);
    this._moves.add(move);
    try {
      return await move;
    } finally {
      this._moves.delete(move);
    }
  }

  /**
   * Starts the session on `side`, points the UI's id at it, then ends the
   * old one. If the start fails, nothing has changed.
   */
  private async _move(
    model: Parameters<Session.ISessionAPIClient['update']>[0],
    inner: { side: Side; id: string },
    side: Side,
  ): Promise<Session.IModel> {
    const old = await this._client(inner.side).getModel(inner.id);
    const started = await this._client(side).startNew({
      path: model.path ?? old.path,
      name: model.name ?? old.name,
      type: model.type ?? old.type,
      kernel: model.kernel as Session.ISessionOptions['kernel'],
    });
    if (side === 'page') this._owners.pageKernel(started.kernel?.id);
    this._owners.setSession(model.id, side, started.id);
    try {
      await this._client(inner.side).shutdown(inner.id);
    } catch (err) {
      // Left running: keep listings from mapping the UI's id back to it.
      this._owners.orphan(inner.side, inner.id);
      console.warn(`Ending session ${inner.id} after moving it failed:`, err);
    }
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
 * The combined manager. Disposing it also shuts the page's kernels down
 * (`lite.ts`); the server's kernels are left running, as with any server.
 */
class MixedServiceManager extends ServiceManager {
  constructor(
    private _disposePage: () => void,
    options: Partial<ServiceManager.IOptions>,
  ) {
    super(options);
  }
  dispose(): void {
    if (this.isDisposed) return;
    this._disposePage();
    super.dispose();
  }
}
