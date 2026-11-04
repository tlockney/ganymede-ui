## 2026-11-04, clearer kernel status and actionable errors (#213)

The kernel's state was a dot and a word under the title, and failures
were raw messages in the pane's notice. Now the cells show what runs,
and each notice says what happened and offers the next step.

- `src/lib/run-status.ts` puts a line under the input of each busy code
  cell: "Running 1:05" with an Interrupt button, or "Queued, 2 cells
  ahead". JupyterLab marks every cell sent to the kernel as `running`
  (`CodeCell.execute` sets `executionState` before the request goes, and
  its own comment says it doesn't tell running from scheduled). A kernel
  runs execute requests one at a time in order, so `RunQueue` keeps the
  order the cells were marked in: the first is running, the rest wait.
  The running cell's time counts from when the one before it finished.
  It is an estimate: a cell run again while it is still queued keeps its
  old place (the model doesn't signal a change from `running` to
  `running`), and a request another client sent to the same kernel isn't
  seen.
- The line is plain DOM in the cell's node, after `.jp-Cell-inputWrapper`,
  as the touch cell controls are (#200). Clicks on Interrupt are stopped
  in the capture phase, so the notebook doesn't select or drag the cell.
  A timer ticks once a second only while some cell runs.
- `src/lib/problems.ts` builds each notice: a message, a hint, and its
  actions. `ProblemNotice.tsx` shows them as buttons: Restart (kernel
  died), Retry (server unreachable, connection lost, save or kernel
  action failed), Save (autosave stopped on a changed file), and a
  kernel picker in the notice itself for a missing kernelspec, so the
  user doesn't have to find the toolbar's. Notices are matched by kind
  now, not by their text.
- A dead kernel disposes itself (`KernelConnection._updateStatus`), which
  also sets its connection to `disconnected`, so the pane showed a dead
  kernel as "Connecting". The pane now checks for `dead` first. Its
  `restart()` throws "Kernel is dead", so Restart on a dead kernel calls
  `changeKernel` with the same name, which starts a new one in the same
  session.
- "Lost the connection" is a live kernel whose websocket gave up
  reconnecting (`connectionStatus` `disconnected`, not disposed); Retry
  calls `reconnect()`.
- "Server unreachable" is a `ServerConnection.NetworkError` or a
  `TypeError` whose message is a browser's fetch failure ("Failed to
  fetch", "NetworkError when…", "Load failed"). An answer that said no
  (403, 404, 500) is not that, and keeps its own message.
- A file that couldn't be opened gets a Retry button that loads it again.
- The toolbar (`Toolbar.tsx`) is unchanged: it still shows the kernel's
  name and state under the title. Restart there also starts a new kernel
  when the old one died, since it calls the same controller.
- Tests: `problems.test.ts`, `run-status.test.ts` (the lines on a real
  Notebook in jsdom, with a fake clock), and a test per error state in
  `NotebookPane.test.tsx`. Not tried on a device or against a kernel
  that really died or a server that really went away: the e2e suite
  doesn't kill kernels.
