## 2026-11-07, `device` from server kernels (#378)

A cell on a server kernel can now ask the app for `device`:
`connectDevice(jupyter.comm)` from ganymede-device's `/remote`. The
notebook page answers it (ganymede-device#52, `answerDevice` in
`/frontend`) and forwards to the bridge's `deviceRemote` handler, which
takes only the methods that need no permission.

- `src/lib/device-remote.ts` runs `answerDevice` for each notebook's
  session kernel, only in the app (when `deviceRemote` exists), and
  follows kernel changes.
- `KernelHost` registers the remote handler on the UI web view with the
  relay's main-frame and origin check, and its `reset()` drops dialogs
  the old page asked for.
- The e2e test found two problems in the first version of
  `answerDevice`, both fixed in ganymede-device#52: the calls comm's
  open went on the main shell, behind the cell waiting for it, because
  the comm's subshell wasn't up yet; and the comm target returned a
  promise, which makes `@jupyterlab/services` hold later kernel messages,
  the subshell reply included, until it settles. It needs cdp-kernel
  0.8.0 (kernel subshells); Ganymede 0.7.0 passes the subshell messages
  through unchanged.

Not yet: a dialog doesn't say which server asked, and there is no
per-server mute (`answerDevice`'s `accept` is the hook for it). Not
tried by hand in the Mac or iPad app.
