import type { Kernel, KernelSpec, ServerConnection, Session } from '@jupyterlab/services';
import { describe, expect, it, vi } from 'vitest';
import {
  MixedKernelClient,
  MixedKernelSpecClient,
  MixedSessionClient,
  Owners,
  inApp,
  kernelIdFrom,
} from './mixed';

const settings = {} as ServerConnection.ISettings;

function spec(name: string, display_name: string): KernelSpec.ISpecModel {
  return { name, display_name, language: 'typescript', argv: [], resources: {} };
}

function specClient(specs: KernelSpec.ISpecModels): KernelSpec.IKernelSpecAPIClient {
  return { serverSettings: settings, get: async () => specs };
}

/** Owners whose page kernels are `pageKernels`, with the page's specs merged in. */
async function setup(pageKernels: Set<string> = new Set()) {
  const owners = new Owners({ hasKernel: id => pageKernels.has(id) });
  const specs = new MixedKernelSpecClient(
    settings,
    specClient({
      default: 'cdp-node',
      kernelspecs: {
        'cdp-node': spec('cdp-node', 'TypeScript (Node)'),
        javascript: spec('javascript', 'JavaScript (Node)'),
      },
    }),
    specClient({
      default: 'cdp-browser',
      kernelspecs: {
        'cdp-browser': spec('cdp-browser', 'TypeScript (cdp-kernel)'),
        javascript: spec('javascript', 'JavaScript (Web Worker)'),
      },
    }),
    owners,
  );
  return { owners, merged: await specs.get() };
}

describe('MixedKernelSpecClient', () => {
  it("adds the page's cdp-kernel spec, marked as in the app, and no other", async () => {
    const { owners, merged } = await setup();
    expect(merged.default).toBe('cdp-node');
    expect(Object.keys(merged.kernelspecs).sort()).toEqual([
      'cdp-browser',
      'cdp-node',
      'javascript',
    ]);
    expect(merged.kernelspecs['cdp-browser']!.display_name).toBe('TypeScript (cdp-kernel, in app)');
    // The page's Web Worker kernel stays out; the server's keeps its name.
    expect(merged.kernelspecs.javascript!.display_name).toBe('JavaScript (Node)');
    expect([...owners.pageSpecs]).toEqual(['cdp-browser']);
  });
});

describe('inApp', () => {
  it('marks a display name', () => {
    expect(inApp('TypeScript (cdp-kernel)')).toBe('TypeScript (cdp-kernel, in app)');
    expect(inApp('Deno')).toBe('Deno (in app)');
  });
});

function kernelClient(prefix: string): Kernel.IKernelAPIClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    serverSettings: settings,
    listRunning: async () => [{ id: `${prefix}-k`, name: prefix }],
    getModel: async id => (calls.push(`getModel ${id}`), { id, name: prefix }),
    startNew: async options => (
      calls.push(`startNew ${options?.name}`),
      { id: `${prefix}-new`, name: options!.name! }
    ),
    restart: async id => void calls.push(`restart ${id}`),
    interrupt: async id => void calls.push(`interrupt ${id}`),
    shutdown: async id => void calls.push(`shutdown ${id}`),
  };
}

describe('MixedKernelClient', () => {
  it('starts by spec name and routes later calls by kernel id', async () => {
    const { owners } = await setup(new Set(['page-k']));
    const server = kernelClient('server');
    const page = kernelClient('page');
    const client = new MixedKernelClient(settings, server, page, owners);

    expect((await client.startNew({ name: 'cdp-browser' })).id).toBe('page-new');
    expect((await client.startNew({ name: 'cdp-node' })).id).toBe('server-new');
    await client.interrupt('page-k');
    await client.restart('server-k');
    await client.shutdown('page-k');
    expect(page.calls).toEqual(['startNew cdp-browser', 'interrupt page-k', 'shutdown page-k']);
    expect(server.calls).toEqual(['startNew cdp-node', 'restart server-k']);
    expect((await client.listRunning()).map(k => k.id)).toEqual(['server-k', 'page-k']);
  });

  it('keeps routing a page kernel to the page after it ends', async () => {
    const { owners } = await setup();
    const client = new MixedKernelClient(
      settings,
      kernelClient('server'),
      kernelClient('page'),
      owners,
    );
    const { id } = await client.startNew({ name: 'cdp-browser' });
    // hasKernel no longer knows it (setup's set is empty), as during a restart.
    expect(owners.ofKernel(id)).toBe('page');
  });
});

function sessionClient(prefix: string) {
  let n = 0;
  const running = new Map<string, Session.IModel>();
  const client: Session.ISessionAPIClient = {
    serverSettings: settings,
    listRunning: async () => [...running.values()],
    getModel: async id => running.get(id)!,
    startNew: async options => {
      const kernel = options.kernel as { name?: string };
      const model: Session.IModel = {
        id: `${prefix}-s${++n}`,
        path: options.path,
        name: options.name,
        type: options.type,
        kernel: { id: `${prefix}-k${n}`, name: kernel?.name ?? '' },
      };
      running.set(model.id, model);
      return model;
    },
    shutdown: async id => void running.delete(id),
    update: vi.fn(async model => {
      const current = running.get(model.id)!;
      const next = { ...current, ...(model as Partial<Session.IModel>), kernel: current.kernel };
      running.set(model.id, next);
      return next;
    }),
  };
  return { client, running };
}

