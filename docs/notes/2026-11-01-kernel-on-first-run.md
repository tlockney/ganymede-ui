## 2026-11-01, Start a notebook's kernel on the first run (#131)

Part of making the Mac app the default app for `.ipynb` files (#128):
double-clicking a notebook to read it shouldn't start a kernel.

- `SessionContext` takes `kernelPreference: { shouldStart: false,
autoStartDefault: false }`. `initialize()` still rejoins a session already
  running for the path (`findByPath`); it just doesn't start one.
- The first run starts it: `createCommands` takes a `beforeRun` hook that
  every run command (`run-cell`, `run-and-advance`, `run-and-insert`,
  `run-all`) awaits, and the toolbar's Run and Run All call the same
  `ensureKernel`. It calls `session.changeKernel({ name })`, which starts a
  session when there is none. Without the hook, JupyterLab's
  `NotebookActions` with no kernel would want `sessionContextDialogs` to ask
  for one, which this app doesn't have.
- The pane used to fall back to the default kernel when the file named one
  that isn't installed, so a Python notebook ran as TypeScript. Now the
  toolbar shows "Python 3 (not installed)" and a run asks for a kernel to
  be picked. Picking one with no session running only sets which kernel
  the first run starts.
- `KernelState` gained `none`; the toolbar shows "<kernel> · Starts when
  you run a cell" and disables Restart.
- e2e: `openNotebook` and the new-notebook steps wait for "Idle or Starts
  when you run a cell" (`waitForReady`) instead of Idle. The screenshot test
  restarts the kernel only when one is running. `served.spec.ts` checks
  that opening a fresh notebook starts nothing.
