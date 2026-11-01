## 2026-11-01, Cell type picker and command mode in the shortcuts sheet (#158)

Markdown cells worked, but nothing on screen said so: the only ways in
were the "Insert Text Cell" button and M in command mode, and the
shortcuts sheet didn't say what command mode is or that Esc gets you
there. Thomas read that as no Markdown support.

- The toolbar has a Code / Markdown / Raw picker for the active cell, as
  JupyterLab's notebook toolbar does. It changes the selected cells with
  `NotebookActions.changeCellType`, then calls `notebook.activate()` so the
  keyboard goes back to the notebook.
- The pane follows `activeCellChanged` for the type. Changing a type
  replaces the cell's widget and fires it, so one signal covers both.
  The type is read from the model by `activeCellIndex`, not
  `notebook.activeCell`: the pane test's stand-in notebook has no cells,
  and giving it an `activeCell` sends `NotebookActions.runAll` down paths
  the stand-in can't take.
- The shortcuts sheet has a line under Command mode and Edit mode saying
  how to get into each. The Esc binding's label says "Leave the cell".
- Both selects have an `aria-label`, so tests (and VoiceOver) can tell the
  kernel picker from the cell type picker.
