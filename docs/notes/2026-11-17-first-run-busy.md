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

Fix: `attachRunStatus` now reports `busy` (any cell running or queued, from
the cells' own `executionState`) and a `busyChanged` signal. The status
effect in `NotebookPane` shows `busy` when the kernel is connected, reports
`idle` or `unknown`, and a cell is running. `connecting`, `dead`,
`restarting` and the like still show as they are, so a stuck queue on a
lost connection doesn't read as running. The effect also listens to
`busyChanged`, so the status falls back to the kernel's own when the last
cell ends. Tests: `run-status.test.ts` (busy and its changes) and
`NotebookPane.test.tsx` (idle under a running cell reads busy, and not
while connecting or dead).

Not done: filtering the probes' statuses out by their parent's session,
which would need a change to JupyterLab's connection.
