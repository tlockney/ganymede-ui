## 2026-11-13, Collapsing code cells (#564)

Thomas asked for a way to collapse code cells. JupyterLab already does
it: a click on the input collapser (the thin bar at a cell's left)
sets `cell.inputHidden`, shows the first line of the code in an
`InputPlaceholder`, and saves `metadata.jupyter.source_hidden`. Our bar
is 6px wide and drawn over by the active-cell marker, so nobody would
find it, and a finger can't hit it.

- `src/lib/code-collapse.ts` adds a chevron button to each code cell's
  prompt column, the way `cell-controls.ts` adds its controls. CSS shows
  it on hover (only where the pointer hovers), on the active cell, and
  always while collapsed (`:has(.jp-InputPlaceholder)`), pointing right.
  Its label and `aria-expanded` follow the cell's metadata, so an undo,
  another window or the agent changing `source_hidden` updates it.
- At 760px and under JupyterLab stacks the prompt over the editor; the
  button starts the prompt's row and the prompt moves over for it.
- Commands `collapse-code`, `expand-code`, `collapse-all-code` and
  `expand-all-code` (JupyterLab's `NotebookActions.hideCode` and the rest)
  are in the shortcuts table, so they get keys (⌘⌥[ and ⌘⌥], with ⇧ for
  every cell: Fold and Unfold in VS Code and Xcode), palette entries, and
  the apps' menus. Command mode only: in edit mode CodeMirror has its own
  fold keys, and a collapsed cell has no editor.
- The cell's … menu (touch) has Collapse Code / Expand Code. The Mac's
  Cell menu has all four, without key equivalents (a menu key would fire
  while typing); the iPad's has the two "All" ones.

Not checked by hand on a Mac or iPad yet: ganymede-ui#399 and #273.
