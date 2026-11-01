## 2026-11-01, Native document windows on the Mac (#132)

Part of making the Mac app the default app for `.ipynb` files (#128).

- The page tells the app about its notebook through a `document` script
  message handler: `{ path, dirty }`, posted from an effect on the open
  path and the controller's dirty flag (`src/lib/native.ts`). In a browser
  the handler is missing and nothing is posted. The path is relative to
  the server's root, which is `/` on the Mac (#130), so the app gets the
  file by prefixing `/`.
- The app saves through the page: `window.ganymede.save()` returns a
  promise of whether the notebook was saved. `NotebookController.save`
  now returns that boolean instead of `void`, so a declined overwrite or a
  failed save keeps the window open. `callAsyncJavaScript` waits for the
  promise; `evaluateJavaScript` would not.
- SwiftUI has no `windowShouldClose`. `CloseGuard` takes the window's
  delegate slot, answers `windowShouldClose`, and forwards every other
  selector to SwiftUI's delegate (`responds(to:)` and
  `forwardingTarget(for:)`). If SwiftUI ever sets the delegate again, the
  prompt is lost. That needs checking on a real Mac.
- The proxy icon comes from `window.representedURL`, not SwiftUI's
  `navigationDocument`. Adding that modifier only when a file is open
  would change the view's identity and rebuild the web view.
- File > Save replaces SwiftUI's `.saveItem` group and finds the front
  window through `focusedSceneObject`. The page still handles ⌘S itself
  when it has focus, so a key press saves once either way.
- Open Recent uses `NSDocumentController.noteNewRecentDocumentURL`, which
  works without NSDocument because the app declares the document type.
  SwiftUI only adds the menu for `DocumentGroup` apps, so it is built in
  `OpenCommands`.
