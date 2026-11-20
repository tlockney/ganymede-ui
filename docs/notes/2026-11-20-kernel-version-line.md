## 2026-11-20, kernel version line (#693)

The running kernel's implementation and version now show where people look
at the kernel: "cdp-kernel 0.14.0 · node 24.11.0", or "ipython 8.20.0".

- `src/lib/kernel-version.ts` (`kernelVersionLine`) formats a
  `kernel_info_reply`: `implementation` and `implementation_version`, plus a
  runtime when the banner has the form "... on <name> <version>" (cdp-kernel's
  "cdp-kernel on node 24.x (V8 ...)"). No `implementation` gives nothing;
  no version gives the name alone. It takes `unknown` because a reply's
  content can also be an error.
- `NotebookPane` takes it from the `kernel_info_reply` the connection
  itself requests each time it connects, by listening to the current
  kernel's `anyMessage` for a received `kernel_info_reply`, and exposes it as
  `NotebookController.kernelVersionLine`. `kernel.info` only seeds it for a
  reply that came before the listener (it resolves once per connection, so
  it is stale after a restart). Switching kernels moves the listener; no
  kernel or a dead one clears it. On a restart or autorestart the line is
  cleared and replies are ignored until the connection has gone down and
  come back: `restart()` leaves the old socket connected until the REST call
  returns, so its replies are the old kernel's. A reply the old kernel sends
  after the new connection is up can't be told apart; the library has no
  marker for it. The in-app kernel (`kernel-host.ts`) uses the same
  connection.
- The banner's runtime may carry a date (`workerd 2026-10-15`), so the version
  keeps dashes.
- The toolbar shows it as the tooltip of the kernel label and the picker. It reaches the
  app in `PageState.kernelVersionLine` (null when unset), which the Mac's
  Kernel menu (a line above Interrupt) and kernel popover and button help, and
  the iPad's kernel menu (at the top of the kernel submenu) show.

Checks: `npm run check`; the unit tests for the formatter, the toolbar
tooltip, the page state and `NotebookPane` (new kernel, switch, restart,
no kernel, missing fields; the two lifecycle tests fail without the change).
The Swift edits (`PageState.swift`, `NativeChrome.swift`, `IPadChrome.swift`,
a decode assertion in `PageStateTests.swift`) weren't built: this container
has no Swift toolchain.
