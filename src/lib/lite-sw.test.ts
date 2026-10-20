import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contents, KernelMessage } from '@jupyterlab/services';
import { ServiceWorkerBridge } from './lite-sw';

/**
 * A BroadcastChannel that delivers within the test: what the bridge posts
 * lands in `sent`, and `request` plays the service worker relaying a
 * kernel Worker's request.
 */
class FakeChannel extends EventTarget {
  static last: FakeChannel;
  sent: unknown[] = [];
  closed = false;
  constructor(readonly name: string) {
    super();
    FakeChannel.last = this;
  }
  postMessage(message: unknown) {
    if (this.closed) throw new Error('Channel is closed');
    this.sent.push(message);
  }
  close() {
    this.closed = true;
  }
  request(message: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: message }));
  }
}

const tick = () => new Promise(resolve => setTimeout(resolve));

function bridgeWith(handleStdin: () => Promise<unknown>) {
  const bridge = new ServiceWorkerBridge({
    contents: {} as Contents.IManager,
    handleStdin: handleStdin as () => Promise<KernelMessage.IInputReplyMsg>,
  });
  // No service workers in jsdom.
  bridge.ready.catch(() => {});
  const channel = FakeChannel.last;
  const ask = (requestId: string, pathname: string) =>
    channel.request({
      browsingContextId: bridge.browsingContextId,
      requestId,
      pathname,
      data: {},
    });
  return { bridge, channel, ask };
}

describe('ServiceWorkerBridge', () => {
  beforeEach(() => {
    vi.stubGlobal('BroadcastChannel', FakeChannel);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('answers a stdin request whose handler fails', async () => {
    const { bridge, channel, ask } = bridgeWith(() => Promise.reject(new Error('no kernel')));
    ask('r1', '/api/stdin/kernel');
    await tick();
    expect(channel.sent).toEqual([
      { response: null, browsingContextId: bridge.browsingContextId, requestId: 'r1' },
    ]);
  });

  it('answers a stdin request it has no handler for', async () => {
    const { channel, ask } = bridgeWith(() => new Promise(() => {}));
    ask('r1', '/api/stdin/other');
    await tick();
    expect(channel.sent).toMatchObject([{ response: null, requestId: 'r1' }]);
  });

  it('answers pending requests when disposed, and only once', async () => {
    let reply!: (value: unknown) => void;
    const { bridge, channel, ask } = bridgeWith(() => new Promise(resolve => (reply = resolve)));
    ask('r1', '/api/stdin/kernel');
    await tick();
    expect(channel.sent).toEqual([]);

    bridge.dispose();
    expect(channel.sent).toMatchObject([{ response: null, requestId: 'r1' }]);
    expect(channel.closed).toBe(true);

    // The handler finishing later posts nothing on the closed channel.
    reply({ content: { value: 'late' } });
    await tick();
    expect(channel.sent).toHaveLength(1);
  });

  it('ignores other pages’ requests', async () => {
    const { channel } = bridgeWith(() => Promise.resolve({}));
    channel.request({ browsingContextId: 'elsewhere', requestId: 'r1', pathname: '/api/drive' });
    await tick();
    expect(channel.sent).toEqual([]);
  });
});
