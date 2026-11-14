## 2026-11-14, File menu save group on the last WindowGroup (#622)

On the Mac, the File menu lost Save, Rename, Download Notebook, Export
As and Publish as Web Page: it ended in the system's Close and Close All
(Close Window when tabbed). The app replaced the `.saveItem` group in the
first (notebook) WindowGroup's `.commands`. On macOS 27.2, with more than
one WindowGroup, SwiftUI takes that group from the last WindowGroup, and
the Editor one had no commands, so the system default won. A repro app
with one WindowGroup showed every item; adding a second brought the bug
back. Even `after: .saveItem` or one plain Button was dropped, while the
other groups (New, Cell, Kernel, Help) showed.

The group now sits on the last WindowGroup (Editor). Checked on a Mac
build: the File menu ends in Close, Save, Rename…, Download Notebook…,
Export As and Publish as Web Page…, with no duplicate Close.

Lesson: when the File menu looks wrong, compare against Close/Close All,
the system's own save group; seeing those means the app's group was
dropped, not hidden.
