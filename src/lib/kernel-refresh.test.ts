import { describe, expect, it, vi } from 'vitest';
import { REFRESH_GAP_MS, refreshKernelsOnReturn } from './kernel-refresh';

function setup() {
  const manager = { refreshSpecs: vi.fn(() => Promise.resolve()) };
  let t = 10_000;
  const stop = refreshKernelsOnReturn(manager, window, () => t);
  return { manager, stop, advance: (ms: number) => (t += ms) };
}

describe('refreshKernelsOnReturn', () => {
  it('refreshes when the window gets focus', () => {
    const { manager, stop } = setup();
    window.dispatchEvent(new Event('focus'));
    expect(manager.refreshSpecs).toHaveBeenCalledTimes(1);
    stop();
  });

  it('refreshes when the page becomes visible', () => {
    const { manager, stop } = setup();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(manager.refreshSpecs).toHaveBeenCalledTimes(1);
    stop();
  });

  it('skips a hidden page', () => {
    const { manager, stop } = setup();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(manager.refreshSpecs).not.toHaveBeenCalled();
    stop();
  });

  it('asks at most once per gap', () => {
    const { manager, stop, advance } = setup();
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(manager.refreshSpecs).toHaveBeenCalledTimes(1);
    advance(REFRESH_GAP_MS);
    window.dispatchEvent(new Event('focus'));
    expect(manager.refreshSpecs).toHaveBeenCalledTimes(2);
    stop();
  });

  it('keeps the list when a refresh fails', async () => {
    const manager = { refreshSpecs: vi.fn(() => Promise.reject(new Error('offline'))) };
    const stop = refreshKernelsOnReturn(manager);
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    expect(manager.refreshSpecs).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops listening after cleanup', () => {
    const { manager, stop } = setup();
    stop();
    window.dispatchEvent(new Event('focus'));
    expect(manager.refreshSpecs).not.toHaveBeenCalled();
  });
});
