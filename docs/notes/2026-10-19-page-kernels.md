## 2026-10-19, kernels in the page, notebooks on the server (#68)

A Ganymede connection can now set `kernels: 'page'`. `connect()` checks
the server as usual, then builds JupyterLite's in-page services
(`createLiteServices`) with a stock `ContentsManager` on the server's
settings in place of the IndexedDB drive. Kernels, sessions and
kernelspecs are the page's, so kernels never touch the server.
`trustNotebook` now takes its settings from `services.contents`, since
the manager's own settings point at the page's fake server.

The iPad app uses this: iOS can't launch kernel processes, so without a
kernel server it opens the page with `kernels=page`, and cdp-kernel's
TypeScript kernel runs in a Worker in the web view. The app passes
`kernels=server` otherwise, on every platform, because the page
remembers its last connection: after a token login the server redirects
without the token, so the page would otherwise reconnect with whatever
it saved, perhaps page kernels after a kernel server was set. The
server's login redirect drops only `token` and keeps other parameters
(`strip_token` in ganymede's auth.rs); `ServerHostTests` checks that.

A kernel in the page lives as long as the web view does. iOS should
suspend the Worker with the app rather than kill it, so a kernel's state
ought to survive a trip to the background unless iOS reclaims the web
view's process; not yet tried on a device.
