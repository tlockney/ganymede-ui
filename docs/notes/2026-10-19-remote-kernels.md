## 2026-10-19, remote kernels in the Swift app (#46)

The app's server can run kernels on another Jupyter or Ganymede server
(tlockney/ganymede#167, `gateway_url` and `gateway_token` in the FFI
config). `KernelServerView` sets that server: a sheet from the toolbar
on iPadOS, the Settings window on macOS. The URL is in UserDefaults and
the token in the Keychain (`Keychain.swift`, one generic-password item).
Saving restarts the server, which shuts running kernels down.

- The keys go into the config only when a server is set: the server's
  config rejects unknown keys, so an older XCFramework would fail to start
  if they were always there.
- CI builds against the gateway PR's head commit until it merges; then
  `GANYMEDE_REF` moves to the merge commit.
- `testKernelServerConfigIsAccepted` starts a second in-process server as
  the remote and checks the local one serves kernelspecs through it.
