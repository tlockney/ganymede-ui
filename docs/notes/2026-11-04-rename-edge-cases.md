## 2026-11-04, rename edge cases (#224)

Loose ends from the reviews of #221 (rename from the title) and #223
(sidebar file actions), which share the notebook's `moved()` path.

- **Handing off to the reopened pane.** A rename remounts the pane at the
  new path (`key` in App), so anything the old pane knew was lost.
  `src/lib/rename.ts` now keeps a hand-off per path: the outgoing pane
  registers its teardown save there (under the saver's path, so the new
  one after a move) and the pane that opens the file next waits for it
  before loading, then shows why it failed, if it did. React runs the old
  pane's effect cleanup before the new pane's effect in the same commit,
  so the hand-off is there when the new pane looks. It stays until the
  save is done rather than being taken, because StrictMode runs the new
  pane's effect twice and the second run has to wait too. Two review findings
  close with it:
  - The edits typed during the rename's final save were written by the
    teardown save while the new pane was already loading, so the new
    pane could miss them and its next autosave hit a `SaveConflict`. The
    new pane now loads after that save. Keeping `renaming` set through
    `onRenamed` (the other suggestion) would only have delayed the old
    pane's save, not the new pane's load.
  - A failed save of edits typed during the rename was only logged. The
    teardown tries it again (the model is still dirty), and if that fails
    too the reopened pane shows `Couldn’t save the latest edits to …`.
- The session to move is read after `saver.move` resolves, not before,
  so a kernel the first run started while the rename request was in
  flight moves too. A kernel whose start is still in flight when the move
  ends is not covered.
- A failed sidebar rename of the open notebook showed only the pane's
  notice, which on a phone sits under the floating sidebar. The
  controller's `rename(input, { throws: true })` also rejects with the
  reason, so the sidebar's alert shows it. Callers that pass nothing (the
  title) get `false` as before.
- Renaming a notebook that isn't open, or a folder, moves the sessions of
  the notebooks in it (`moveSessions`), found by path in
  `sessions.running()`: each is connected to, given its new path and
  name, and let go (`dispose` closes the connection, not the kernel). The
  open notebook's session still moves through its pane. A session that
  can't be moved is logged; the rename has already happened.
- A test pins the delete's `setOpenPath` updater: a notebook opened while
  the delete ran stays open.
- The cell menu (#200) is the shared `ContextMenu` now, which gained
  checkable items (`menuitemradio`, with a check column) and headings for
  its Cell Type section. The `.cell-menu` styles are gone. It sizes for
  touch on a coarse pointer, as the sidebar's menu does, and takes the
  arrow keys, Home and End.
