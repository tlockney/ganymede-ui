## 2026-11-28, Mac tabs spike (#903)

Step 6 of the visual redesign (#844) investigated how far AppKit's `NSWindowTab` can go toward [docs/design/mac-visual-redesign/boards/E-Tabs.png](../design/mac-visual-redesign/boards/E-Tabs.png) and `E-Mac.png`, and prototyped a custom page-joined tab strip behind an off-by-default Developer Settings toggle.

### 1. What `NSWindowTab` can and cannot do

Checked directly against the macOS SDK headers (`NSWindowTab.h`, `NSWindowTabGroup.h`, `NSWindow.h`):

- **What `NSWindowTab` exposes:** only four public properties (`title`, `attributedTitle`, `toolTip`, and a right-aligned, y-centered `accessoryView` sized by constraints). `attributedTitle` lets you override text attributes (or embed an inline `NSTextAttachment`), `toolTip` carries the full dated filename independently of `title`, and `accessoryView` hosts the kernel busy dot (`WorkspaceTabs.markBusy`).
- **What `NSWindowTab` cannot do:**
  - **Shape, height, and page join:** AppKit owns `NSTabBar` / `NSTabButton` layout inside the window's titlebar container. No public API lets the selected tab grow taller (`40pt` vs `32pt`/`30pt`) with square bottom corners (`11pt` top radius, `0pt` bottom radius) that flush-join the page canvas below without a titlebar separator.
  - **1.5pt colored top accent edge:** `NSWindowTab` offers no background or top-edge stroke hook; `attributedTitle` and a right-aligned `accessoryView` are inset inside AppKit's tab button bounds and cannot draw a top edge that follows the tab's top contour (orange for notebooks, blue for machines, neutral for terminals).
  - **Per-kind unselected silhouettes and content sizing:** `NSWindowTabGroup` stretches every tab into equal-width system tab cells across the full window width. It cannot render content-sized quiet notebook chips (`TS`/`PY` badge + kernel dot), outlined machine capsules (`1pt` border + device icon), or dark mono terminal chips (`>_ zsh`) grouped by a vertical separator, nor place the strip inside the detail column beside a full-height floating sidebar (`E-Mac.png`).
  - **Tab-strip visibility:** AppKit forces the system tab bar visible whenever `tabGroup.windows.count > 1` (`toggleTabBar:` only hides it for a single window), so custom chrome cannot coexist with an active `NSWindowTabGroup`.

### 2. Custom tab strip prototype (off by default)

- **Settings toggle (`SettingsTab.swift`, `DeveloperSettings.swift`):** `SettingsTab.customTabsKey` (`"customTabStrip"`, default `false`) and `SettingsTab.customTabsSamplesKey` (`"customTabStripSamples"`, default `false`) live in a `#if os(macOS)` section under Settings › Developer. While off, `ContentView` renders `workspace` directly and `WorkspaceTabs` runs the untouched AppKit tabbing path.
- **Model & geometry (`Tabs/WorkspaceTabModel.swift`, `Tabs/TabStripLayout.swift`):** Cross-platform (no AppKit dependency, compiled into both `GanymedeTests` and `GanymedeTests-iOS`).
  - Classifies tabs into `.notebook`, `.machine`, `.terminal`, and `.editor`, mapping top-edge tones (`.orange` / `.blue` / `.neutral`), document vs environment grouping for the vertical divider, language badges (`TS`, `PY`, `JS`, `SQL`, `JL`, `R`, `RS`, `GO`, `SH`, `MD`), `WindowTarget.tabTitle` display titles with dated-filename tooltips, and `HeaderStatus.dotLabel` accessibility descriptions (`"Kernel idle"`, `"Kernel busy"`, etc.).
  - `TabStripLayout.compute` calculates tab widths, middle-vs-tail truncation flags, and scroll bounds so the `E-Mac.png` 5-tab set fits without overflow at **1280** (`1040pt` detail) and **1728** (`1488pt` detail) wide, long titles clamp at `260pt` without starving siblings, and overflowing tab strips keep `+` pinned at the trailing edge.
- **Views & in-window host (`Tabs/WorkspaceTabStrip.swift`, `Tabs/WorkspaceTabHost.swift`, `ContentView.swift`):**
  - Renders the `46pt` trough (`#13172a` dark / `#ece7dc` light), `40pt` square-bottomed active tab (`WindowBackground` for notebooks, blue-tinted `#1a2442` / `#eaf0fc` for machines with `MachineSurfaceHeader` below, `#0d1020` / `.textBackgroundColor` for terminals) with clipped `1.5pt` top accent (`AccentFill` ~55% orange, `Ready` ~58% blue, neutral for terminal), and distinct unselected silhouettes plus `+` menu (New Notebook Tab, New DuckDB Console, New Terminal Tab, connected machines).
  - Keeps Tab 0 anchored to `ContentView`'s primary `workspace` in a `ZStack` alongside live extra `WebView` (`TabPagePane`) and `TerminalWindow` sessions, with optional lightweight sample views when `Show Sample Tab Kinds` is turned on.
  - All AppKit/macOS-only code is guarded by `#if os(macOS)` so `Ganymede-iOS` continues to build cleanly.

### 3. What changes vs AppKit `WorkspaceTabs` (#247, #257)

When the prototype toggle is **on**, `WorkspaceTabs.join` sets `window.tabbingMode = .disallowed` so AppKit does not draw a second native tab bar over the strip:

- **Drag-tab-out to new window:** Lost. Needs an `NSDraggingSession` / drop-outside-window handler that tears a `WorkspaceTabController.Session` out via `openWindow(value:)`.
- **`Window > Merge All Windows` and `Move Tab to New Window`:** Disabled/inactive because windows are not in an `NSWindowTabGroup`. Requires custom window-group commands that transfer sessions across `WorkspaceTabController` instances.
- **Per-tab kernel, `WKWebView`, toolbar, and inspector lifetime:** In-window `ZStack` keeps extra `TabPagePane` web views and `TerminalWindow` shells alive while switching tabs (server kernels stay running on the server). However, `ContentView`'s `NotebookToolbar`, `Inspector`, `BottomPanel`, and `@FocusedSceneValue` still bind to the primary `PageModel`/`PageDocument` rather than dynamically rebinding to whichever in-window tab is active.
- **`⌘W`, `⌘T`, and tab switching (`⌃Tab`, `Window > Select Next/Previous Tab`):** `WorkspaceTabs.close` (`⌘W`) routes through `WorkspaceTabs.CustomTabActions` to close the active extra tab (with unsaved-edit confirmation for dirty extra pages) and falls back to `NSWindow.performClose` on Tab 0 / single-tab windows. `WorkspaceTabs.open` (`⌘T` with `alone == false`) opens a new in-window tab on the key window (`⌘⌥N` still opens a separate window). AppKit's `Window > Select Next/Previous Tab` (`⌃Tab` / `⌃⇧Tab`) and `Show All Tabs` are disabled without an `NSWindowTabGroup` and need explicit menu commands in `GanymedeApp` before graduation.

### 4. Follow-ups to graduate out of spike

- #904 — Unify per-tab `PageModel`, `NotebookToolbar`, `Inspector`, `BottomPanel`, and `@FocusedSceneValue` bindings across all in-window tabs.
- #905 — Window-tab parity (drag-tab-out/cross-window docking, `Merge All Windows`, `Move Tab to New Window`, `⌃Tab`/`⌘1`–`⌘9`, relaunch restoration, and titlebar placement).

### 5. Verification

Verified with `npm run check`, `npm test` (118 files, 1,926 tests), `xcodebuild test` for `Ganymede` (macOS, 819 tests including 8 in `TabStripTests` and 13 in `WorkspaceTabsTests`), `apple/scripts/check-app-bundle.sh`, and `Ganymede-iOS` builds.
