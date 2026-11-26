# Brief: send my name to a connected machine's rooms (Closes #842)

Read CLAUDE.md, CONTRIBUTING.md and issue #842 (`gh issue view 842`) first. Tracking: tlockney/ganymede#965.

## Where things are
- `apple/Sources/Ganymede/Place.swift`: `Place.allows(_:)` gives a `.machine` only `.settings` and `.nativeChrome`.
- `apple/Sources/Ganymede/WebView.swift` (~line 257): adds `PersonName.pageScript(for:)` only when `place.allows(.personName)`.
- `apple/Sources/Ganymede/PersonName.swift`: the script sets `window.ganymedeUser` for the loaded page's origin. A machine window loads the app's own page with `machine=` on the same origin, and `src/lib/room.ts` `pageUserName` already sends the name to rooms on that origin, so no web change should be needed (check it).
- `apple/Sources/Ganymede/Remote.swift`: `Remote` (Codable, saved list of machines). Find how a `Place.machine(id)` maps to its `Remote` (grep `machine(` in WindowTarget.swift, ContentView.swift, RemotesView.swift).

## Change
1. Add a per-machine setting on `Remote`, for example `var sharesName: Bool?` (nil means on, so remotes saved by older builds decode and default to on; synthesized Codable needs an Optional for a missing key).
2. A toggle "Show my name in this machine's notebooks" in the machine's editor in Settings > Remotes (RemotesView.swift), and wherever iPad/iPhone edit a machine. Footer text: your Mac account's name goes to that machine's rooms, so its agents and other people there see who edited.
3. Gate: a machine window gets `.personName` when its remote's setting is on. Keep `Place.allows` testable: for example add a parameter or a `Place.allows(_:sharesName:)` used by WebView, rather than reading global state inside Place.
4. Update doc comments that say the name never goes to a remote (PersonName.swift, src/lib/room.ts, WebView.swift).
5. Tests: PlaceTests (machine with setting on allows personName; off doesn't; this device always does; other capabilities unchanged) and a Remote decode test (old JSON without the key decodes as on).
6. Docs: docs/apps.md "Connected machines": when your name is sent and how to turn it off, with the Unreleased note per CLAUDE.md.
7. Dev log: docs/notes/2026-11-26-machine-person-name.md (follow the repo's dev-log convention; never edit docs/notes.md).
8. Add a by-hand check comment to issue #399 is NOT your job; leave it.

## Before committing
Build and test the Mac app as CONTRIBUTING.md says (xcodegen/xcodebuild test for the GanymedeTests scheme on macOS), and run `npm test` if you touched src/. Keep SwiftUI bodies split into small views (long modifier chains time out the iOS type checker). Commit on this branch with a message ending in:

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GitYQ6Kj6YzUy81wqQeqZR

Delete HERMES_BRIEF.md in your commit. Do not push.
