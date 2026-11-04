## 2026-11-04, Mac app crashed opening a notebook from the Finder (#226)

The native toolbar from #222 was customizable, `.toolbar(id: "notebook")`.
AppKit puts every toolbar that shares an identifier in one "family" and
copies item changes across all of them. When a notebook opened from the
Finder made a window at launch, SwiftUI inserted its items while it was
still sizing and placing that window, and AppKit's sync into another
toolbar in the family threw an uncaught exception from
`-[NSToolbar _insertNewItemWithItemIdentifier:…]`, which killed the app.

- The toolbar is no longer customizable: `.toolbar { … }` with plain
  `ToolbarItem`s creates no family, and View › Customize Toolbar is gone.
  If customizing comes back, give each window its own toolbar identifier,
  or move the toolbar into an `NSToolbar` the app owns.
- No unit test covers this. SwiftUI builds the window toolbar only for a
  scene window, which XCTest can't create; the fix has to be checked by
  opening a notebook from the Finder on a Mac.
