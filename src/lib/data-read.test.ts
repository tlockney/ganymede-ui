import { describe, expect, it } from 'vitest';
import { TooLarge, readStream, textOf } from './data-read';

const stream = (parts: string[], headers: Record<string, string> = {}) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(new TextEncoder().encode(p));
        c.close();
      },
    }),
    { headers },
  );

describe('readStream', () => {
  it('reads a small body whole', async () => {
    const r = await readStream(stream(['ab', 'cd']), 100, false);
    expect(new TextDecoder().decode(r.bytes)).toBe('abcd');
    expect(r.truncated).toBe(false);
  });

  it('stops at the cap and says the file was cut', async () => {
    const r = await readStream(stream(['abcd', 'efgh', 'ijkl']), 6, false);
    expect(new TextDecoder().decode(r.bytes)).toBe('abcdef');
    expect(r.truncated).toBe(true);
  });

  it('is not cut when the body is exactly the cap', async () => {
    const r = await readStream(stream(['abc', 'def']), 6, false);
    expect(r.truncated).toBe(false);
    expect(r.bytes).toHaveLength(6);
  });

  it('refuses a file past the cap when it can’t be cut', async () => {
    await expect(readStream(stream(['abcd', 'efgh']), 6, true)).rejects.toBeInstanceOf(TooLarge);
    await expect(
      readStream(stream(['x'], { 'content-length': '999999999' }), 6, true),
    ).rejects.toThrow(/opens files up to/);
  });
});

describe('textOf', () => {
  it('drops the record a cut left half-read', () => {
    const bytes = new TextEncoder().encode('a,b\n1,2\n3,');
    expect(textOf({ bytes, truncated: true }).text).toBe('a,b\n1,2\n');
    expect(textOf({ bytes, truncated: false }).text).toBe('a,b\n1,2\n3,');
  });
  it('drops a BOM', () => {
    const bytes = new TextEncoder().encode('﻿a');
    expect(textOf({ bytes, truncated: false }).text).toBe('a');
  });
});
