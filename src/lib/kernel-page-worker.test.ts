import { describe, expect, it, vi } from 'vitest';
import {
  mayReload,
  readyWhenCurrent,
  releaseIsCurrent,
  RELOADED_KEY,
  workerIsCurrent,
} from './kernel-page-worker';

// A service worker container with a registration whose update finds
// `found` (a new worker installing, or none).
function container(
  found: 'installing' | 'waiting' | 'activating' | 'none' | 'fails',
  controller = true,
) {
  const target = new EventTarget();
  const current = controller ? {} : null;
  // A new worker installing, which can fail and become redundant.
  const installing = Object.assign(new EventTarget(), { state: 'installing' });
  const registration = {
    installing: null as object | null,
    waiting: null as object | null,
    active: current as object | null,
    update: vi.fn(async () => {
      if (found === 'fails') throw new Error('offline');
      if (found === 'installing') registration.installing = installing;
      if (found === 'waiting') registration.waiting = {};
      if (found === 'activating') registration.active = {};
    }),
  };
  const sw = {
    controller: current,
    getRegistration: async () => registration,
    addEventListener: target.addEventListener.bind(target),
    claim: () => target.dispatchEvent(new Event('controllerchange')),
    failInstall: () => {
      installing.state = 'redundant';
      installing.dispatchEvent(new Event('statechange'));
    },
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await workerIsCurrent(asContainer(container('none').sw))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    expect(await workerIsCurrent(asContainer(container('fails').sw))).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('waits for a newer worker that is waiting', async () => {
    const { sw } = container('waiting');
    const result = workerIsCurrent(asContainer(sw));
    await new Promise(r => setTimeout(r, 0));
    sw.claim();
    expect(await result).toBe(false);
  });

  it('stops waiting when the newer worker fails to install', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sw } = container('installing');
    const result = workerIsCurrent(asContainer(sw), 1000, 60_000);
    await new Promise(r => setTimeout(r, 0));
    sw.failInstall();
    expect(await result).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
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
    const run = async (
      sw: object | undefined,
      current: boolean,
      canReload: boolean,
      sameRelease = true,
    ) => {
      const calls: string[] = [];
      await readyWhenCurrent(
        sw ? asContainer(sw) : undefined,
        { ready: () => calls.push('ready'), reload: () => calls.push('reload') },
        async () => current,
        () => canReload,
        async () => sameRelease,
      );
      return calls;
    };
    const { sw } = container('none');
    expect(await run(undefined, false, true)).toEqual(['ready']);
    expect(await run(container('none', false).sw, false, true)).toEqual(['ready']);
    expect(await run(sw, true, true)).toEqual(['ready']);
    expect(await run(sw, false, true)).toEqual(['reload']);
    // The worker found nothing newer, but the server serves another
    // release: a worker took control before the check (#537).
    expect(await run(sw, true, true, false)).toEqual(['reload']);
    expect(await run(undefined, true, true, false)).toEqual(['ready']);
    expect(warn).not.toHaveBeenCalled();
    expect(await run(sw, false, false)).toEqual(['ready']);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("compares this page's release with the server's", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const serving = (body: unknown, ok = true) =>
      vi.fn(async () => ({ ok, json: async () => body }) as Response);
    const load = serving({ release: 'ganymede-ui@0.10.1+abc' });
    expect(await releaseIsCurrent('ganymede-ui@0.10.1+abc', load)).toBe(true);
    expect(load).toHaveBeenCalledWith(
      'release.json',
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(await releaseIsCurrent('ganymede-ui@0.10.0+def', load)).toBe(false);
    // Nothing to compare, or no answer: current.
    expect(await releaseIsCurrent(undefined, load)).toBe(true);
    expect(await releaseIsCurrent('a', serving({}, false))).toBe(true);
    expect(await releaseIsCurrent('a', serving({}))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
    const offline = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await releaseIsCurrent('a', offline)).toBe(true);
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
