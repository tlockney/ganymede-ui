## 2026-11-07, a restarted in-page kernel isn't marked dead (#394)

`LiteKernelClient.restart` shuts the kernel down and starts a new one
under the same id. In the Apple apps the kernel page posts `closed` when
a kernel ends, unless a `start` for that id has already replaced it; when
the `start` came later (a busy page, a slow relay), the old kernel's
`closed` reached the new `CdpBrowserKernel`, which reported itself dead,
and Swift's `KernelHost` dropped the id from `hosted`.

The kernel page now remembers the kernels the UI sent `shutdown_request`
and posts no `closed` for them: the UI asked, so it knows. A kernel that
ends on its own still says so. Swift then keeps such an id in `hosted`
until the page goes; reporting it closed when the page dies reaches no
listener, so that is harmless.
