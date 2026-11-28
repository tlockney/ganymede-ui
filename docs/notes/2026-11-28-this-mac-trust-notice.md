## 2026-11-28, notice when a local server isn't trusted as This Mac (#887)

Follow-up from #883: when a machine window's server is on a loopback address
(`127.0.0.1`, `::1`, or `localhost`) and fails a `ThisMacVerifier` check, the
window previously stayed an ordinary machine window silently, with only the
missing "This Mac" badge as a clue.

- Added `ThisMacTrustFailure` in `apple/Sources/Ganymede/Place.swift`, covering
  every failure case the verifier or remote matching can produce: unsigned app
  build (`unsignedApp`), missing bundled helper (`missingBundledHelper`),
  remote URL using `localhost` (`localhostURL`), no matching server info file
  (`noServerInfo`), exited pid (`processNotRunning`), wrong executable path
  (`wrongExecutablePath`), non-bundled/wrongly signed server
  (`wrongSignature`), wildcard bind on `0.0.0.0` or `::`
  (`wildcardBind`), info file naming `localhost` (`infoFileUsesLocalhost`) or a
  non-loopback address (`nonLoopbackAddress`), pid not listening on the
  loopback socket (`notListening`), missing token (`missingToken`), incomplete
  info file (`incompleteServerInfo`), unreadable bundled helper version
  (`bundledVersionUnavailable`), version mismatch (`versionMismatch`),
  mismatched loopback family (`addressMismatch`), and mismatched token
  (`tokenMismatch`). Each case provides a concise one-line `notice` naming the
  failed check and what to do.
- Extended `ThisMacVerifier` (`apple/Sources/Ganymede/ThisMacVerifier.swift`)
  with `diagnose(_:hostname:)` and `scan(in:)` so `verify(_:)` and
  `servers(in:)` share a single verification path. `SystemThisMacProbe` gained
  `isListeningOnWildcard(pid:port:)` (checking both IPv4 `0.0.0.0` and IPv6/dual-stack
  `::` via `libproc`), and candidate reading preserves `hostname` because
  `ganymede serve --ip 0.0.0.0` writes `"url": "http://localhost:<port>/"` with
  `"hostname": "0.0.0.0"`. Cheaper checks still run before `bundledVersion`, so
  failing or unsigned scans never spawn `Contents/Helpers/ganymede --version`.
- Extended `ThisMacServers` and `ThisMacChecks` to retain per-remote failures
  only for loopback remotes, clearing them on upgrade to `.thisMac`, `forget`,
  and `stopTrust`, and returning `nil` for non-loopback remotes and
  `.thisDevice`.
- Added `ThisMacNoticeBar` (`apple/Sources/Ganymede/MachineWindow.swift`,
  `#if os(macOS)`) at the top of `ContentView.workspace` when
  `model.thisMacNotice(for: place)` is non-nil.
- Updated `ThisMacVerifierTests`, `ThisMacServersTests`, and
  `ThisMacChecksTests` to cover every failure reason, real wildcard socket
  detection (`0.0.0.0` and `::`), non-loopback servers showing no notice, and
  clearing on upgrade to This Mac. Documented the notice in
  [docs/apps.md](../apps.md).
