import { describe, expect, it } from 'vitest';
import { codePointLength, codePointToOffset, offsetToCodePoint } from './code-points';

describe('code point offsets', () => {
  it('are the offset itself without astral characters', () => {
    expect(codePointToOffset('const a = 1', 6)).toBe(6);
    expect(offsetToCodePoint('const a = 1', 6)).toBe(6);
  });

  it('count an emoji as one code point and two UTF-16 units, both ways', () => {
    const code = "'😀😀' + a";
    // After the two emoji: 3 code points, 5 units.
    expect(codePointToOffset(code, 3)).toBe(5);
    expect(offsetToCodePoint(code, 5)).toBe(3);
    expect(codePointLength(code)).toBe(8);
    expect(code.length).toBe(10);
  });

  it('clamp to the text and to zero', () => {
    expect(codePointToOffset('ab', 99)).toBe(2);
    expect(codePointToOffset('ab', -1)).toBe(0);
    expect(offsetToCodePoint('ab', 99)).toBe(2);
    expect(offsetToCodePoint('ab', -3)).toBe(0);
  });
});
