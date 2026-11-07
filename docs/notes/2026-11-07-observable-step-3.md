## 2026-11-07, @Observable, step 3: AppModel and OpenRequests (#357)

- `AppModel` and `OpenRequests` are `@Observable`, the last
  `ObservableObject`s in the app. Views take `AppModel` from the
  environment with `@Environment(AppModel.self)`, put there with
  `.environment(model)`; the app holds the shared instance in a plain
  `let`.
- Notebook windows watched `OpenRequests`' `$pending` and `$front`
  publishers with `onReceive`. They now use `onChange(of:initial:)`.
  `initial: true` keeps what the publisher did on subscribe: a window
  that appears after files were queued still sees them. Unlike
  `onReceive`, `onChange` skips an assignment of an equal value; `add`
  and `finishLaunching` never relied on one.
- As in step 2, stored properties that were not `@Published` (the
  server, its queue, launch state, the open-window closures) are
  `@ObservationIgnored`.
- The test that `add` publishes once per batch now counts changes with
  `withObservationTracking`, watching again after each.
- With no Combine left in the app, the hand check in #357 covers all
  three steps.
