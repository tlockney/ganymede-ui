# Fix round for #842 (branch claude/project-thread-fneunc)

Make exactly these changes, then run the tests named at the end. Keep the
existing comment style: short `///` doc comments that say why, citing
`(#842)`. Do not touch other files. Delete this file in your commit.

## 1. One rule for which page a window may load (Place.swift, WebView.swift)

The page reads `machine=` from `location.search` on ANY path
(`src/lib/backends.ts` `machineFromSearch`: `URLSearchParams(search).get('machine')`,
the first one, ignored when not a valid id). So `/index.html?machine=<id>`
is a machine page too. Today a this-device window only refuses
`WindowTarget(page:)` targets (path `/` only), and a machine window is
only checked for `.linkActivated`.

In `Place.swift`, after `allowsFollowing`, add:

```swift
/// The place a page at `url` on the app's own server shows, as the page
/// reads it (`machineFromSearch`): the first `machine=` on any path, a
/// malformed one ignored, so the page falls back to this device (#842).
static func shown(by url: URL) -> Place {
    let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    guard let raw = items.first(where: { $0.name == "machine" })?.value else { return .thisDevice }
    // `URLSearchParams` reads `+` as a space; a space is never a valid id.
    return Place(machine: raw.replacingOccurrences(of: "+", with: " ")) ?? .thisDevice
}

/// Whether this place's window may load `url`, a page on the app's own
/// server, by any navigation (#842). A window's handlers and the person's
/// name are fixed for its place, so it never becomes another place's
/// page: this device's window never a machine's, a machine's never this
/// device's (`allowsFollowing`) or another machine's.
func allowsLoading(_ url: URL) -> Bool {
    let shown = Self.shown(by: url)
    switch self {
    case .thisDevice: return !shown.isMachine
    case .machine: return allowsFollowing(url) && (shown == self || !shown.isMachine)
    }
}
```

Also fix `allowsFollowing`'s doc comment: drop "This device's windows may
go anywhere on it." and say this device's windows are checked by
`allowsLoading`.

In `WebView.swift` `decidePolicyFor navigationAction`, replace the two
branches (the `!place.isMachine ... WindowTarget(page:)` one and the
`place.isMachine, navigationAction.navigationType == .linkActivated` one)
with ONE branch, for every navigation type and both kinds of window:

```swift
} else if navigationAction.targetFrame?.isMainFrame ?? true,
          let target = navigationAction.request.url, !isExternal(target),
          Self.isWebURL(target), !place.allowsLoading(target) {
    // A window never becomes another place's page (#842): its handlers
    // and the person's name are its own place's.
    decisionHandler(.cancel)
```

Tests in `PlaceTests.swift` (new test `testAWindowLoadsOnlyItsOwnPlacesPages`),
with `id` as the other tests use and `url(_:)` as in
`testAMachineWindowStaysOnItsMountOrItsOwnPage`:

- `Place.thisDevice.allowsLoading`: true for `/`, `/?open=/a.ipynb`,
  `/api/contents/`, `/?machine=bad!`; false for `/?machine=\(id)`,
  `/index.html?machine=\(id)`, `/x/y.html?kernels=server&machine=\(id)`.
- `Place.machine(id).allowsLoading`: true for
  `/?kernels=server&machine=\(id)&open=/a.ipynb` and
  `/machines/\(id)/files/a.png`; false for `/?machine=other1`,
  `/index.html?machine=other1`, `/machines/\(id)/index.html?machine=other1`,
  `/` and `/files/secret.txt`.
- `Place.shown(by:)`: first `machine=` wins; `machine=bad!` is
  `.thisDevice`.

## 2. The setting changes in place, without rebuilding the view (WebView.swift, ContentView.swift)

Today `ContentView` keys the web view on `.id(pageIdentity)` (place and
setting). A rebuild loads the window's FIRST page, not the one it shows
now, reloads iPad machine scenes for a setting that does nothing there,
and drops commands mid-reload. Replace it:

