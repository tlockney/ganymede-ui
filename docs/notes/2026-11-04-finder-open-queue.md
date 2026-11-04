## 2026-11-04, Finder opens go through the app delegate (#228)

On a real Mac, double-clicking a notebook opened the app but not the
notebook. Finder opens used SwiftUI's routing (#130): `onOpenURL` in
the notebook window, with `handlesExternalEvents(preferring:allowing:)`
so a notebook window takes later opens of its own file. A window opened
on nothing allows none, since SwiftUI matches by substring and a folder's
URL is a prefix of every file in it. The crash in #226 showed SwiftUI
making a new window for the file from `application(_:open:)`. That window
has no target yet, so it most likely refused the URL, and `onOpenURL`
never ran.

- The app delegate's `application(_:open:)` now takes the URLs, and
  `OpenRequests` (on `AppModel`) queues them. Every scene has
  `handlesExternalEvents(matching: [])`, so SwiftUI doesn't make windows
  for them itself.
- Each notebook window watches the queue, and the first to see it takes
  it all. Files that came while the app launched (AppKit calls
  `application(_:open:)` before `applicationDidFinishLaunching`) go to
  the window the app opened on nothing. Other files open with
  `openWindow(value:)`, which brings forward a window already showing one.
- `OpenRequestsTests` cover which window shows which file. Nothing tests
  the delegate path on CI: that needs the Finder and a real scene.
- Not yet tried on a Mac. If SwiftUI ever stops passing
  `application(_:open:)` to the adaptor's delegate, nothing opens: check
  that first if this comes back.
