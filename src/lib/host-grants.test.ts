import { describe, expect, it } from 'vitest';
import { describePaths, hostGrantsAvailable, hostWants, pathsText, textPaths } from './host-grants';
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
