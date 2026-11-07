## 2026-11-07, @Observable, step 1: the leaf models (#357)

- With the apps on macOS 26 and iOS 26 (#356), the Observation framework
  is always there. This step moves the models that no menu reads through
  `@FocusedObject` and that no code subscribes to with Combine:
  `CrashReports`, `Recents`, `OpenTerminals`, `IPadOpenFiles`, and
  `WebViewStore` (which published nothing; it was an `ObservableObject`
  only so a `@StateObject` could hold it).
- Views that read them drop `@ObservedObject` / `@StateObject` for a plain
  property or `@State`: SwiftUI tracks the properties a body reads, so a
  view now redraws only for those, not for any `@Published` change.
- `IPadOpenFiles` keeps its `documents` cache out of observation
  (`@ObservationIgnored`); only `stack` drives the view.
- Next steps: the models menus read with `@FocusedObject` (`PageModel`,
  `PageDocument`, `PanelController`, `InspectorController`,
  `EditorDocument`) move to `@FocusedValue`, and `OpenRequests` /
  `AppModel`, whose publishers views and tests subscribe to.
