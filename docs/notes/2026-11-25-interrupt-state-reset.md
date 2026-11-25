## 2026-11-25, Say when an interrupt reset the kernel's state (#796)

cdp-kernel can't stop a busy cell in place on some runtimes: its browser
kernel (this browser, kernels in the page, the apps' in-app kernel) ends
the cells' Worker, and a new one starts on the next cell without the
earlier cells' variables. The only sign was a stderr line in the cell's
output, so the next cell failed with "not defined". Since cdp-kernel#538
(merged, in the release after 0.15.0) that stderr note carries
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
  the kernel restarts or changes. The button runs the restart the toolbar
  runs and then the toolbar's Run All, both refactored into shared
  functions in the controller effect rather than a new command: nothing
  runs until it is pressed, and a failed restart stops there, with a
  notice whose Retry does both.
- Tests: `state-reset.test.ts` (matching and every near miss),
  `problems.test.ts`, and `NotebookPane.test.tsx` (the notice and its
  button's order of restart then Run All, a failed restart, an interrupt
  without the metadata or with `exit`, a sent or non-stream message,
  clearing on restart and on a kernel change, Dismiss).
  `e2e/interrupt-reset.spec.ts` defines a variable, interrupts a busy
  loop, checks the notice and that Restart & Run All brings the variable
  back, and that interrupting a waiting cell shows nothing. It skips while
  the installed cdp-kernel's browser build lacks the metadata (0.15.0
  does); it passed against a build of cdp-kernel's `main` dropped into
  `node_modules`, and failed there with the pane's check turned off.
- After the cdp-kernel release, bumping `@tlockney/cdp-kernel` in
  `package.json` turns the notice and the end-to-end test on.
