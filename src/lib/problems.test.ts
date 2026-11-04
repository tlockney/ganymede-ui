import { describe, expect, it } from 'vitest';
import { ServerConnection } from '@jupyterlab/services';
import {
  connectionLost,
  failed,
  isUnreachable,
  kernelDead,
  missingKernel,
  saveConflict,
  saveFailed,
} from './problems';

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

  it('offers Save when autosave stopped on a file changed on disk', () => {
    expect(saveConflict('Io.ipynb')).toMatchObject({
      kind: 'save-conflict',
      message: expect.stringContaining('Autosave is off until you save it.'),
      actions: ['save'],
    });
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
