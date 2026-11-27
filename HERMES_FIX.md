# Fix brief: pre-push review of #883

Branch `claude/project-thread-fneunc` (261b556 + this file). Fix all of
these, delete this file in your commit, make ONE commit, do not push.
Cite `(#883)` in new comments.

## Security and lifecycle

1. Wildcard / `localhost` (Place.swift ~490-503 `serves`/`isLoopback`,
   ThisMacVerifier.swift ~76, ~191). ganymede writes
   `url: http://localhost:P/` for `--ip 0.0.0.0`, `::` or empty. Require
   the info file's url host to be the literal `127.0.0.1` or `[::1]`
   (refuse `localhost` and anything else), and in `isListening` require
   the pid's listening socket's local address (`insi_laddr`, v4 or v6)
   to equal that literal, so a wildcard bind is refused. The remote must
   use that same literal. Tests for: `localhost` url refused, wildcard
   bind refused, matching literal bind accepted.
2. When trust changes (ContentView.swift ~607, ~1245; today `.id(place)`
   rebuilds every window on any flip). Rule: an UPGRADE (machine ->
   thisMac) applies on the window's next load only (snapshot the
   window's place in `@State` at load; ⌘R / reload / a new window re-read
   it). A DOWNGRADE (thisMac -> machine) applies at once: rebuild the
   window as `.machine`, because its elevated handlers must not outlive
   the verified server. Restored windows at launch must not double-load:
   run the first check before the first load of a remote's windows (it
   is quick except the version read, item 6).
3. A recheck asked for during a running check is dropped
   (AppModel.swift ~452-454): add a pending flag and run once more when
   the current check ends.
4. Tie trust to the verified process: when a remote verifies, watch its
   pid (`DispatchSource.makeProcessSource(identifier:eventMask: .exit)`)
   and drop trust (item 2's downgrade) when it exits; watch the runtime
   directory (`DispatchSource.makeFileSystemObjectSource` on its fd,
   `.write`) and recheck on change. A new window re-verifies
   synchronously before it gets `.thisMac` handlers. Clear `thisMac`
   when the app's server stops and on `syncMachines`' no-server return
   (~500).
5. Recents in a `.thisMac` window (NavigatorSidebar.swift ~485, ~499):
   map each recent URL relative to that window's `thisMacRoot` and hide
   entries outside it. Also use `indexesLocally` instead of `isMachine`
   for dimming File › Open Recent / Open Recent Console
   (GanymedeApp.swift ~177, ~193).
6. `bundledVersion` (ThisMacVerifier.swift ~156): cache only a success;
   a nil read retries next time.
7. Ledger root (WebView coordinator `ledgerRoot`): include the root in
   the window's identity, so a restart with a different `root_dir`
   rebuilds the window.
8. Relative `ganymede://open?path=` in a `.thisMac` window resolves
   against `thisMacRoot`, not `/` or home.

## Tests (no test fails today if these are reverted)

9. `AppModel` `applied`/`place(for:)`/`thisMacRoot`, `PlaceReachability`
   `onReachable`, a `WindowWiringTests` `.thisMac` case (full bridge and
   lend, asker nil), and `SystemThisMacProbe.isListening` against a real
   listener the test opens on 127.0.0.1 in its own process (own pid),
   plus a wildcard listener refused. Fix the Fake to reuse the real
   `infoFiles` filter (share it with AppMCP's `jpserver-` scan).

## Docs and nits

10. Menu badge (MachineWindow.swift): NSMenu flattens items, so use the
    title text "<name> — This Mac" in menus; keep the capsule only where
    SwiftUI renders it (the switcher).
11. Docs/dev log: correct "on every window load", "on its next load",
    "refuses a wider one" to match items 1-2; docs/apps.md says the
    server must be the app's own bundled helper and version, listening
    on 127.0.0.1 or ::1, and the remote must use that address. Dev log:
    runtime dir is 0700. "Not done here": the failure banner, follow-up
    issue to be filed (leave a placeholder sentence, no number).
12. Nits: `SecCodeCopyStaticCode` instead of `unsafeBitCast`; fix the
    `testAServerOfAnotherVersionIsNoThisMac` comment.

Checks: `npm run check`, `npx vitest run`, macOS unit tests, iOS arm64
simulator build. Delete untracked build output before committing.
Report counts.
