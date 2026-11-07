import { describe, expect, it } from 'vitest';
import { ServerConnection } from '@jupyterlab/services';
import {
  changedOnDisk,
  connectionLost,
  failed,
  isStaleBundle,
  isUnreachable,
  kernelDead,
  missingKernel,
  saveFailed,
} from './problems';

describe('isStaleBundle', () => {
  it('is true for a chunk that failed to load', () => {
    // Safari, Chrome and Firefox word it differently.
    expect(isStaleBundle(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(
      isStaleBundle(
        new TypeError('Failed to fetch dynamically imported module: http://x/assets/a.js'),
      ),
    ).toBe(true);
    expect(
      isStaleBundle(new TypeError('error loading dynamically imported module: http://x/a.js')),
    ).toBe(true);
  });

  it('is false for other errors', () => {
    expect(isStaleBundle(new TypeError('Failed to fetch'))).toBe(false);
    expect(isStaleBundle('Importing a module script failed.')).toBe(false);
  });
});

describe('isUnreachable', () => {
  it('is true for a request that never got an answer', () => {
    expect(isUnreachable(new ServerConnection.NetworkError(new TypeError('x')))).toBe(true);
    // Chrome, Firefox and Safari word it differently.
    expect(isUnreachable(new TypeError('Failed to fetch'))).toBe(true);
    expect(isUnreachable(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      true,
    );
    expect(isUnreachable(new TypeError('Load failed'))).toBe(true);
  });

  it('is false for an answer that said no, and for other errors', () => {
    expect(isUnreachable(new Error('Permission denied'))).toBe(false);
    expect(isUnreachable(new TypeError('x is not a function'))).toBe(false);
    expect(isUnreachable('Failed to fetch')).toBe(false);
  });
});

describe('problems', () => {
  it('offers Restart when the kernel died', () => {
    expect(kernelDead('Python 3')).toMatchObject({
      kind: 'kernel-dead',
      message: 'The Python 3 kernel stopped. It may have crashed or run out of memory.',
      actions: ['restart'],
    });
    expect(kernelDead().message).toMatch(/^The kernel stopped\./);
  });

  it('offers Retry when the connection is lost', () => {
    expect(connectionLost()).toMatchObject({ kind: 'connection-lost', actions: ['retry'] });
  });

  it('offers a kernel to pick when the file’s isn’t installed, or there is none', () => {
    expect(missingKernel('Io.ipynb', 'Julia')).toMatchObject({
      kind: 'missing-kernel',
      message: 'Io.ipynb uses Julia, which isn’t installed here.',
      actions: ['pick-kernel'],
    });
    expect(missingKernel('Io.ipynb').message).toBe('There is no kernel to run this notebook.');
  });

  it('offers Retry when a save failed, and says when the server was unreachable', () => {
    expect(saveFailed('Io.ipynb', new Error('Disk full'))).toMatchObject({
      kind: 'save-failed',
      message: 'Couldn’t save Io.ipynb: Disk full',
      actions: ['retry'],
    });
    expect(saveFailed('Io.ipynb', new TypeError('Failed to fetch'), true)).toMatchObject({
      kind: 'save-failed',
      message: 'Couldn’t reach the server to autosave Io.ipynb.',
      hint: expect.stringContaining('Your edits are still here'),
      actions: ['retry'],
    });
  });

  it('offers Reload and Unlock when the file changed on disk', () => {
    expect(changedOnDisk('Io.ipynb', false)).toMatchObject({
      kind: 'save-conflict',
      message: 'Io.ipynb changed on disk. Saving is locked, so this copy doesn’t replace it.',
      actions: ['reload', 'unlock'],
    });
    // A reload drops unsaved edits: the hint says so.
    expect(changedOnDisk('Io.ipynb', true).hint).toContain('unsaved edits here are dropped');
    expect(changedOnDisk('Io.ipynb', false).hint).not.toContain('unsaved');
  });

  it('offers Retry for other failures only when asked', () => {
    expect(failed('restart the kernel', new Error('Nope'))).toMatchObject({
      kind: 'failed',
      message: 'Couldn’t restart the kernel: Nope',
      actions: [],
    });
    expect(failed('restart the kernel', new Error('Nope'), { retry: true }).actions).toEqual([
      'retry',
    ]);
    // Unreachable says so, with Retry only when there is something to retry.
    expect(failed('rename Io.ipynb', new TypeError('Failed to fetch'))).toMatchObject({
      message: 'Couldn’t reach the server to rename Io.ipynb.',
      actions: [],
    });
    expect(
      failed('restart the kernel', new TypeError('Failed to fetch'), { retry: true }),
    ).toMatchObject({
      message: 'Couldn’t reach the server to restart the kernel.',
      actions: ['retry'],
    });
  });
});
