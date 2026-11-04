## 2026-11-04, Native sidebar, toolbar and key commands on the iPad (#208)

The iPad loads the page with `chrome=native`, as the Mac has since #222,
and draws the rest in SwiftUI (`IPadChrome.swift`). The iPhone is
unchanged until #209, so it is gated on the `.pad` idiom
(`drawsNativeChrome`), which is also what `AppModel.pageURL` checks.

- `NavigationSplitView` gives the sidebar for free: it hides in portrait,
  comes back with an edge swipe or the toolbar button, and resizes with
  Stage Manager.
- The iPad's server is rooted at the notebook folder, not `/`, so sidebar
  paths are relative to it (`FolderEntry.serverPath(_:root:)`). Both sides
  have symlinks resolved, since iOS can hand over `/var/…` and list
  `/private/var/…`.
- The sidebar is its own iOS view, not the Mac's `FolderSidebar`, which
  uses `NSAlert` and `NSWorkspace`. Rename uses an alert with a text field
  and Delete a confirmation dialog. iOS has no Trash for app folders, so
  Delete removes the file. The open notebook renames through the page's
  `rename` command (from #232), which saves first and keeps the kernel.
- The navigation bar has Run, Run All and Interrupt; everything else is in
  a ⋯ menu, so the bar fits in portrait. The app's own Terminal, Remotes
  and Open Folder buttons stay beside it.
- `.commands` puts New Notebook, Save, Cell and Kernel items in the ⌘
  overlay and the iPadOS menu bar. They find the page through
  `focusedSceneObject`, as on the Mac.
- With the page's toolbar hidden, the kernel and its state (Idle,
  Stopped, not installed) go under the title in the navigation bar's
  principal item, as the Mac shows them in the window subtitle;
  `navigationSubtitle` is macOS only.
- In portrait the sidebar is an overlay, and plain buttons don't close
  it, so opening a notebook from it sets the split view to detail only.
- Keys the page handles itself (⇧↩, A, B) are not key equivalents, as on
  the Mac, so Run and Insert show in the menu bar but not the ⌘ overlay.
  `SidebarCommands` gives Show/Hide Sidebar.
- Not yet: a Running section (it needs `PageState.running` from #235), and
  a check on a real iPad.