- `ContentView.swift`: delete `pageIdentity` and its doc comment; put
  both `.id(pageIdentity)` back to `.id(place)` with their original
  comments ("A page loaded for another place gets its own handlers." on
  the Mac; the two-line #758 comment on iOS). Keep passing
  `sharesName: sharesName(for: place)`.
- `WebViewCoordinator`: `sharesName` becomes `private(set) var`. Its doc
  comment: on this device it is ignored; a change reaches the open page
  through `update(sharesName:)`. Add:

```swift
/// The machine's name setting changed (#842): the page's scripts are
/// made again and the page it shows now reloads, when that changes
/// whether it gets the name. Its commands wait for the reloaded page.
func update(sharesName new: Bool) {
    let before = place.allows(.personName, sharesName: sharesName)
    sharesName = new
    guard place.allows(.personName, sharesName: new) != before,
          PersonName.name != nil, let view = webView, loaded != nil
    else { return }
    Self.installPageScripts(on: view, loaded: loaded, place: place, sharesName: new)
    page?.reset(forStart: AppModel.shared.serverStart)
    view.reload()
}
```

- Call `context.coordinator.update(sharesName: sharesName)` first thing
  in both `updateNSView` and `updateUIView`.
- `WebViewStore.sharesName` stays `let` (the initial value); update its
  comment to say later changes go through the coordinator's
  `update(sharesName:)`.

## 3. Fail closed, and test the wiring (WebView.swift, new test)

- Remove the `= true` default from `sharesName` on both `WebView`
  structs, on `WebViewStore.init` and `WebViewCoordinator.init`, so a call
  site that forgets it does not compile. Fix every call site the
  compiler reports (search `WebViewStore(` and `WebViewCoordinator(` in
  Sources and Tests; this device's windows pass `sharesName: true`).
- Make `installPageScripts` `static func` with no `private` (internal),
  so tests can call it.
- New `apple/Tests/GanymedeTests/PersonNameScriptTests.swift`:

```swift
import WebKit
import XCTest

/// The person's name reaches a machine's page only when its setting says so (#842).
@MainActor
final class PersonNameScriptTests: XCTestCase {
    private let loaded = URL(string: "http://127.0.0.1:8123/?kernels=both")!

    private func getsName(place: Place, sharesName: Bool) throws -> Bool {
        try XCTSkipIf(PersonName.name == nil, "no account name on this runner")
        let view = WKWebView(frame: .zero)
        WebViewCoordinator.installPageScripts(on: view, loaded: loaded, place: place, sharesName: sharesName)
        return view.configuration.userContentController.userScripts.contains { $0.source.contains("ganymedeUser") }
    }

    func testAMachinesPageGetsTheNameOnlyWithItsSettingOn() throws {
        XCTAssertTrue(try getsName(place: .machine("m1"), sharesName: true))
        XCTAssertFalse(try getsName(place: .machine("m1"), sharesName: false))
    }

    func testThisDevicesPageAlwaysGetsTheName() throws {
        XCTAssertTrue(try getsName(place: .thisDevice, sharesName: false))
    }
}
```

  The test target compiles the app's sources (PlaceTests has only
  `import XCTest`), so no `@testable import`. `ContentView.swift:99`
  `WebViewStore()` becomes `WebViewStore(place: .thisDevice, sharesName: true)`.

## 4. Docs and comments

- `WebViewCoordinator` comment that said "a changed setting reaches a
  machine's windows as they are made again": now covered by item 2.
- `docs/apps.md`: move the `> [!NOTE] **Unreleased.** ...` block from the
  top of "## Connected machines" to directly under the "**Your name.**"
  bullet (indented as a block after the list ends is fine: put it right
  after the bullet list that contains "Your name"). Reword the bullet's
  "open windows of that machine reload" to "an open notebook of that
  machine reloads in place".
- `docs/notes/2026-11-26-machine-person-name.md`:
  - Replace "README's privacy line and Ganymede's docs/privacy.md (an
    `Unreleased in ganymede-ui` marker) are updated too." with "README's
    privacy line is updated too; ganymede#968 adds an `Unreleased in
    ganymede-ui` note to Ganymede's docs/privacy.md and merges after this."
  - Replace any claim that the window "refuses any navigation to a
    machine's page" with: a window loads only its own place's pages
    (`Place.allowsLoading`): this device's never a machine's, on any
    path, and a machine's never this device's or another machine's.
  - Add one line: an older build that saves the remotes drops an "off"
    setting, so after a downgrade the setting is on again.
- `src/lib/room.ts` (lines ~92-94): "A remote server opened from a
  browser, iPad or iPhone, gets none" -> "A page in a browser, or on an
  iPad or iPhone, gets none".

## 5. Check

Run, from the repo root, and fix until all pass:

```sh
npm run check
cd apple && xcodebuild test -scheme Ganymede -destination 'platform=macOS' -only-testing:GanymedeTests/PlaceTests -only-testing:GanymedeTests/PersonNameScriptTests -only-testing:GanymedeTests/RemoteStoreTests 2>&1 | tail -40
```

(If the scheme or test target name differs, use the ones in
`apple/*.xcodeproj` or `apple/project.yml`; build for iOS too with
`xcodebuild build -scheme Ganymede -destination 'generic/platform=iOS Simulator'`
if that scheme exists, since both `WebView` structs change.)

Commit once, message: "Fix second review of #842: one load rule per place,
setting reloads in place, fail closed, wiring test" with trailer
`Refs #842`. Do not push. Delete HERMES_FIX.md in that commit.
