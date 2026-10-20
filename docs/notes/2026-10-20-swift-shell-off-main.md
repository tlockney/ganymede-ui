## 2026-10-20, Swift shell: keychain errors, PATH and server start off the main thread (#65)

`Keychain.set` threw nothing: a refused `SecItemAdd` (iOS keychain locked
before the first unlock, say) lost the kernel server's token without a
word. It now throws, logs through `os.Logger` (subsystem
`com.ganymede-server.Ganymede`, category `keychain`), and the app shows an
alert; the token still works until the app quits. `get` logs anything
other than success or not-found.

`ganymede_server_start` returns once the server listens and
`ganymede_server_stop` once its kernels are down, and both ran on the
main actor, so opening a folder or saving the kernel server froze the
window. `AppModel.start()` now returns at once and queues the work: each
queued start awaits the one before it, then stops the old server and
starts the new one in a detached task, and sets `url` or `error` back on
the main actor. `startIfNeeded` counts queued starts, so the view's
`.task` doesn't start a second server while one is coming up. Quitting
still stops synchronously (`stopForQuit`), since the process ends next.

The login-shell PATH probe ran in `applicationWillFinishLaunching` and
polled with `Thread.sleep` for up to 5 s. It now runs in a detached task
(`dispatchPrecondition` keeps it off main) and waits on the process's
termination handler; the first server start awaits it, so kernels still
see the shell's PATH.

`ServerHost` is `@unchecked Sendable` so it can be made and stopped off
the main actor; `AppModel`'s queue never uses one from two threads at
once. The config dictionary became `[String: any Sendable]` for the same
reason. None of this compiles on Linux; the macOS and iOS CI jobs build
and test it.
