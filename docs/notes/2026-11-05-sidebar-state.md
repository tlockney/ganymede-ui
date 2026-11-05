## 2026-11-05, Mac sidebar state per window (#207)

#222 left two items of #207. The running-kernel dot on notebook rows had
since landed. This adds the other: the sidebar's state is restored per
window.

- Whether the sidebar shows is `@SceneStorage("sidebar.shown")`, bound to
  the `NavigationSplitView`'s column visibility. The navigator tab was
  already scene storage (#246).
- Expanded folders are `@SceneStorage("files.expanded")`, one path per
  line, sorted. Each `DisclosureGroup` binds to whether its path is in
  the set. Before this, a folder collapsed whenever another navigator tab
  showed, because the Files view left the tree and its
  `DisclosureGroup`s lost their own state.
- Scene storage takes strings, not sets, so the set is stored as text.
  `FolderEntry.expandedPaths` reads and writes it, and has a test.
