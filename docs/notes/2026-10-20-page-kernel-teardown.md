## 2026-10-20, page kernels end with their backend (#62)

Switching backends disposed the old `ServiceManager`, which leaves running
kernels alone. On a server that is what we want: the kernels show under
Running again when the app reconnects. In the page it left kernel Workers
running with nothing to reach them. `LiteServiceManager.dispose()` now
calls `LiteKernelClient.shutdownAll()` first; its `shutdown` disposes the
kernel synchronously (the method is async but awaits nothing), and both
kernels' `dispose` terminate their Worker. The e2e test counts
`page.workers()` before and after reconnecting.

The service-worker relay (#61) could leave a Worker blocked in a synchronous
`XMLHttpRequest` for good: the bridge didn't answer once disposed, when the
stdin handler threw, or for a stdin path it had no handler for. It now
tracks pending request ids, answers `null` on each of those, and answers
what is still pending when disposed. The relay itself times out drive
requests after 30 s; stdin has no limit, since `input()` waits for a
person. Node's `BroadcastChannel` doesn't deliver to the same instance and
jsdom has none, so the unit test stubs the channel with an `EventTarget`.
