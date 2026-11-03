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
  then reopens it at the moved path. Deleting the open notebook (or its
  folder) calls the controller's new `discard()` before closing it:
  closing saves unsaved edits, which would write the deleted file back.
- Copies are named by the backend: `Io-Copy1.ipynb` on a Jupyter server,
  `Io (copy).ipynb` in JupyterLite; the e2e test accepts either.
- `ContextMenu.tsx` is a general popup menu (a point or an anchor
  element). The cell menu of #200 has its own copy of the same styles;
  whichever of the two merges second should switch to this one.
