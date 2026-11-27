# Fix brief: reviewer round 1 on PR #880 (#877)

Branch `claude/project-thread-fneunc` (d48f20b + this file). Fix both,
delete this file in your commit, make ONE commit, do not push. Cite
`(#877)` in new comments.

1. Medium, packages/device/swift/Sources/DeviceBridge/Dialogs.swift ~756:
   on iOS, `ui.pickDate()` with no title from this device's own kernel
   now shows "Choose a date" / "Choose a time" as the navigation title;
   on main it showed none. Make `Dialog.words` (or the iOS call site) use
   `standIn` only when an asker is set, so with no asker the iOS title
   stays nil exactly as on main. The Mac already used the stand-in as
   its title before #877: keep the Mac unchanged. Add a test that with
   no asker and no title the iOS path's title is nil, and with an asker
   it is the stand-in.
2. Low, apple/Sources/Ganymede/WebView.swift ~396: the `startLoad` gate
   that calls `kernels.uiWillLoad(url)` (which sets `pageURL`, without
   which `fromPage` refuses every call) has no test. Add a small helper on
   `Place`, e.g. `tracksPageURL(_ settings: PlaceSettings) -> Bool`
   (true when the place allows `deviceLedger` or `deviceRemote`), use it
   in `startLoad`, and test it in PlaceTests: this device true, machine
   with usesDevice on true, off false.

Checks: `npm run check`, `npx vitest run`, packages/device `swift test`,
macOS unit tests, iOS arm64 simulator build. Report counts. Delete any
untracked build output (e.g. packages/device/build) before committing.
