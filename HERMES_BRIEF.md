# Brief: trust this Mac's own Ganymede server (#883)

Read issue tlockney/ganymede-ui#883 (`gh issue view 883`) first: it is
the design. This PR does items 1, 2, 3 and the "badge under Machines"
part of 4 (not the section-4 routing of local notebooks). Implement on
branch `claude/project-thread-fneunc`. Delete this file in your commit,
make ONE commit, do not push. Cite `(#883)` in new comments; follow the
comment style of the files you touch.

Where things are:

- `apple/Sources/Ganymede/Place.swift`: add `case thisMac(String)`
  (the remote's id, like `.machine`). `machineID` returns it too (it is
  reached through the mount); add `isThisMac`. `allows`: everything
  `.thisDevice` allows except `kernelLocation`, ignoring `PlaceSettings`.
  `indexesLocally` true. `handlerNames` then matches this device's
  (minus nothing handler-backed by kernelLocation). Check every
  `switch` on Place (`grep -rn "case .machine" apple/`) and decide each
  one for `.thisMac`: mount path and terminals as a machine; links,
  ledger and device as this device. `machineLink`/`linkAction` treat
  `.thisMac` as this device.
- New `apple/Sources/Ganymede/ThisMacVerifier.swift`: reads
  `jpserver-*.json` via `AppMCP.runtimeDirectory` (AppMCP.swift ~117-150
  already lists them), and `verify(info) -> Bool` requiring: loopback
  host in `url`; the pid alive; its code signature valid for the
  requirement `anchor apple generic and certificate leaf[subject.OU] =
"<the app's team ID>" and identifier "<the helper's identifier>"` —
  read the team ID from the running app's own signature
  (`SecCodeCopySelf` + `SecCodeCopySigningInformation`) and find the
  helper identifier from how the release workflow signs
  `Contents/Helpers/ganymede` (grep .github/workflows and scripts; if it
  has no explicit identifier, use what codesign assigns and say so in a
  comment); the pid listening on the port (libproc
  `proc_pidinfo(PROC_PIDLISTFDS)` + `proc_pidfdinfo(PROC_PIDFDSOCKETINFO)`,
  TCP listen on that port); `ganymede_version` == the bundled version
  (find where the app knows it). Put the process/signature/socket/version
  lookups behind a small protocol so tests inject fakes. An unsigned or
  ad-hoc-signed app (debug builds) never verifies anything: that is
  intended.
- Where a `Place` is made from a remote (Place.swift ~26,
  `init` from a remote / WindowTarget / ContentView): when the remote's
  URL matches a verified info file (same loopback port, token), use
  `.thisMac(id)`; else `.machine(id)`. Re-verify when the mount
  reconnects (find `PlaceReachability`) and on load; a window whose
  check fails loads as `.machine` next time.
- `notebookRoot` for the ledger in a `.thisMac` window = the info
  file's `root_dir` (WebView.swift `startLoad` sets
  `kernels.notebookRoot`).
- Sidebar (`NavigatorSidebar.swift`, the Machines list): a verified
  remote shows a "This Mac" badge.
- Tests: `PlaceTests` row for `.thisMac`; `ThisMacVerifierTests` for
  each failing condition and the passing case (fakes); a place-from-
  remote test (verified → .thisMac, else .machine).
- Docs: docs/apps.md (Machines) one paragraph under an **Unreleased.**
  note (exact text in CLAUDE.md). Dev log:
  docs/notes/2026-11-27-this-mac-place.md starting
  `## 2026-11-27, this Mac's own server as a trusted place (#883)`.

Checks: `npm run check`, `npx vitest run`, macOS unit tests, iOS arm64
simulator build (iOS: `.thisMac` never happens; guard macOS-only APIs
with `#if os(macOS)`). Delete untracked build output before committing.
Report counts and anything you couldn't do.
