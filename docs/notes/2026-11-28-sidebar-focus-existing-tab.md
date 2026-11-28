## 2026-11-28, Mac sidebar focuses an already-open tab (#884)

Choosing a notebook (or data file) from the Mac sidebar while another tab
was in front sent `open` to the front tab's page, replacing it with a
second copy instead of bringing the existing tab forward (#884, #247).
Text files already focused their existing tab because `EditorRequest`
opens through `openWindow(value:)`, while notebooks opened in place with
`page.run("open", ...)`.

- **Track each window's live target (`WorkspaceTabs`, `OpenWindows`,
  `ContentView`):** `ContentView.noteWindow` now passes `target ?? loaded`
  to `WorkspaceTabs.note`, so `OpenWindows` tracks both windows opened
  directly on a file and folder/`⌘T` windows that navigated to a
  notebook or data file in place (via `ContentView.follow`) and drops
  that match if the notebook closes or the window closes.
- **Target matching (`WindowTarget`):** added `WindowTarget.file(serverPath:in:)`
  for server-path callers (`RunningList`, `JournalsNavigator`) and
  `WindowTarget.matchesOpenTarget(_:)`, which resolves symlinks on local
  file URLs (`/tmp` vs `/private/tmp`), compares machine IDs
  case-insensitively while keeping `.thisDevice` and `.machine`/`.thisMac`
  separate, and preserves console session ID matching.
- **Focus-or-open helpers (`WorkspaceTabs.focus`, `openOrFocus`,
  `openOrFocusTab`):** when a matching window exists (preferring the
  current key/main window, then `NSApp.orderedWindows`), `focus`
  deminiaturizes it if needed, selects it in its `NSWindowTabGroup`, and
  calls `makeKeyAndOrderFront(nil)`. Wired across all Mac sidebar
  navigators (`FolderSidebar`, `FindNavigator`, `RunningList`,
  `JournalsNavigator`, `RecentsNavigator`), context-menu "Open in New Tab"
  actions, `ContentView.openTab` / `takeOpenRequests`, and `OpenCommands`.
- **Verification:** added unit tests in `WindowTargetTests` and
  `WorkspaceTabsTests` covering `WindowTarget.file(serverPath:in:)`,
  `matchesOpenTarget`, `OpenWindows` in-place tracking, symlink and
  machine-place separation, and `AppKit` tab-group switching without
  dispatching `open` to the front page.
