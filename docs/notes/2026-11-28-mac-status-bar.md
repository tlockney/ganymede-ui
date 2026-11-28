## 2026-11-28, Mac status bar and window title guard (#882)

Added the slim Mac status bar under the workspace (#882) and extracted
and unit-tested the `shownTitle` file guard beside `WindowTarget.tabTitle`
(#871).

- **Status bar (`StatusBar`, `StatusBarContent`):** sits below the
  workspace in `ContentView` on Mac (`Ganymede-iOS` unchanged), taking its
  26pt height from the workspace frame rather than overlaying the page.
  Shows `HeaderStatus.save` on the left (`Saved on This Mac`, `Edited`,
  `Locked: changed on disk`) and `PageState.kernelVersionLine` plus the
  notebook's running session `memoryLabel` on the right when known.
- **Constant height & watcher lifecycle:** when enabled, non-notebook tabs
  (folders, DuckDB consoles, data files, machine folders) keep the same
  26pt height empty without a divider so switching tabs or opening a
  notebook does not jump the page vertically. `MemoryWatcher` registers on
  `PageModel.watchMemory` only while the bar actively shows a notebook
  (and not while the terminal panel or inspector fills the window), never
  decrementing concurrent watchers from the Running list or kernel
  popover.
- **Colors & menu toggle:** added `StatusBarText` in the macOS asset
  catalog (`rgba(60, 60, 67, 0.78)` in light for 5.46:1 on
  `WindowBackground`, `#a7adc6` in dark for 7.57:1) over a hairline
  `Divider` and `WindowBackground`. Added `View > Show/Hide Status Bar`
  (`⌘/`) in `GanymedeApp`, persisted across launches via `@AppStorage`
  (default on).
- **`shownTitle` guard (#871):** extracted `ContentView.shownTitle`'s file
  check to `WindowTarget.shownTitle(target:pagePath:metadataTitle:)`
  beside `tabTitle`, documenting the same-filename-across-folders limit,
  and added unit tests covering `.file`, `.machineFile`, `nil` path and
  `.folder`.
- **Tests & docs:** added `StatusBarTests` (save/edit/locked wording,
  missing version/memory, non-notebooks, `MemoryWatcher` lifecycle,
  `UserDefaults` persistence and WCAG AA light/dark contrast), expanded
  `HeaderStatusTests`, `PageModelTests` and `WindowTargetTests`, added
  `StatusBarState.swift` to `GanymedeTests` and `GanymedeTests-iOS` in
  `apple/project.yml`, and documented the bar in `docs/apps.md`.
