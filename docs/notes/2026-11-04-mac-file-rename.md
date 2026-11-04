## 2026-11-04, File › Rename in the Mac app (#206)

The Mac app's File menu has Rename…, and renaming the open notebook from
the sidebar goes through the page instead of the disk.

- A `rename` page command calls `NotebookController.rename` (#221), the
  same rename as the page's title. It saves unsaved edits first, moves
  the kernel session with the file, and shows the page's notice when it
  fails, so the app needs no error handling of its own.
- The name is asked for without `.ipynb`, as the title shows it. The
  page adds the extension; a name typed with it is kept as is.
- The sidebar still renames folders, and files other than the open
  notebook, on the disk. A folder that holds the open notebook still
  refuses while it has unsaved edits and reopens the notebook at its new
  path, which starts a new kernel. Moving a session under a renamed
  folder is left for later.
