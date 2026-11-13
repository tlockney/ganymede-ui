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

`scrubEvent` now drops an event whose outermost error is an `Error`
whose message starts with `Canceled future for kernel_info_request `.
Other canceled requests are still sent, since our own code can miss a
catch too (`tooltip:launch` awaits `requestInspect` without one). A
disposed connection's `kernel_info_request` doesn't reach Sentry:
`requestKernelInfo` returns quietly when the connection is disposed.
