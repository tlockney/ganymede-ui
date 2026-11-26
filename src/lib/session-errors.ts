import type { SessionContext } from '@jupyterlab/apputils';

/**
 * JupyterLab's SessionContext opens its own "Error Starting Kernel" dialog
 * when a kernel fails to start, change or dies with a reason, and then
 * rethrows (or reports the death) as well. The pane already turns each of
 * those into the app's notice, with Retry, so one failure showed twice, and
 * the dialog's message sat on one unwrapped line (#869).
 *
 * The dialog comes from a private method, `_displayKernelError`, that has
 * no option to turn it off. Replacing it on this one instance silences the
 * dialog and nothing else. If an upgrade renames the method this does
 * nothing and returns false; a test checks it is still there.
 */
export function quietKernelErrors(session: SessionContext): boolean {
  const target: unknown = session;
  if (!hasDisplayKernelError(target)) return false;
  target._displayKernelError = () => Promise.resolve();
  return true;
}

interface DisplaysKernelError {
  _displayKernelError: (message: string, traceback: string) => Promise<void>;
}

function hasDisplayKernelError(value: unknown): value is DisplaysKernelError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)._displayKernelError === 'function'
  );
}
