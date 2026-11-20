import { beforeEach, describe, expect, it } from 'vitest';
import { initialConfig, isAppServer, sameBackend } from './app-config';
import { type BackendConfig, saveConfig } from './backends';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const local: BackendConfig = { kind: 'ganymede', url: '', token: '' };

describe('isAppServer', () => {
  it('is the app’s own server: this origin, and not a connected machine', () => {
    expect(isAppServer(local)).toBe(true);
    expect(isAppServer({ ...local, machine: 'mini-1' })).toBe(false);
    expect(isAppServer({ ...local, url: 'http://mini:8888' })).toBe(false);
    expect(isAppServer({ kind: 'browser' })).toBe(false);
  });
});

describe('sameBackend', () => {
  it('tells a machine from this device and from another machine', () => {
    expect(sameBackend(local, { ...local, token: 'other' })).toBe(true);
    expect(sameBackend(local, { ...local, machine: 'mini-1' })).toBe(false);
    expect(sameBackend({ ...local, machine: 'a' }, { ...local, machine: 'b' })).toBe(false);
    expect(sameBackend({ ...local, machine: 'a' }, { ...local, machine: 'a', token: 't' })).toBe(
      true,
    );
  });

  it('compares the url, the kernels and the kind', () => {
    expect(sameBackend(local, { ...local, url: 'http://x' })).toBe(false);
    expect(sameBackend(local, { ...local, kernels: 'both' })).toBe(false);
    expect(sameBackend({ kind: 'browser' }, { kind: 'browser' })).toBe(true);
    expect(sameBackend({ kind: 'browser' }, local)).toBe(false);
  });
});

describe('initialConfig', () => {
  it('is a connected machine’s mount for a machine window, whatever was saved', () => {
    localStorage.setItem('ganymede-ui:backend', JSON.stringify({ kind: 'browser' }));
    expect(initialConfig('?machine=mini-1&machine_name=m4%20mini&token=abc')).toEqual({
      kind: 'ganymede',
      url: '',
      token: '',
      machine: 'mini-1',
      machineName: 'm4 mini',
    });
  });

  it('ignores a malformed machine and falls back to the token', () => {
    expect(initialConfig('?machine=..%2Fx&token=abc')).toEqual({
      kind: 'ganymede',
      url: '',
      token: 'abc',
    });
  });

  it('uses the launch token and kernels, and the saved config without them', () => {
    expect(initialConfig('?token=t&kernels=both')).toEqual({
      kind: 'ganymede',
      url: '',
      token: 't',
      kernels: 'both',
    });
    expect(initialConfig('')).toBeUndefined();
  });

  it('returns the saved config when the URL asks for nothing', () => {
    saveConfig({ kind: 'ganymede', url: 'http://mini:8888', token: '' });
    expect(initialConfig('')).toMatchObject({ kind: 'ganymede', url: 'http://mini:8888' });
    expect(initialConfig('?open=%2Fa.ipynb')).toMatchObject({ url: 'http://mini:8888' });
  });

  it('sets no kernels key for kernels=server', () => {
    const config = initialConfig('?kernels=server');
    expect(config).toEqual({ kind: 'ganymede', url: '', token: '' });
    expect(config).not.toHaveProperty('kernels');
  });
});
