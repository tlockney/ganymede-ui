## 2026-11-21, A changed places list reaching an open page is tested (#716)

Two Lows from #712's review.

- `setSync` in `room-offline.ts`: the comment gave the wrong reason for
  reading the scroll state first. Only `loadCollapseState()` prevents a
  write at reconnect (a cell collapsed while away, whose metadata says it
  isn't). The editable and scrolled loads are the same step for the other
  two flags, and `scrolled: "auto"` is already normalized when the notebook
  creates the cell. The comment says so; the code is unchanged.
- `WebViewCoordinator.places` had no test. The test target compiles the
  app's sources one by one, and `WebView.swift` needs `AppModel` and most
  of the app, so the coordinator can't be built there. The decision moved
  into `Places.changeScript(place:from:to:)` in `Place.swift`, which is in
  the target: it returns `Places.updateScript(new)` for a machine's window
  and a changed list, and nil for the same list or a window of this device.
  The coordinator's `didSet` calls it and evaluates the result, as before.

Tests (`PlaceTests`): a machine window gets `updateScript` for an added
machine and for a rename, nothing for the same list (or two empty ones), and
this device's window gets nothing. The `didSet`'s other half
(`installPageScripts`, for the next load) stays untested, since the
coordinator isn't in the test target.

Finding: the list reaches no visible switcher in the apps today. Only the
page's own sidebar reads `ganymedePlaces` (`usePlaces`), and the page draws
it only without `chrome=native`; every app window loads with
`chrome=native` since #740 (Mac) and #761 (iPad, iPhone), and the native
place menus read `AppModel.places`. So the by-hand checks on #399 and #273
("the place menu lists the change without a reload") test the native menus,
not this path. The comment in `WebView.swift` says so. Whether
`ganymedePlaces`, `Places.updateScript` and this `didSet` can go is a
follow-up issue.

Checks: `npm run check`, `npm test`, `npm run build`, `prettier --check` on
this note. Swift can't build in the container; CI's macos-app job is the
first compile.
