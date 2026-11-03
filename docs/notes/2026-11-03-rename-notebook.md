## 2026-11-03, rename a notebook from its title (#202)

- The toolbar's title is a button now (`NotebookTitle.tsx`); a click or
  tap edits it in place. Enter or leaving the field renames, Escape
  cancels. After a failed Enter the field stays open with the pane's
  notice saying why; after a failed blur it closes, so a bad name can't
  trap the focus.
- The field goes read-only, not disabled, while the rename runs: Chrome
  blurs a disabled field late, after the rename has failed, which then
  ran a second rename and closed the field.
- `src/lib/rename.ts` checks the name (no `/`, `\` or leading `.`, adds
  `.ipynb`) and refuses to replace a file that exists, with a message;
  the contents API would otherwise answer 409 or, on some backends,
  overwrite. A change of case alone skips the check: on a Mac's disk
  `io.ipynb` finds `Io.ipynb`.
- Unsaved edits are saved first, then `contents.rename`, then the
  kernel's session follows (`setPath`/`setName`), so the pane reopened at
  the new path (its key is the path) rejoins the same kernel.
- The rename runs inside the saver's queue (`NotebookSaver.move`), which
  then points the saver at the new path. Any save made meanwhile (⌘S,
  autosave, the Mac app's save on quit) waits and goes to the new file;
  saving to the old path mid-rename would recreate it, since the saver
  treats a missing file as one to write.
- The rename waits for the session to join the file's kernel before it
  moves it, and the pane's teardown waits for the rename: leaving for
  another notebook mid-rename used to dispose the session first, which
  left the kernel at the old path. `onRenamed(from, to)` switches the
  open notebook only if it is still `from`.
- The sidebar follows through `fileChanged`, the window title and
  `?open=` through `openPath`, and the Mac window's proxy icon through
  `postDocument`.
- Review follow-ups: edits typed while the rename runs are saved to the
  new path before the pane reopens there. A case-only rename goes ahead
  only when the new name finds this same file (same `created` and
  `last_modified`); in the browser's case-sensitive storage it can be
  another file, and JupyterLite's `rename` would replace it. Only a 404
  (or JupyterLite's "Could not find") counts as nothing there. The field
  stops only Enter and Escape, so ⌘S still saves.
- Review catch after merging main: an inline `onRenamed` in App plus
  `onRenamed` in the pane's controller-effect deps looped (the effect sets
  App's controller state, App renders a new function, the effect runs
  again), pegging the main thread while idle. App.test mocks the pane, so
  nothing caught it. The pane now keeps `onRenamed` in a ref, App passes a
  `useCallback`, and a pane test renders it under a stateful parent.
- `NotebookSaver.move` also takes the renamed file's `last_modified`, for
  backends whose rename bumps it (else the next save is a conflict).
