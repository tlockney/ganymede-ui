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

describe('kernel host page', () => {
  it('says it is ready, then runs and relays one kernel per id', async () => {
    expect(posted).toEqual([{ op: 'ready' }]);
    deliver({ kernel: 'k1', op: 'start' });
    const [kernel] = mocks.kernels;
    deliver({ kernel: 'k1', op: 'send', channel: 'shell', msg: { buffers: ['AQI='] } });
    deliver({ kernel: 'k1', op: 'send', channel: 'iopub', msg: {} });
    deliver({ kernel: 'nope', op: 'send', channel: 'shell', msg: {} });
    expect(kernel!.send).toHaveBeenCalledTimes(1);
    const [channel, msg] = kernel!.send.mock.calls[0]!;
    expect(channel).toBe('shell');
    expect([...new Uint8Array((msg as { buffers: ArrayBuffer[] }).buffers[0]!)]).toEqual([1, 2]);

    kernel!.listener!('iopub', { header: {} });
    kernel!.close();
    await Promise.resolve();
    await Promise.resolve();
    expect(posted.slice(1)).toEqual([
      { kernel: 'k1', op: 'message', channel: 'iopub', msg: { header: {} } },
      { kernel: 'k1', op: 'closed' },
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
    deliver({ kernel: 'dev', op: 'start' });
    expect(mocks.options.at(-1)).toMatchObject({ capabilities: { device: true } });
  });

  it("releases a kernel's device handler when the kernel closes, and only that one", async () => {
    const sent: unknown[] = [];
    vi.stubGlobal('webkit', {
      messageHandlers: {
        kernelHost: { postMessage: () => {} },
        device: { postMessage: async (m: unknown) => (sent.push(m), {}) },
      },
    });
    deliver({ kernel: 'a', op: 'start' });
    const a = mocks.kernels.at(-1)!;
    const aOwner = (mocks.options.at(-1)!.host as { owner: number }).owner;
    deliver({ kernel: 'b', op: 'start' });
    a.close();
    await Promise.resolve();
    expect(sent).toEqual([{ owner: aOwner, release: true }]);
  });

  it("doesn't say closed for a kernel the UI shut down, so a restart under its id lives (#394)", async () => {
    posted.length = 0;
    deliver({ kernel: 'r', op: 'start' });
    const old = mocks.kernels.at(-1)!;
    const shutdown = { header: { msg_type: 'shutdown_request' }, content: { restart: false } };
    deliver({ kernel: 'r', op: 'send', channel: 'control', msg: shutdown });
    expect(old.send).toHaveBeenCalledOnce();
    // The old kernel ends after the restart's start has gone by: the new
    // one is under the id, and nothing says closed.
    old.close();
    await Promise.resolve();
    await Promise.resolve();
    deliver({ kernel: 'r', op: 'start' });
    const next = mocks.kernels.at(-1)!;
    expect(posted).toEqual([]);
    // One that ends on its own still says so.
    next.close();
    await Promise.resolve();
    await Promise.resolve();
    expect(posted).toEqual([{ kernel: 'r', op: 'closed' }]);
  });
});
