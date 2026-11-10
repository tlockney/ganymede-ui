## 2026-11-10, wait for a kernel start before disposing the session (#461)

Sentry reported an unhandled "Error: Disposed" from the Mac app, thrown in
JupyterLab's `SessionContext._changeKernel` → `_handleNewSession` →
`_handleSessionError`. Opening another file while a kernel was starting
disposed the pane's `SessionContext`. When `startNew` came back,
`_handleNewSession` threw "Disposed"; the catch called
`void this._handleSessionError(err)`, which calls `_handleNewSession(null)`
and throws again inside a promise nothing awaits. The kernel kept the
session's temporary UUID path too, since `setPath` ran but the context
never adopted it.

The pane now tracks its calls into the session that start or change a
kernel (`initialize`, the first-run start, a kernel change, a dead kernel's
restart) and disposes the session only once they have settled. With none
pending it disposes at once, as before. A started kernel then takes the
file's path and stays listed under Running, like any kernel the pane
leaves behind.

Test: "waits for a kernel start before disposing the session when the
pane goes (#461)" in `NotebookPane.test.tsx`.
