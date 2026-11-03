## 2026-11-03, sidebar file actions (#203)

- Each sidebar row has a file menu: Rename (in place), Duplicate (not
  folders: the Jupyter contents API copies files only), Delete… (asks
  first), New Notebook and New Folder (in the folder itself, or beside a
  file). It opens from a "…" button (on hover and on the selected row;
  always, and 36px wide, on touch), a right-click, or a long press.
- Long press: WebKit on iOS sends no `contextmenu` for a held touch, so
  the row times a touch `pointerdown` (500 ms, cancelled by 10px of
  movement) and swallows the click that ends it. Chromium does send
  `contextmenu` after a long touch; the row ignores that one so only one
  menu opens. `-webkit-touch-callout: none` keeps iOS's own callout away.
- A file that can't be opened was a disabled button, which takes no
  pointer events; it is `aria-disabled` now, so its menu still works.
- `src/lib/file-actions.ts` holds the logic. The open notebook renames
  through its controller (#202), so it saves first and its kernel
  follows. Moving a folder that holds the open notebook saves it first,
  moves the folder, then calls the controller's new `moved(next)` before
  reopening it there. `moved` is the tail of a rename: stop saving to the
  old path, save edits typed during the move to the new one, and
  `setPath`/`setName` the session. Without that last step the reopened
  pane found no session at the new path and the next run started a fresh
  kernel, orphaning the old one with its state (review catch). The move is
  refused while the notebook is still loading (no controller yet).
- Deleting the open notebook (or its folder) calls the controller's new
  `discard()` before the delete: closing saves unsaved edits, which would
  write the deleted file back. `discard()` returns an undo, so a failed
  delete leaves the notebook open with its edits and saving on. A save
  after a move or delete is refused for the same reason.
- A long press whose click never reached the row (the menu opened under
  the finger) left a flag that swallowed the next mouse click; any new
  `pointerdown` now clears it. The menu takes arrow keys, Home and End,
  and gives focus back to its opener when dismissed.
- Copies are named by the backend: `Io-Copy1.ipynb` on a Jupyter server,
  `Io (copy).ipynb` in JupyterLite; the e2e test accepts either.
- `ContextMenu.tsx` is a general popup menu (a point or an anchor
  element). The cell menu of #200 has its own copy of the same styles;
  whichever of the two merges second should switch to this one.
