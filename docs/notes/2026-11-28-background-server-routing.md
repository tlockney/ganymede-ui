## 2026-11-28, route local notebooks through the background server and move tailnet sharing to it (#954)

Final step of `tlockney/ganymede#965` §4 (one engine per Mac): when the
optional LaunchAgent background server (#912) is enabled and verified as a
This Mac server (#883), local folders and notebooks now route through it
rather than hosting rooms or kernels in the app's embedded server, and
tailnet sharing moves to the background server.

- Added `BackgroundServerRouting` (`apple/Sources/Ganymede/BackgroundServerRouting.swift`,
  `#if os(macOS)`) to hold the pure routing, tailnet ownership, and
  status-notice decisions:
  - Background server off (`.notRegistered` / `.notFound`): local targets
    stay `.thisDevice` on the embedded server with no notice, and embedded
    tailnet sharing works unchanged.
  - Background server enabled (`.enabled`) and verified: local `.file` /
    `.folder` targets inside the server's `root_dir` route to
    `.machineFile` / `.machineFolder` on a reserved synthetic mount id
    (`BackgroundServer.mountID = "this-mac"`), resolving to
    `.thisMac("this-mac")` with full local capabilities, local terminal
    targeting under `root_dir`, Finder open-request handling
    (`Place.isLocalPlace`), and no duplicate `"This Mac"` badge or tab
    suffix. The embedded server stays relay-only for UI assets and mounts.
  - Tailnet ownership: `embeddedTailnetAllow` returns `[]` whenever the
    background server is `.enabled`, tearing down any prior embedded
    `tailscale serve` handler (`AppTailnet.unserve`) on transition and
    avoiding duplicate tailnet endpoints. `SettingsWindow` (`TailnetSettings`)
    and `MenuBarSnapshot` (`TailnetStatus.backgroundManaged`) surface that
    the background server owns tailnet serving via `[tailscale]` in
    `ganymede.toml`.
  - No silent downgrade: when the background server is `.enabled` or
    `.requiresApproval` but unavailable, fails `ThisMacVerifier`, or does not
    cover the requested path, routing never targets an unverified server and
    `ContentView` shows a one-line notice via `ThisMacNoticeBar` naming the
    reason (reusing `#887`'s `ThisMacTrustFailure` diagnostics).
- Extended `ThisMacChecks` and `AppModel` to mount/unmount the verified
  background server at `"this-mac"` automatically, watch its PID for exit
  (downgrading open windows in place without losing unsaved edits), and
  refresh routing and embedded tailnet state when the LaunchAgent setting
  changes or the app becomes active.
- Added unit tests in `BackgroundServerRoutingTests` and `MenuBarTests`,
  updated `apple/project.yml`, updated [docs/apps.md](../apps.md), and
  posted the Mac by-hand checks to #399.
