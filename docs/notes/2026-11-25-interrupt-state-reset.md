## 2026-11-25, Say when an interrupt reset the kernel's state (#796)

cdp-kernel can't stop a busy cell in place on some runtimes: its browser
kernel (this browser, kernels in the page, the apps' in-app kernel) ends
the cells' Worker, and a new one starts on the next cell without the
earlier cells' variables (its Bun, workerd and celld runtimes end their
process the same way). The only sign was a stderr line in the cell's
output, so the next cell failed with "not defined". cdp-kernel#538,
merged on cdp-kernel's `main` (PR #541) and not yet released, makes that
stderr note carry
`{ "cdp_kernel": { "state_reset": true, "reason": "interrupt", "runtime": … } }`
in its metadata.

- `src/lib/state-reset.ts`: `interruptResetState(msg)` is true only for a
  `stream` message whose metadata has `cdp_kernel.state_reset === true`
  and `reason === "interrupt"`. A runtime that ended for another reason
  (`"exit"`: a crash or `process.exit()`) says so in its note and gets no
  notice; neither does a message without the metadata, which is every
  message from cdp-kernel 0.15.0 and from other kernels.
- `problems.ts`: a `state-reset` problem, **Kernel state was reset by the
  interrupt**, with a `restart-run-all` action labelled **Restart & Run
  All**. Its notice has the orange border of the other warnings.
- `NotebookPane.tsx`: the listener on the kernel's `anyMessage` that
  already reads `kernel_info_reply` also checks received messages for the
  reset and shows the notice. It ignores messages while a restart is
  under way (the same gate as the version line), and the notice goes when
  the kernel restarts, changes or is shut down. The button runs the
  restart the toolbar runs and then the toolbar's Run All, both
  refactored into shared functions in the controller effect rather than
  a new command: nothing runs until it is pressed. A failed restart stops
  there, with a notice whose Retry does both; once the restart is done,
  Retry after a failed Run All only runs the cells again. In the journal
  view, which runs no cells, the notice has no button and its hint points
  to Open as Notebook; the button comes back with the notebook.
- Tests: `state-reset.test.ts` (matching and every near miss),
  `problems.test.ts`, and `NotebookPane.test.tsx` (the notice and its
  button's order of restart then Run All, a failed restart, an interrupt
  without the metadata or with `exit`, a sent or non-stream message,
  clearing on restart, on a kernel change and on shutdown, the journal
  view, Retry after a failed Run All, Dismiss).
  `e2e/interrupt-reset.spec.ts` defines a variable, interrupts an endless
  loop, checks the notice, replaces the loop and checks that Restart &
  Run All brings the variable back, and that interrupting a waiting cell
  shows nothing. It skips while
  the installed cdp-kernel's browser build lacks the metadata (0.15.0
  does); it passed against a build of cdp-kernel's `main` dropped into
  `node_modules`, and failed there with the pane's check turned off.
- Until cdp-kernel releases it, nothing changes for people: the app pins cdp-kernel 0.15.0,
  which sends no such metadata, and the end-to-end test skips. Once
  cdp-kernel releases the change, bumping `@tlockney/cdp-kernel` in
  `package.json` turns on both the notice and the end-to-end test.
