## 2026-11-28, Mac tabs parity and graduation (#905)

Graduated the custom Mac tab strip out of Developer Settings and added full
window-tab parity on top of the unified `WorkspaceTabController` store (#904):

- **Graduated custom strip & titlebar/trough drag:** Removed
  `TabStripSpikeSection`, `SettingsTab.customTabsKey`,
  `SettingsTab.customTabsSamplesKey`, and all sample tab surfaces/addons.
  `WorkspaceTabStrip` is permanently active on macOS directly below
  `NotebookToolbar` in the detail column, with empty trough space and the
  trailing spacer after `+` backed by `mouseDownCanMoveWindow` /
  `window.performDrag(with:)` views so users can drag windows from the strip
  without interfering with tab clicks, horizontal scroll, or tab dragging.
- **Drag-reorder, drag-detach, and cross-window docking:** Added pure
  cross-platform `TabDragGeometry` and macOS `TabDragCoordinator` +
  `WorkspaceTabHandoff` + `PageWebViewStore` (`WebView.swift`). Dragging a tab
  reorders live sessions in place with an insertion indicator, dragging past
  the vertical detach threshold opens a new standalone window positioned near
  the drop point, and dragging onto another window's strip docks the live
  session (closing an emptied 1-tab source window without spawning a stray
  start window). `PageWebViewStore` keeps `WKWebView` + `WebViewCoordinator`
  alive across window reparenting, `TerminalHandoff` preserves running shells
  and scrollback, and `EditorDocument` preserves unsaved text edits.
- **Window menu commands, shortcuts, and Show All Tabs overlay:** Added
  `WindowTabCommands` (`Select Previous Tab` `⌃⇧Tab`, `Select Next Tab` `⌃Tab`,
  `Move Tab to New Window`, `Merge All Windows`, `Show All Tabs` `⇧⌘\`, and
  `⌘1`–`⌘9` tab selection with `⌘9` selecting the last tab) plus a local key
  monitor so `⌃Tab` / `⌃⇧Tab` work reliably even when `WKWebView` or
  `TerminalView` has focus. Moved Mac sidebar navigator shortcuts and tooltips
  to `⌥⌘1`–`⌥⌘6` (including `⌥⌘4` for Find) while leaving iPad on `⌘1`–`⌘6`.
  Built `TabOverviewOverlay` + pure `TabOverviewNavigation` for the `⇧⌘\`
  in-window visual tab-grid overlay with live search filtering, arrow-key
  navigation, dirty/kernel indicators, and card close buttons.
- **Multi-tab session restoration:** Added `RestorableTabSet` stored in
  `@SceneStorage("window.tabs")` with backward-compatible fallback to legacy
  `window.target` / `window.sidebar`, restoring ordered page, editor, and
  terminal tabs, active tab selection, and per-tab sidebar roots across
  relaunch while giving precedence to `WorkspaceTabHandoff`,
  `WorkspaceTabs.pending`, and Finder `OpenRequests`.
- **Verification:** Ran `npm run check`, `npm test`, macOS `GanymedeTests`,
  signed macOS Debug build + `codesign -dvv` + `check-app-bundle.sh`,
  `Ganymede-iOS` generic build, and `GanymedeTests-iOS` on iOS Simulator.
