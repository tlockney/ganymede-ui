## 2026-11-07, @Observable, step 2: the window models (#357)

- `PageModel`, `PageDocument`, `PanelController`, `InspectorController`
  and `EditorDocument` are `@Observable`. Menus read them as the front
  window's `@FocusedValue`s (keys in `FocusedModels.swift`), set with
  `focusedSceneValue`, in place of `@FocusedObject` and
  `focusedSceneObject`, which need `ObservableObject`.
- Stored properties that were not `@Published` (the web view, window,
  close guard, pending commands, an editor's text between loads, and the
  like) are `@ObservationIgnored`, so views redraw for the same changes
  as before. An editor's `text` in particular changes on every keystroke
  and is read only when `generation` moves.
- Windows hold them in `@State`. Unlike `@StateObject`, `@State`
  evaluates its initial value on every view init and keeps the first, so
  `WebViewStore.parking` is now lazy too (review note on step 1).
- The inspector's tab picker binds through `@Bindable`.
- Left for step 3: `OpenRequests` and `AppModel`, whose publishers views
  and tests subscribe to.
