## 2026-11-21, iPad sidebar on FileSource (#757)

- `IPadSidebar` and `IPadFolderContents` read and change files through a `FileSource`, as the Mac's sidebar does since #739. Nothing in them uses `FileManager`. Not routed to machines yet (#758).
- `LocalFileSource(root:)` gives server paths relative to the root (`FolderEntry.serverPath(_:root:)`), "" for the root itself; the Mac's source has no root and keeps `/`.
- The iPad deletes for good, as its alert says ("This can't be undone"). `LocalFileSource(deletesForGood: true)` does that with `removeItem`, where the Mac's source trashes. The sidebar's default source, `LocalFileSource.notebookFolder(_:)`, sets both.
- New folder, rename, duplicate and delete run one at a time (a `busy` flag); while one runs, the menu items that change files are disabled, as on the Mac. Each lists again after, and a failure shows in the same alert.
- The listing is an async `.task(id:)`, cancelled by a newer folder or refresh; a cancelled listing changes nothing.
- After a rename or delete the open-notebook handling (`file-moved`, `open`, `close`) reads the page's path once the operation returned, not when it started.
- Tests: `LocalFileSourceTests` cover rooted server paths (root, inside, outside, sibling sharing a prefix) deleting for good, and `notebookFolder(_:)`.
- By hand: #273, section "Sidebar on FileSource (#757)".
