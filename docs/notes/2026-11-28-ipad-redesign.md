## 2026-11-28, iPad visual redesign (#914)

Brought the chosen visual direction (`E-Touch.png` and `E-Touch2.png` left,
Step 7b of #844) to the iPad app while keeping every existing action,
keyboard shortcut, and accessibility description intact.

### What changed

- **Pure layout and tab-folding model** (`apple/Sources/Ganymede/Touch/IPadLayout.swift`):
  Added cross-platform Split View rules (`< 600pt` threshold), kernel chip
  display states, display title formatting (`WindowTarget.displayName`),
  accessible sidebar/outline contrast tokens (`IPadPalette`), and
  single-WebView touch tab building and narrow-width folding (`+N tabs ⌄`).
- **iPad sidebar chrome** (`apple/Sources/Ganymede/Touch/IPadSidebarChrome.swift`, `IPadChrome.swift`):
  Tinted the iPad split-column sidebar with `SidebarTint` (navy glass in
  dark, warm cream in light), added the Ganymede mark + wordmark header and
  a `>= 44pt` capsule navigator keeping all iPad tabs and `⌘1`–`⌘6`
  shortcuts, replaced accent row washes with a quiet neutral highlight,
  migrated scattered `.secondary` captions to shared `SidebarCaption()`
  (>= 4.5:1 contrast in light and dark, finishing #878 on iPad), and pinned
  the live **IN THIS JOURNAL** / **IN THIS NOTEBOOK** outline card at the
  sidebar's foot highlighting `PageState.currentHeadingIndex` in accessible
  orange with tap-to-jump (`go-to-cell`).
- **iPad toolbar & Split View** (`apple/Sources/Ganymede/Touch/IPadToolbar.swift`, `ContentView.swift`):
  Unified the notebook navigation bar with `WindowBackground` and
  `TitleText`, added the kernel chip (`dot · language · runs on`) and
  orange **Run** capsule group (`AccentFill` + `OnAccent` with Run menu and
  Interrupt), preserved all workspace actions (Terminals, Terminal Panel,
  Fill the Screen, Open Folder, Settings, `⌘,`) in **⋯**, and added
  `< 600pt` Split View adaptation where the sidebar yields first, the
  kernel chip shrinks to its status dot with Run inside its menu and full
  VoiceOver labels, and `Notebook | Journal` stays visible.
- **iPad touch tab strip** (`apple/Sources/Ganymede/Touch/IPadTabStrip.swift`):
  Added the compact touch strip above the notebook showing the page-joined
  active tab (1.5pt orange/blue/neutral top edge), quieter recent notebook
  chips, and outlined machine capsules, folding extra tabs into `+N tabs ⌄`
  below `600pt`.
- **Tests and docs** (`apple/Tests/GanymedeTests/IPadChromeTests.swift`,
  `docs/apps.md`): Added cross-platform unit tests to both `GanymedeTests`
  and `GanymedeTests-iOS`, and updated the iPad section of
  [docs/apps.md](../apps.md) with an `**Unreleased.**` note.
