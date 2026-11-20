## 2026-11-20, kernel version line (#693)

The running kernel's implementation and version now show where people look
at the kernel: "cdp-kernel 0.14.0 · node 24.11.0", or "ipython 8.20.0".

- `src/lib/kernel-version.ts` (`kernelVersionLine`) formats a
  `kernel_info_reply`: `implementation` and `implementation_version`, plus a
  runtime when the banner has the form "... on <name> <version>" (cdp-kernel's
  "cdp-kernel on node 24.x (V8 ...)"). No `implementation` gives nothing;
  no version gives the name alone. It takes `unknown` because a reply's
  content can also be an error.
- `NotebookPane` reads it in its kernel-status effect and exposes it as
  `NotebookController.kernelVersionLine`. A new kernel (start or switch) is
  read from `kernel.info`. `@jupyterlab/services` resolves that promise once, for the
  connection's first reply, so a restart (status `restarting` or
  `autorestarting`, then connected again) clears the line and asks
  `requestKernelInfo()`. It is unset with no kernel, a dead one, or a
  reply that failed. The in-app kernel (`kernel-host.ts`) goes through the
  same connection, so it needed nothing of its own.
- The toolbar shows it as the tooltip of the kernel label and the picker. It reaches the
  app in `PageState.kernelVersionLine` (null when unset), which the Mac's
  Kernel menu (a line above Interrupt) and kernel popover and button help, and
  the iPad's kernel menu show.

Checks: `npm run check`; the unit tests for the formatter, the toolbar
tooltip, the page state and `NotebookPane` (new kernel, switch, restart,
no kernel, missing fields; the two lifecycle tests fail without the change).
The Swift edits (`PageState.swift`, `NativeChrome.swift`, `IPadChrome.swift`,
a decode assertion in `PageStateTests.swift`) weren't built: this container
has no Swift toolchain.
