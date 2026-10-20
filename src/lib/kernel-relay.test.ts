import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeMessage,
  encodeMessage,
  type FromKernel,
  relayAvailable,
  startRelayedKernel,
} from './kernel-relay';

// The UI page's half of the Apple apps' kernel relay, against a fake
// `webkit.messageHandlers`; Swift's half is tested in apple/Tests.

const deliver = (m: FromKernel) =>
  (
    window as unknown as { ganymedeKernelRelay: { deliver(m: FromKernel): void } }
  ).ganymedeKernelRelay.deliver(m);

function fakeRelay() {
  const posted: unknown[] = [];
  vi.stubGlobal('webkit', {
    messageHandlers: { kernelRelay: { postMessage: (m: unknown) => posted.push(m) } },
  });
  return posted;
}

afterEach(() => vi.unstubAllGlobals());

describe('kernel relay', () => {
  it('is there only in the app', () => {
    expect(relayAvailable()).toBe(false);
    fakeRelay();
    expect(relayAvailable()).toBe(true);
  });

  it('starts the kernel, sends to it, and routes its messages by kernel id', () => {
    const posted = fakeRelay();
    const a = startRelayedKernel('a');
    const b = startRelayedKernel('b');
    const got: [string, string, unknown][] = [];
    a.onMessage((channel, msg) => got.push(['a', channel, msg]));
    const stopB = b.onMessage((channel, msg) => got.push(['b', channel, msg]));
    const msg = { header: { msg_type: 'execute_request' } } as never;
    a.send('shell', msg);
    expect(posted).toEqual([
      { kernel: 'a', op: 'start' },
      { kernel: 'b', op: 'start' },
      { kernel: 'a', op: 'send', channel: 'shell', msg },
    ]);

    deliver({ kernel: 'b', op: 'message', channel: 'iopub', msg: { n: 1 } });
    deliver({ kernel: 'a', op: 'closed' });
    stopB();
    deliver({ kernel: 'b', op: 'message', channel: 'iopub', msg: { n: 2 } });
    expect(got).toEqual([['b', 'iopub', { n: 1 }]]);
  });

  it('carries binary buffers as base64', () => {
    const bytes = new Uint8Array([0, 1, 254, 255]);
    const encoded = encodeMessage({ content: {}, buffers: [bytes, bytes.buffer] }) as {
      buffers: string[];
    };
    expect(encoded.buffers).toEqual(['AAH+/w==', 'AAH+/w==']);
    const decoded = decodeMessage(encoded) as { buffers: ArrayBuffer[] };
    expect([...new Uint8Array(decoded.buffers[0]!)]).toEqual([0, 1, 254, 255]);
    const plain = { content: {}, buffers: [] };
    expect(encodeMessage(plain)).toBe(plain);
  });
});
