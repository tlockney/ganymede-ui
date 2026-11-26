## 2026-11-26, kernel errors shown once (#869)

A kernel that failed to start (here a kernelspec whose `argv[0]`, a
mise-installed Node, had been removed) showed two errors: JupyterLab's
"Error Starting Kernel" dialog, then the pane's own notice with Retry. The
dialog's message sat in a `<pre>` on one line, so the part that said what
was missing was cut off at its edge.

- JupyterLab's `SessionContext` (`@jupyterlab/apputils` 4.7.6) opens the
  dialog from its private `_displayKernelError` on a failed start, a
  failed kernel change, a failed connect, and a kernel that dies with a
  reason, and rethrows the error (or reports the death) as well. The pane
  already turns each of those into its notice (a failed connect into its
  error view).
- `quietKernelErrors` (`src/lib/session-errors.ts`) replaces
  `_displayKernelError` on the pane's own `SessionContext` with a no-op,
  behind a type guard. No option turns the dialog off, and a subclass
  would need the same private name. If an upgrade renames the method the
  helper does nothing and returns false.
- `session-errors.test.ts` checks the method still exists, so such an
  upgrade fails a test; that a failed start opens no dialog and still
  rejects once quieted; and, as the control, that it opens one without.
  `NotebookPane.test.tsx` runs a cell whose kernel fails to start the way
  JupyterLab's does (dialog, then rejection) and sees the notice with
  Retry and Dismiss, and no dialog.
- Any JupyterLab dialog that still shows wraps its `<pre>`
  (`src/styles/jupyter.css`); `e2e/dialog-wrap.spec.ts` fails without
  either of its two declarations.
