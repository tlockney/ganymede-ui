## 2026-11-03, Native sidebar, toolbar and menus in the Mac app (#207)

The Mac app loads the page with `chrome=native` (#205) and draws the rest
in SwiftUI: a `NavigationSplitView` with the window's folder as the
sidebar, a customizable toolbar, and Cell and Kernel menus.

- The sidebar reads the folder with `FileManager`, not the contents API:
  the Mac server is rooted at `/` on the same machine, so a file's server
  path is its absolute path without the leading slash
  (`FolderEntry.serverPath`). Subfolders list their items when expanded.
- Every control reads `PageModel.state`, which the page posts, and runs
  a page command. Menus find the front window's model through
  `focusedSceneObject`, as Save already did with `PageDocument`.
- Menu key equivalents are only ⌘ combinations the page doesn't use
  (Run All ⇧⌘↩, Interrupt ⌘., New Notebook ⌘N). A key equivalent fires
  when the web view doesn't handle the key, so binding ⇧↩ or a command
  mode letter would also fire while typing in an input the notebook
  doesn't own.
- File › New (⌘N) used to open a window; it now makes a notebook, and
  New Window moves to ⌥⌘N.
- Settings stays as it was (Remotes in ⌘,, Agent Settings ⌥⌘,); merging
  them is the rest of #206.
