import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FromKernel } from './lib/kernel-relay';

// The kernel web view's page, with cdp-kernel's browser kernel faked.

type Listener = (channel: string, msg: unknown) => void;
const mocks = vi.hoisted(() => ({
  kernels: [] as { send: ReturnType<typeof vi.fn>; listener?: Listener; close(): void }[],
  options: [] as Record<string, unknown>[],
}));

vi.mock('@tlockney/cdp-kernel/browser/worker?worker&url', () => ({ default: '/worker.js' }));
vi.mock('@tlockney/cdp-kernel/browser', () => ({
  startBrowserKernel: (options: Record<string, unknown>) => {
    mocks.options.push(options);
    let close!: () => void;
    const kernel = {
      send: vi.fn(),
      listener: undefined as Listener | undefined,
      close: () => close(),
      closed: new Promise<void>(r => (close = r)),
      onMessage(l: Listener) {
        kernel.listener = l;
        return () => {};
      },
    };
    mocks.kernels.push(kernel);
    return kernel;
  },
}));

const posted: FromKernel[] = [];
const stubWebkit = () =>
  vi.stubGlobal('webkit', {
    messageHandlers: { kernelHost: { postMessage: (m: FromKernel) => posted.push(m) } },
  });
stubWebkit();
const { deliver, deviceOptions } = await import('./kernel-host');
// The setup unstubs globals between tests.
beforeEach(stubWebkit);

const json = (msg: unknown) => JSON.stringify(msg);

describe('kernel host page', () => {
  it('says it is ready, then runs one kernel per id and tags what it sends with the run', async () => {
    expect(posted).toEqual([{ op: 'ready' }]);
    deliver({ kernel: 'k1', op: 'start', run: 1 });
    const [kernel] = mocks.kernels;
    deliver({ kernel: 'k1', op: 'send', channel: 'shell', json: json({ buffers: ['AQI='] }) });
    deliver({ kernel: 'k1', op: 'send', channel: 'iopub', json: json({}) });
    deliver({ kernel: 'nope', op: 'send', channel: 'shell', json: json({}) });
    expect(kernel!.send).toHaveBeenCalledTimes(1);
    const [channel, msg] = kernel!.send.mock.calls[0]!;
    expect(channel).toBe('shell');
    expect([...new Uint8Array((msg as { buffers: ArrayBuffer[] }).buffers[0]!)]).toEqual([1, 2]);

    kernel!.listener!('iopub', { header: {}, buffers: [new Uint8Array([1, 2])] });
    kernel!.close();
    await Promise.resolve();
    await Promise.resolve();
    expect(posted.slice(1)).toEqual([
      {
        kernel: 'k1',
        run: 1,
        op: 'message',
        channel: 'iopub',
        json: json({ header: {}, buffers: ['AQI='] }),
      },
      { kernel: 'k1', run: 1, op: 'closed' },
    ]);
  });

  it('gives kernels the device preload only when the app registered its handler', () => {
    expect(deviceOptions()).toEqual({});
    vi.stubGlobal('webkit', {
      messageHandlers: {
        kernelHost: { postMessage: () => {} },
        device: { postMessage: async () => ({}) },
      },
    });
    const options = deviceOptions() as {
      preload?: string[];
      host?: unknown;
      capabilities?: unknown;
    };
    expect(options.preload).toHaveLength(1);
    expect(new URL(options.preload![0]!).pathname).toMatch(/preload/);
    expect(typeof options.host).toBe('function');
    expect(options.capabilities).toEqual({ device: true });
  });

  it('starts kernels with the device options', () => {
    vi.stubGlobal('webkit', {
      messageHandlers: {
        kernelHost: { postMessage: () => {} },
        device: { postMessage: async () => ({}) },
      },
    });
    deliver({ kernel: 'dev', op: 'start', run: 2 });
    expect(mocks.options.at(-1)).toMatchObject({ capabilities: { device: true } });
  });

  it("tells Swift each kernel's device owner, for the permission ledger (#383)", () => {
    const got: unknown[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        kernelHost: { postMessage: (m: unknown) => got.push(m) },
        device: { postMessage: async () => ({}) },
      },
    });
    deliver({ kernel: 'o1', op: 'start', run: 3 });
    const owner = (mocks.options.at(-1)!.host as { owner: number }).owner;
    expect(got).toEqual([{ kernel: 'o1', op: 'owner', owner }]);
  });

  it('says no owner without the device handler', () => {
    const before = posted.length;
    deliver({ kernel: 'plain', op: 'start', run: 4 });
    expect(posted.slice(before)).toEqual([]);
  });

  it("releases a kernel's device handler when the kernel closes, and only that one", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        kernelHost: { postMessage: () => {} },
        device: { postMessage: async (m: unknown) => (sent.push(m), {}) },
      },
    });
    deliver({ kernel: 'a', op: 'start', run: 5 });
    const a = mocks.kernels.at(-1)!;
    const aOwner = (mocks.options.at(-1)!.host as { owner: number }).owner;
    deliver({ kernel: 'b', op: 'start', run: 6 });
    a.close();
    await Promise.resolve();
    expect(sent).toEqual([{ owner: aOwner, release: true }]);
  });

  it.each(['control', 'shell'])(
    "doesn't say closed for a kernel shut down on %s (#394)",
    async channel => {
      posted.length = 0;
      deliver({ kernel: 'r', op: 'start', run: 7 });
      const old = mocks.kernels.at(-1)!;
      const shutdown = { header: { msg_type: 'shutdown_request' }, content: { restart: false } };
      deliver({ kernel: 'r', op: 'send', channel, json: json(shutdown) });
      expect(old.send).toHaveBeenCalledOnce();
      old.close();
      await Promise.resolve();
      await Promise.resolve();
      expect(posted).toEqual([]);
    },
  );

  it('stops a kernel: its Worker is asked to end, and nothing it sends after goes anywhere', async () => {
    posted.length = 0;
    deliver({ kernel: 's', op: 'start', run: 8 });
    const old = mocks.kernels.at(-1)!;
    deliver({ kernel: 's', op: 'stop' });
    expect(old.send).toHaveBeenCalledOnce();
    const [channel, msg] = old.send.mock.calls[0]!;
    expect(channel).toBe('control');
    expect(msg).toMatchObject({ header: { msg_type: 'shutdown_request' } });
    // A restart under the same id: the old run's late reply and end say
    // nothing, and the new one runs.
    deliver({ kernel: 's', op: 'start', run: 9 });
    const next = mocks.kernels.at(-1)!;
    old.listener!('control', { header: { msg_type: 'shutdown_reply' } });
    old.close();
    await Promise.resolve();
    await Promise.resolve();
    expect(posted).toEqual([]);
    deliver({ kernel: 's', op: 'send', channel: 'shell', json: json({ n: 1 }) });
    expect(next.send).toHaveBeenCalledWith('shell', { n: 1 });
    next.listener!('iopub', { n: 2 });
    expect(posted).toEqual([
      { kernel: 's', run: 9, op: 'message', channel: 'iopub', json: json({ n: 2 }) },
    ]);
  });

  it('a start under a running id replaces that kernel', () => {
    deliver({ kernel: 't', op: 'start', run: 10 });
    const old = mocks.kernels.at(-1)!;
    deliver({ kernel: 't', op: 'start', run: 11 });
    expect(old.send).toHaveBeenCalledWith(
      'control',
      expect.objectContaining({
        header: expect.objectContaining({ msg_type: 'shutdown_request' }),
      }),
    );
  });
});
