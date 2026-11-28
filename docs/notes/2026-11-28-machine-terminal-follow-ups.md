## 2026-11-28, machine terminal follow-ups (#860)

Four fixes from the review of #859; only the third, the panel's + menu,
changes behaviour.

- **The docs.** The Machines section of [docs/apps.md](../apps.md) said File >
  New Terminal, New Terminal Tab and the panel's New Terminal all start a
  shell in the panel. New Terminal Tab opens one in a tab of its own; the
  sentence says so now, with the folder rules and New Terminal On unchanged.
  The paragraph sits under an Unreleased note, which stays.
- **The switch from a target to its transport** was the view's, so nothing
  tested that a `.server` target asks `TerminalTarget.serverTransport(on:)`
  with its folder. It is `TerminalTarget.transport(on:)` now, in a file the
  tests compile, and the view asks `AppModel.transport(for:)` for it, beside
  `title(for:)`. What the switch needs from the app — its own server, the
  remotes' servers, and SSH, which differs by platform — is `TerminalHost`,
  a protocol so a test answers without an app model: `AppModel`'s initializer
  is private, and the test bundles don't compile its file. `TerminalTargetTests`
  asserts a machine's target opens a `JupyterTerminalTransport` on the
  remote's endpoint with cwd `sub`, and that a target whose remote is unknown
  has none. `JupyterTerminalTransport.cwd` is no longer private, so the
  assertion reads it instead of the request it sends; the existing test still
  checks the request's body.
- **The panel's + menu** built its `Menu` with a `primaryAction`, which took
  the click even when the window had no terminal to start and did nothing
  with it. With `newTerminal` nil the menu has no `primaryAction` now, so a
  click opens the menu itself; with one it adds the terminal as before. The
  items are one `@ViewBuilder` property, so the two forms don't repeat them.
- **A `Place.Capability` case for this device's own shell** had no reader
  since #858 gave a machine's window its own terminal panel — `terminalTarget(notebook:fallbackFolder:remotes:)`
  decides where a new one runs — so the case and its doc comment are gone,
  and `PlaceTests` checks `kernelLocation` alone.

The + menu with no target can't be unit-tested; it is a by-hand check
on the Mac (a machine window whose remote has SSH only, or was removed:
a click on + opens the menu), listed in the Mac by-hand checks issue,
#399, under "Machine terminal + button (#860, PR #900)".

Checked with `npm run check`, `npx vitest run`, `node scripts/check-notes.mjs`,
`npx prettier --check docs`, and `xcodebuild test` on the Mac scheme, and the
iOS scheme built.
