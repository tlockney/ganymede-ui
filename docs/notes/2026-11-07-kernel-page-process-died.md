## 2026-11-07, recover when the kernel web view's process dies (#293)

`KernelHost` handled `webViewWebContentProcessDidTerminate` only to drop
device calls. When iOS ended the kernel web view's process (memory
pressure, likelier with a Pyodide heap), the UI page wasn't told: its
in-page kernels looked alive and never answered, and the host still
thought `kernel.html` was loaded, so new kernels went nowhere.

- `KernelHost` keeps the ids of kernels the UI page started and the
  kernel page hasn't closed. `kernelPageEnded()` (called from the
  delegate) reports each `closed` to the UI page and resets `loaded`,
  `ready` and the queue, so the next message loads a new kernel page and
  waits for its `ready`.
- The UI page used to ignore `closed`. `startRelayedKernel` now has
  `onClosed`, and `CdpBrowserKernel` answers it with an iopub `status`
  of `dead`, as a server kernel's death reads. `KernelConnection` then
  disposes itself and the notebook shows the dead-kernel notice with
  Restart, which starts a new kernel (`changeKernel`). A kernel the UI
  disposed itself (shutdown) says nothing more, since its listener is
  gone first.
- `KernelHostTests` calls the delegate method directly; WebKit has no
  public way to kill the process in a test.
