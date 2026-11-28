## 2026-11-28, Mac ⇧⌘↩ shortcut ownership for View › Fill Window (#885)

- Removed the duplicate `⇧⌘↩` (`.return` with `[.command, .shift]`) keyboard
  shortcut from Mac `Cell › Run All Cells` in `NativeChrome.swift`, leaving
  `View › Fill Window / Restore Layout` as the sole owner via
  `MacCommandShortcuts` in `WindowLayout.swift`. iPad (`IPadChrome.swift`) is
  unchanged because iPad does not have `Fill Window`.
- Verified keybinding precedence across all three layers on macOS:
  - Web notebook (`src/lib/jupyterlab.ts`, `src/lib/shortcuts.ts`, CodeMirror):
    with `Platform.IS_MAC` true (`MacIntel`), `Shift+Cmd+Enter` normalizes to
    `'Shift Cmd Enter'`, matches no Lumino or CodeMirror command, leaves
    `defaultPrevented` false, and hands the key equivalent back to `WKWebView`
    and `NSApp.mainMenu`.
  - Terminal (`SwiftTerm`): `TerminalView.performKeyEquivalent(with:)` returns
    `false` for `⇧⌘↩` and `keyDown(with:)` passes Command key equivalents to
    `NSApp.mainMenu`.
  - Mac menu bar: both `Cell › Run All Cells` and `View › Fill Window`
    previously bound `⇧⌘↩`, so pressing `⇧⌘↩` collided with `Run All Cells`.
- Added Mac keybinding precedence regression tests in `src/lib/shortcuts.test.ts`,
  `src/lib/jupyterlab.test.ts`, and `apple/Tests/GanymedeTests/WindowLayoutTests.swift`.
  Real-keyboard verification on macOS is still needed because automation tests
  and the original `#399` `CGEventPostToPid` check do not exercise interactive
  hardware-keyboard delivery to a foreground Mac window.
