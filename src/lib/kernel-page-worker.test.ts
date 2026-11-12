import { describe, expect, it, vi } from 'vitest';
import { mayReload, RELOADED_KEY, workerIsCurrent } from './kernel-page-worker';

// A service worker container with a registration whose update finds
// `found` (a new worker installing, or none).
function container(found: 'installing' | 'none' | 'fails', controller = true) {
  const target = new EventTarget();
  const registration = {
    installing: null as object | null,
    waiting: null as object | null,
    update: vi.fn(async () => {
      if (found === 'fails') throw new Error('offline');
      if (found === 'installing') registration.installing = {};
    }),
  };
  const sw = {
    controller: controller ? {} : null,
    getRegistration: async () => registration,
    addEventListener: target.addEventListener.bind(target),
    claim: () => target.dispatchEvent(new Event('controllerchange')),
  };
  return { sw, registration };
}

const asContainer = (sw: object) => sw as unknown as ServiceWorkerContainer;

describe('kernel page worker check', () => {
  it('is current with no worker in control', async () => {
    expect(await workerIsCurrent(undefined)).toBe(true);
    const { sw, registration } = container('installing', false);
    expect(await workerIsCurrent(asContainer(sw))).toBe(true);
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('is current when the update finds nothing newer, or fails', async () => {
    expect(await workerIsCurrent(asContainer(container('none').sw))).toBe(true);
    expect(await workerIsCurrent(asContainer(container('fails').sw))).toBe(true);
  });

  it('is not current once a newer worker takes control', async () => {
    const { sw } = container('installing');
    const result = workerIsCurrent(asContainer(sw));
    await new Promise(r => setTimeout(r, 0));
    sw.claim();
    expect(await result).toBe(false);
  });

  it('gives up waiting for a new worker after the timeout', async () => {
    const { sw } = container('installing');
    expect(await workerIsCurrent(asContainer(sw), 10)).toBe(true);
  });

  it('reloads a tab at most once', () => {
    const store = new Map<string, string>();
    const storage = () => ({
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    expect(mayReload(storage)).toBe(true);
    expect(store.get(RELOADED_KEY)).toBe('1');
    expect(mayReload(storage)).toBe(false);
    expect(
      mayReload(() => {
        throw new Error('no storage');
      }),
    ).toBe(false);
  });
});
