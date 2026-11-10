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

Teardown keeps waiting until no tracked call is left, not only for those
under way when it began, and a run that was waiting for the session to
join starts no kernel once the pane has gone. (Today such a run finds the
notebook already disposed and starts nothing anyway; the check makes
that explicit.)

Tests in `NotebookPane.test.tsx`: "waits for a kernel start before
disposing the session when the pane goes (#461)" and "starts no kernel
for a run that waited on the join when the pane goes (#461)", and "also
waits for a kernel change made after the teardown began (#461)", which
fails without the drain loop.
