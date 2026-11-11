import { describe, expect, it } from 'vitest';
import {
  describePaths,
  hostGrantsAvailable,
  hostWants,
  missingWants,
  pathsText,
  textPaths,
} from './host-grants';
import type { Backend } from './backends';

describe('host grants', () => {
  it('reads what a notebook asks for and ignores anything else', () => {
    expect(hostWants({ host: { wants: ['notebooks.run', 3, 'self.edit'] } })).toEqual([
      'notebooks.run',
      'self.edit',
    ]);
    expect(hostWants(undefined)).toEqual([]);
    expect(hostWants({ host: { wants: 'notebooks.run' } })).toEqual([]);
  });

  it('names what a notebook asks for that its grant does not give', () => {
    const defaults = { read: [''], edit_self: true, run: [] };
    const wants = ['notebooks.read', 'notebooks.run', 'self.edit', 'secrets.get'];
    // The defaults read and edit but don't run; an unknown method can't be granted.
    expect(missingWants(wants, { path: 'a.ipynb', grant: {}, defaults })).toEqual([
      'notebooks.run',
    ]);
    // The notebook's own keys replace the defaults.
    expect(
      missingWants(wants, {
        path: 'a.ipynb',
        grant: { read: [], run: ['reports'], edit_self: false },
        defaults,
      }),
    ).toEqual(['notebooks.read', 'self.edit']);
    expect(missingWants([], { path: 'a.ipynb', grant: {}, defaults })).toEqual([]);
  });

  it('turns path lists into lines and back, with / for the root', () => {
    expect(pathsText(['', 'journal'])).toBe('/\njournal');
    expect(textPaths(' /journal/ \n\n/\njournal\nreports')).toEqual(['journal', '', 'reports']);
    expect(describePaths([])).toBe('none');
    expect(describePaths(['journal', ''])).toBe('every notebook');
    expect(describePaths(['journal', 'reports'])).toBe('journal, reports');
  });

  it('is available only on a Ganymede server that runs the kernels', () => {
    const b = (config: Backend['config']) => ({ config }) as Backend;
    expect(hostGrantsAvailable(b({ kind: 'ganymede', url: '', token: '' }))).toBe(true);
    expect(hostGrantsAvailable(b({ kind: 'ganymede', url: '', token: '', kernels: 'page' }))).toBe(
      false,
    );
    expect(hostGrantsAvailable(b({ kind: 'browser' }))).toBe(false);
    expect(hostGrantsAvailable(undefined)).toBe(false);
  });
});
