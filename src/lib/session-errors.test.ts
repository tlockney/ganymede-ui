import '../test/notebook-env';
import { Dialog, SessionContext } from '@jupyterlab/apputils';
import type { Session } from '@jupyterlab/services';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { quietKernelErrors } from './session-errors';

/** A session manager whose every start fails, as a kernelspec whose argv[0]
 * is missing does (#869). */
function failingContext(): SessionContext {
  const sessionManager = {
    ready: Promise.resolve(),
    isReady: true,
    refreshRunning: () => Promise.resolve(),
    running: () => [][Symbol.iterator](),
    findByPath: () => Promise.resolve(undefined),
    startNew: () => Promise.reject(new Error('io: kernelspec cdp-node runs /missing/node')),
    connectTo: () => {
      throw new Error('not used');
    },
    runningChanged: { connect: () => true, disconnect: () => true },
  } as unknown as Session.IManager;
  return new SessionContext({
    sessionManager,
    specsManager: {
      ready: Promise.resolve(),
      isReady: true,
      specs: { default: 'cdp-node', kernelspecs: {} },
      specsChanged: { connect: () => true, disconnect: () => true },
    } as never,
    path: 'a.ipynb',
    type: 'notebook',
    kernelPreference: { shouldStart: false, autoStartDefault: false },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('quietKernelErrors', () => {
  it("finds JupyterLab's private dialog method, so an upgrade that renames it fails here", () => {
    const session = failingContext();
    expect(typeof (session as unknown as Record<string, unknown>)._displayKernelError).toBe(
      'function',
    );
    expect(quietKernelErrors(session)).toBe(true);
    session.dispose();
  });

  it('opens no dialog when a kernel fails to start, and still rejects', async () => {
    const launch = vi.spyOn(Dialog.prototype, 'launch');
    const session = failingContext();
    quietKernelErrors(session);
    await session.initialize();
    await expect(session.changeKernel({ name: 'cdp-node' })).rejects.toThrow(/missing\/node/);
    // The error handler runs after the rejection: give it a turn.
    await new Promise(r => setTimeout(r, 0));
    expect(launch).not.toHaveBeenCalled();
    session.dispose();
  });

  it("opens JupyterLab's dialog without it (the test above means something)", async () => {
    const launch = vi.spyOn(Dialog.prototype, 'launch').mockResolvedValue({
      button: Dialog.okButton(),
      isChecked: null,
      value: null,
    });
    const session = failingContext();
    await session.initialize();
    await expect(session.changeKernel({ name: 'cdp-node' })).rejects.toThrow(/missing\/node/);
    await new Promise(r => setTimeout(r, 0));
    expect(launch).toHaveBeenCalledTimes(1);
    session.dispose();
  });

  it('leaves an object without the method alone', () => {
    expect(quietKernelErrors({} as SessionContext)).toBe(false);
  });
});
