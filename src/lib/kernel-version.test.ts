import { describe, expect, it } from 'vitest';
import { kernelVersionLine } from './kernel-version';

describe('kernelVersionLine', () => {
  it('joins the implementation and the runtime in a cdp-kernel banner', () => {
    expect(
      kernelVersionLine({
        implementation: 'cdp-kernel',
        implementation_version: '0.14.0',
        banner: 'cdp-kernel on node 24.11.0 (V8 13.6.233.10-node.28)',
      }),
    ).toBe('cdp-kernel 0.14.0 · node 24.11.0');
  });

  it('shows another kernel by what it reports', () => {
    expect(
      kernelVersionLine({
        implementation: 'ipython',
        implementation_version: '8.20.0',
        banner: "Python 3.12.1 (main) \nType 'copyright' for more information",
      }),
    ).toBe('ipython 8.20.0');
  });

  it('keeps a dated or dashed runtime version whole, and handles other runtimes', () => {
    expect(
      kernelVersionLine({
        implementation: 'cdp-kernel',
        implementation_version: '0.14.0',
        banner: 'cdp-kernel on workerd 2026-10-15 (V8 13)',
      }),
    ).toBe('cdp-kernel 0.14.0 · workerd 2026-10-15');
    expect(
      kernelVersionLine({
        implementation: 'cdp-kernel',
        implementation_version: '0.14.0',
        banner: 'cdp-kernel on deno 2.1.4 (V8 13)',
      }),
    ).toBe('cdp-kernel 0.14.0 · deno 2.1.4');
    // A Miniflare banner that names no runtime.
    expect(
      kernelVersionLine({
        implementation: 'cdp-kernel',
        implementation_version: '0.14.0',
        banner: 'cdp-kernel in Miniflare',
      }),
    ).toBe('cdp-kernel 0.14.0');
  });

  it('shows the name alone without a version', () => {
    expect(kernelVersionLine({ implementation: 'xeus-cpp', implementation_version: '' })).toBe(
      'xeus-cpp',
    );
    expect(kernelVersionLine({ implementation: 'xeus-cpp' })).toBe('xeus-cpp');
  });

  it('shows nothing without an implementation, never "undefined"', () => {
    expect(kernelVersionLine(undefined)).toBeUndefined();
    expect(kernelVersionLine(null)).toBeUndefined();
    expect(kernelVersionLine({})).toBeUndefined();
    expect(
      kernelVersionLine({ status: 'error', ename: 'E', evalue: '', traceback: [] }),
    ).toBeUndefined();
    expect(kernelVersionLine({ implementation_version: '1.0' })).toBeUndefined();
    expect(kernelVersionLine({ implementation: '  ', implementation_version: '1.0' })).toBe(
      undefined,
    );
    expect(kernelVersionLine({ implementation: 5 })).toBeUndefined();
  });

  it('ignores a banner that names no runtime version', () => {
    expect(
      kernelVersionLine({ implementation: 'k', implementation_version: '1', banner: 'on node' }),
    ).toBe('k 1');
    expect(kernelVersionLine({ implementation: 'k', banner: 5 })).toBe('k');
  });
});
