import { describe, expect, it } from 'vitest';
import { hostLabel } from './backend-host';

describe('hostLabel', () => {
  it('names the browser, a machine, a server and the page’s own server', () => {
    expect(hostLabel({ kind: 'browser' })).toBe('');
    expect(
      hostLabel({ kind: 'ganymede', url: '', token: '', machine: 'm1', machineName: 'Studio' }),
    ).toBe('Studio');
    expect(hostLabel({ kind: 'ganymede', url: '', token: '', machine: 'm1' })).toBe(
      'connected machine',
    );
    expect(hostLabel({ kind: 'ganymede', url: 'http://lab.example.com:8888/', token: '' })).toBe(
      'lab.example.com:8888',
    );
    expect(hostLabel({ kind: 'ganymede', url: '', token: '' })).toBe('local server');
    expect(hostLabel({ kind: 'ganymede', url: 'not a url', token: '' })).toBe('not a url');
  });
});
