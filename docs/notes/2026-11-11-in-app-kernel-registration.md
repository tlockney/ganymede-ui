## 2026-11-11, The in-app kernel as a server kernel (#468)

The apps' TypeScript kernel now registers with the embedded server
through ganymede-ffi's `ganymede_kernel_register` (ganymede#266, #644)
instead of running as a page kernel relayed by Swift. The page opens with
`kernels=server` everywhere; `AppKernels.swift` owns one kernel web view
for the app, and `KernelHost.swift` keeps only each page's ledger messages
and the remote `device` subset.

What it took:

- **The server frees itself at the end of `ganymede_server_stop`**, while
  the main thread may still be delivering a late message. `RegisteredKernels`
  takes a lock around every call into the server and passes only calls
  for kernels that are live. The stop callback marks a kernel stopped
  before it returns, and the server stops every kernel before it frees
  itself, so no call is under way then.
- **Shutdown answers through the main thread.** The server asks each
  kernel to shut down and waits up to its grace for the reply, which the
  app sends from the main thread. A stop on the main thread would wait out
  the grace; quit now stops the server on the server queue and replies
  `terminateLater`.
- **A restart keeps the kernel id.** The page tags each message with the
  start's run number, and Swift drops one from an older run, so a late
  reply from before a restart can't reach the new kernel.
- **A lost page is not a crash.** When WebKit ends the kernel page's
  process, each kernel is reported `lost`, which the server restarts
  without counting toward its limit. A kernel that ends on its own
  (`closed` from the page) is reported as a crash.

Follow-ups: #469.
