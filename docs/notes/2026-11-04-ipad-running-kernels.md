## 2026-11-04, Running kernels in the iPad sidebar (#208)

The iPad's native sidebar (#237) gets what #235 gave the Mac's: a Running
section from `PageState.running`, a green dot on notebooks whose kernel is
running, and Shut Down Other Kernels in the ⋯ menu and the Kernel menu.

- Rows in the Running section shut their kernel down from a swipe action
  as well as a long-press menu; swipe is what iOS lists use for the
  destructive action on a row.
- The dot compares `FolderEntry.serverPath(_:root:)` with the session's
  path. Both are relative to the iPad's notebook folder, which is the
  server's root there.
- Opening a notebook from the Running section hides the sidebar in
  portrait, as opening one from the tree does.
