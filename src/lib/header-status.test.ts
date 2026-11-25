import { describe, expect, it } from 'vitest';
import type { BackendConfig } from './backends';
import { hostOf, placeOf, shortStatusText, statusText, type StatusInput } from './header-status';

const base = (config: BackendConfig, over: Partial<StatusInput> = {}): StatusInput => ({
  place: placeOf(config),
  dirty: false,
  locked: false,
  kernelName: 'cdp-node',
  kernelDisplay: 'TypeScript',
  status: 'idle',
  ...over,
});

const BROWSER: BackendConfig = { kind: 'browser' };
const LOCAL: BackendConfig = { kind: 'ganymede', url: '', token: '' };
const REMOTE: BackendConfig = {
  kind: 'ganymede',
  url: 'https://lab.example.com:8888/x',
  token: 't',
};
const MACHINE: BackendConfig = {
  kind: 'ganymede',
  url: '',
  token: '',
  machine: 'm1',
  machineName: 'Studio Mac',
};

describe('statusText (#801)', () => {
  it('names the browser backend', () => {
    expect(statusText(base(BROWSER))).toBe('Saved in this browser · Runs here · TypeScript');
  });

  it('names the host of a Ganymede server', () => {
    expect(statusText(base(REMOTE))).toBe(
      'Saved on lab.example.com:8888 · Runs on lab.example.com:8888 · TypeScript',
    );
    expect(statusText(base(LOCAL))).toBe(
      'Saved on local server · Runs on local server · TypeScript',
    );
  });

  it('names a connected machine, or a fallback without its name', () => {
    expect(statusText(base(MACHINE))).toBe('Saved on Studio Mac · Runs on Studio Mac · TypeScript');
    expect(hostOf({ ...MACHINE, machineName: undefined })).toBe('connected machine');
  });

  it('runs kernels here when the page hosts them', () => {
    expect(statusText(base({ ...REMOTE, kernels: 'page' }))).toBe(
      'Saved on lab.example.com:8888 · Runs here · TypeScript',
    );
  });

  it('tells a page kernel from a server kernel when both are listed', () => {
    const both: BackendConfig = { ...LOCAL, kernels: 'both' };
    expect(statusText(base(both, { kernelName: 'cdp-browser', pageKernel: true }))).toBe(
      'Saved on local server · Runs here · TypeScript',
    );
    // The server's own spec of that name wins over the page's, and runs there.
    expect(statusText(base(both, { kernelName: 'cdp-browser' }))).toBe(
      'Saved on local server · Runs on local server · TypeScript',
    );
    expect(statusText(base(both, { kernelName: 'python3', kernelDisplay: 'Python 3' }))).toBe(
      'Saved on local server · Runs on local server · Python 3',
    );
    expect(statusText(base(both, { kernelName: undefined, kernelDisplay: undefined }))).toBe(
      'Saved on local server · No kernel',
    );
  });

  it('says Edited for unsaved edits, in place of the save part', () => {
    expect(statusText(base(BROWSER, { dirty: true }))).toBe('Edited · Runs here · TypeScript');
  });

  it('says Locked when the file changed on disk, and Edited too when it was', () => {
    expect(statusText(base(BROWSER, { locked: true }))).toBe(
      'Locked: changed on disk · Runs here · TypeScript',
    );
    expect(statusText(base(BROWSER, { locked: true, dirty: true }))).toBe(
      'Edited · Locked: changed on disk · Runs here · TypeScript',
    );
  });

  describe('shortStatusText, the phone form', () => {
    const LONG: BackendConfig = {
      kind: 'ganymede',
      url: 'https://a-rather-long-hostname.lab.example.com:8888',
      token: '',
    };
    it('keeps the save state and where it runs, and drops the kernel', () => {
      expect(shortStatusText(base(BROWSER))).toBe('Saved · Runs here');
      expect(shortStatusText(base(LONG))).toBe(
        'Saved · Runs on a-rather-long-hostname.lab.example.com:8888',
      );
      expect(shortStatusText(base(MACHINE, { status: 'busy' }))).toBe('Saved · Runs on Studio Mac');
    });
    it('says Edited and Locked', () => {
      expect(shortStatusText(base(BROWSER, { dirty: true }))).toBe('Edited · Runs here');
      expect(shortStatusText(base(BROWSER, { locked: true }))).toBe('Locked · Runs here');
      expect(shortStatusText(base(BROWSER, { locked: true, dirty: true }))).toBe(
        'Edited · Locked · Runs here',
      );
    });
    it('leaves out where it runs when the page cannot tell', () => {
      const both: BackendConfig = { ...LOCAL, kernels: 'both' };
      expect(shortStatusText(base(both, { kernelName: undefined }))).toBe('Saved');
    });
  });

  it('asks to choose a kernel that is not installed, and leaves out where it runs', () => {
    expect(
      statusText(
        base(REMOTE, { kernelName: undefined, kernelDisplay: undefined, missingKernel: 'julia' }),
      ),
    ).toBe(
      'Saved on lab.example.com:8888 · Runs on lab.example.com:8888 · julia (not installed) · Choose kernel',
    );
    const both: BackendConfig = { ...LOCAL, kernels: 'both' };
    expect(statusText(base(both, { kernelName: undefined, missingKernel: 'julia' }))).toBe(
      'Saved on local server · julia (not installed) · Choose kernel',
    );
  });

  it('falls back to the kernel name, or none', () => {
    expect(statusText(base(BROWSER, { kernelDisplay: undefined }))).toBe(
      'Saved in this browser · Runs here · cdp-node',
    );
    expect(statusText(base(BROWSER, { kernelName: undefined, kernelDisplay: undefined }))).toBe(
      'Saved in this browser · Runs here · No kernel',
    );
  });

  it('adds the kernel state only when it is not idle or unstarted', () => {
    const state = (status: string) => statusText(base(BROWSER, { status }));
    expect(state('idle')).not.toContain('Idle');
    expect(state('none')).toBe('Saved in this browser · Runs here · TypeScript');
    expect(state('busy')).toMatch(/ · TypeScript · Running$/);
    expect(state('starting')).toMatch(/ · Starting$/);
    expect(state('restarting')).toMatch(/ · Restarting$/);
    expect(state('autorestarting')).toMatch(/ · Restarting$/);
    expect(state('connecting')).toMatch(/ · Connecting$/);
    expect(state('dead')).toMatch(/ · Stopped$/);
  });

  it('puts the state after "Choose kernel" without losing either', () => {
    expect(
      statusText(base(BROWSER, { kernelName: undefined, missingKernel: 'julia', status: 'dead' })),
    ).toBe('Saved in this browser · Runs here · julia (not installed) · Choose kernel · Stopped');
  });
});
