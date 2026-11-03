## 2026-11-03, touch cell controls (#200)

- On an iPhone without a keyboard there was no way to add a Markdown cell
  or change, move or delete a cell: under 720px the toolbar hides Insert
  and Cell Type, and JupyterLab's cell toolbar hides itself on narrow
  cells. Each cell now has a "…" button (40×44px, in a right-hand gutter
  so it never covers code) that opens a menu: Run, Cell Type
  (Code/Markdown/Raw), Move Up/Down, Duplicate, Delete. An add-cell bar
  (+ Code, + Text) follows each cell.
- The controls are plain DOM that `src/lib/cell-controls.ts` adds to each
  cell's node, synced on `model.cells.changed` (and once more after a
  microtask: the notebook makes the new cell widgets in its own handler
  for that signal, which may run after ours). A cell builds its input and
  output areas when first attached, after our nodes, so the add-cell bar
  is moved back to the end on `cell.ready`.
- The notebook takes a mousedown in a cell to select, drag or focus;
  a capture-phase listener stops that for taps on the controls.
- CSS shows them on `(hover: none), (pointer: coarse), (max-width: 720px)`
  and hides JupyterLab's cell toolbar there, whose actions the menu has.
  A desktop window looks as before. The menu itself is React
  (`CellMenu.tsx`), placed under the button and kept inside the window.
- Menu actions first make their cell the only selected one, so Delete or
  Markdown never reaches a multi-cell selection the user can't see.
