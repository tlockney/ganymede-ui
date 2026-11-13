## 2026-11-13, Clear All Outputs (#588)

First of the CLI features Thomas picked for the apps (#582). The CLI's
`ganymede nb clear` removes a notebook file's outputs, execution counts
and timings; the apps had no way to do that to an open notebook.

- `clearOutputs()` on the notebook controller clears every code cell's
  outputs, execution count and `execution` timings through the model
  (`clearExecution`), as JupyterLab's
  `NotebookActions.clearAllOutputs` does but without needing an active
  cell (that action does nothing before the user clicks a cell). Like
  JupyterLab's, it isn't an undo step. The notebook becomes unsaved.
- Page command `clear-outputs`: Command Palette (Cell), the web
  toolbar's run menu, the Mac Cell menu, the iPad Cell menu and ⋯ menu.
- Tests: controller (outputs and count cleared, model dirty), page
  command, palette, toolbar menu.
