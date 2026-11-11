import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  declareDevice,
  declaredDevice,
  decodeMessage,
  encodeMessage,
  relayAvailable,
  reportMoved,
} from './kernel-relay';

// What the notebook page tells the Apple apps, against a fake
// `webkit.messageHandlers`; Swift's half is tested in apple/Tests.

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

  it('tells the app of renames and declarations (#383)', () => {
    reportMoved('x.ipynb', 'y.ipynb');
    declareDevice('a.ipynb', { ganymede: { device: ['location'] } });
    const posted = fakeRelay();
    reportMoved('a.ipynb', 'b.ipynb');
    reportMoved('b.ipynb', 'b.ipynb');
    declareDevice('b.ipynb', { ganymede: { device: ['location', 'contacts', 'location'] } });
    declareDevice('c.ipynb', {});
    expect(posted).toEqual([
      { op: 'moved', from: 'a.ipynb', to: 'b.ipynb' },
      { op: 'declared', path: 'b.ipynb', capabilities: ['location', 'contacts'] },
    ]);
  });

  it('reads only strings from metadata.ganymede.device', () => {
    expect(declaredDevice(undefined)).toEqual([]);
    expect(declaredDevice({ ganymede: { device: 'location' } })).toEqual([]);
    expect(declaredDevice({ ganymede: { device: ['location', 3, '', null, 'camera'] } })).toEqual([
      'location',
      'camera',
    ]);
  });
});