describe('MixedSessionClient', () => {
  const options = (kernel: string): Session.ISessionOptions => ({
    path: 'moons.ipynb',
    name: 'moons.ipynb',
    type: 'notebook',
    kernel: { name: kernel },
  });

  it('starts each session on the side of its kernel and lists both', async () => {
    const { owners } = await setup();
    const server = sessionClient('server');
    const page = sessionClient('page');
    const client = new MixedSessionClient(settings, server.client, page.client, owners);

    expect((await client.startNew(options('cdp-browser'))).id).toBe('page-s1');
    expect((await client.startNew(options('cdp-node'))).id).toBe('server-s1');
    expect(page.running.size).toBe(1);
    expect((await client.listRunning()).map(s => s.id).sort()).toEqual(['page-s1', 'server-s1']);
  });

  it("moves a session to the other side when its kernel changes, keeping the UI's id", async () => {
    const { owners } = await setup();
    const server = sessionClient('server');
    const page = sessionClient('page');
    const client = new MixedSessionClient(settings, server.client, page.client, owners);

    const started = await client.startNew(options('cdp-node'));
    const moved = await client.update({ id: started.id, kernel: { name: 'cdp-browser' } });
    expect(moved.id).toBe(started.id);
    expect(moved.path).toBe('moons.ipynb');
    expect(moved.kernel?.name).toBe('cdp-browser');
    expect(server.running.size).toBe(0);
    expect(page.running.size).toBe(1);

    // Later calls reach the page's session under the same id.
    expect((await client.getModel(started.id)).kernel?.name).toBe('cdp-browser');
    expect((await client.listRunning()).map(s => s.id)).toEqual([started.id]);
    await client.shutdown(started.id);
    expect(page.running.size).toBe(0);
  });

  it('lists the session once, under its id, while it moves', async () => {
    const { owners } = await setup();
    const server = sessionClient('server');
    const page = sessionClient('page');
    const client = new MixedSessionClient(settings, server.client, page.client, owners);
    const started = await client.startNew(options('cdp-node'));

    // Hold the page's start until a listing has begun.
    let release!: () => void;
    const held = new Promise<void>(r => (release = r));
    const start = page.client.startNew.bind(page.client);
    page.client.startNew = async o => (await held, start(o));

    const moving = client.update({ id: started.id, kernel: { name: 'cdp-browser' } });
    const listing = client.listRunning();
    await Promise.resolve();
    release();
    const [moved, listed] = await Promise.all([moving, listing]);
    expect(moved.id).toBe(started.id);
    expect(listed.map(s => [s.id, s.kernel?.name])).toEqual([[started.id, 'cdp-browser']]);
    expect(server.running.size).toBe(0);
  });

  it('leaves the session where it was when the move fails', async () => {
    const { owners } = await setup();
    const server = sessionClient('server');
    const page = sessionClient('page');
    const client = new MixedSessionClient(settings, server.client, page.client, owners);
    const started = await client.startNew(options('cdp-node'));
    page.client.startNew = async () => {
      throw new Error('no kernel');
    };

    await expect(
      client.update({ id: started.id, kernel: { name: 'cdp-browser' } }),
    ).rejects.toThrow('no kernel');
    expect(server.running.size).toBe(1);
    expect((await client.getModel(started.id)).kernel?.name).toBe('cdp-node');
    expect((await client.listRunning()).map(s => s.id)).toEqual([started.id]);
  });

  it('forgets sessions that ended elsewhere', async () => {
    const { owners } = await setup();
    const server = sessionClient('server');
    const page = sessionClient('page');
    const client = new MixedSessionClient(settings, server.client, page.client, owners);
    const started = await client.startNew(options('cdp-node'));
    await client.update({ id: started.id, kernel: { name: 'cdp-browser' } });
    page.running.clear();
    expect(await client.listRunning()).toEqual([]);
    expect(owners.sessionCount).toBe(0);
  });

  it('updates in place when the kernel stays on the same side', async () => {
    const { owners } = await setup();
    const server = sessionClient('server');
    const page = sessionClient('page');
    const client = new MixedSessionClient(settings, server.client, page.client, owners);

    const started = await client.startNew(options('cdp-node'));
    await client.update({ id: started.id, path: 'renamed.ipynb' });
    expect(server.client.update).toHaveBeenCalledOnce();
    expect((await client.getModel(started.id)).path).toBe('renamed.ipynb');
  });
});

describe('kernelIdFrom', () => {
  it("reads the id from a kernel's channels URL", () => {
    expect(
      kernelIdFrom('ws://127.0.0.1:8888/api/kernels/a%2Fb/channels?session_id=x&token=t'),
    ).toBe('a/b');
    expect(kernelIdFrom('ws://127.0.0.1:8888/api/events/subscribe')).toBeUndefined();
  });
});
