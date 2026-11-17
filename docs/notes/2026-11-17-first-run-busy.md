## 2026-11-17, first run shows as busy (#655)

On a notebook's first run, with the kernel not started, the Mac app's
subtitle stayed "Idle", Interrupt stayed disabled and ⌘. did nothing,
though the cell showed `[*]` and "Running". The Swift shell only mirrors
the page (`PageState.isBusy` is `status == "busy"`), so the fault is in the
page: `NotebookPane` took the toolbar's status only from the kernel
connection's `status`, the last iopub `status` message it saw.

What the code shows, and what I could not reproduce here (no browser for
the Playwright suite and no Mac app): while a kernel starts,
`Session::nudge` (ganymede-kernel-host) probes it with
`kernel_info_request` on shell and on control, repeating each with a
growing wait, and cdp-kernel answers each with a busy/idle pair. The page's
kernel connection is subscribed to the same iopub and cannot tell those
statuses from its own: `UNTRACKED_MESSAGE_TYPES` in `kernel-status.ts`
leaves `kernel_info_request` tracked on purpose, since the page's own
first idle may be for it. A control probe answered after the cell has
started (cdp-kernel handles control apart from the shell queue) leaves
`idle` under the running cell. Once the kernel is warm nothing probes, which
matches "correct on later runs". The exact event order is inferred from
those paths, not observed.

Fix: `attachRunStatus` now reports `busy` and a `busyChanged` signal.
`busy` is true while a run this page started is unfinished: a cell that
JupyterLab's `NotebookActions.executionScheduled` reported for this
notebook and that is still marked `running`. It ends when `executed` is
reported, when the cell's state leaves `running` (a cancelled run sends no
`executed`), when the cell is removed, or on `clear`. Cells already
`running` when the notebook is attached, or marked running by another
client in a room (or left so by a client that went away), never count, so
they can't hold the window at Running. The status effect in `NotebookPane`
shows `busy` when the kernel is connected, reports `idle` or `unknown`, and
`busy` is true; every other status (`restarting`, `autorestarting`,
`starting`, `terminating`, `dead`) and `connecting` show as they are. The
effect listens to `busyChanged` and disconnects it on cleanup. Tests:
`run-status.test.ts` (own runs only, ends on executed, error and state
change) and `NotebookPane.test.tsx` (idle under a run reads busy; other
statuses kept; not while connecting or dead; effect re-run).

Not done: filtering the probes' statuses out by their parent's session,
which would need a change to JupyterLab's connection.
