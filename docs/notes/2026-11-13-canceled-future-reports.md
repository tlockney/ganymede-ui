## 2026-11-13, canceled kernel requests are not sent as crashes (#555)

Sentry got `Error: Canceled future for kernel_info_request message
before replies were done` from the Mac app's page, as an unhandled
rejection. It comes from `@jupyterlab/services` 7.6.6: whenever a
kernel connection's socket connects, the connection sends a
`kernel_info_request` and chains on it with `void p.then(...)`, no
`catch`. A restart before the kernel replies runs `_clearKernelState`,
which disposes every pending future, and the request's rejection goes
unhandled. The restart itself goes on, reconnects and asks for the
kernel's info again, so nothing is lost. 7.7.0-beta.1 has the same code.

`scrubEvent` now drops errors of type `Error` whose message starts with
`Canceled future for ` (`isCanceledFuture`). JupyterLab treats the same
errors as expected in its own message handling. A request our code
awaits handles its own rejection, so only the library's unawaited ones
reach Sentry this way.
