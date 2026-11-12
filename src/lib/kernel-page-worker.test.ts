import { describe, expect, it, vi } from 'vitest';
import { mayReload, readyWhenCurrent, RELOADED_KEY, workerIsCurrent } from './kernel-page-worker';

// A service worker container with a registration whose update finds
// `found` (a new worker installing, or none).
function container(found: 'installing' | 'activating' | 'none' | 'fails', controller = true) {
  const target = new EventTarget();
  const current = controller ? {} : null;
  const registration = {
    installing: null as object | null,
    waiting: null as object | null,
    active: current as object | null,
    update: vi.fn(async () => {
      if (found === 'fails') throw new Error('offline');
      if (found === 'installing') registration.installing = {};
      if (found === 'activating') registration.active = {};
    }),
  };
  const sw = {
    controller: current,
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

  it('waits for a newer worker that is already activating', async () => {
    const { sw } = container('activating');
    const result = workerIsCurrent(asContainer(sw));
    await new Promise(r => setTimeout(r, 0));
    sw.claim();
    expect(await result).toBe(false);
  });

  it('gives up on a slow update check, or a slow install, and warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sw, registration } = container('none');
    registration.update.mockImplementation(() => new Promise(() => {}));
    expect(await workerIsCurrent(asContainer(sw), 10, 10)).toBe(true);
    expect(await workerIsCurrent(asContainer(container('installing').sw), 1000, 10)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('says ready, or reloads once, by what the check finds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const run = async (sw: object | undefined, current: boolean, canReload: boolean) => {
      const calls: string[] = [];
      await readyWhenCurrent(
        sw ? asContainer(sw) : undefined,
        { ready: () => calls.push('ready'), reload: () => calls.push('reload') },
        async () => current,
        () => canReload,
      );
      return calls;
    };
    const { sw } = container('none');
    expect(await run(undefined, false, true)).toEqual(['ready']);
    expect(await run(container('none', false).sw, false, true)).toEqual(['ready']);
    expect(await run(sw, true, true)).toEqual(['ready']);
    expect(await run(sw, false, true)).toEqual(['reload']);
    expect(warn).not.toHaveBeenCalled();
    expect(await run(sw, false, false)).toEqual(['ready']);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
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
