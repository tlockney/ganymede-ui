## 2026-11-13, Run with Parameters (#592)

Third of the features Thomas picked for the apps (#582): the run
contract (`ganymede execute -p --results`) from the apps, over
Ganymede's `POST /api/notebooks/run` (since 0.8.0; `save: "copy"` since 0.10.0).

- `src/lib/run.ts` posts `{path, params}` (and `save: "copy"`), and
  turns the answer into `{status, results, error?, copy?}`. A route the
  server doesn't have (jupyter_server's bare "Not Found", a non-JSON
  404/405, or an answer without `status`) reads "It needs Ganymede 0.8 or later."
- `RunSheet` takes the parameters as JSON, starting from
  the parameters the sheet last ran that notebook with in this page, or
  else `metadata.ganymede.params` (only `ganymede execute` records
  those; the server's run records them on its copy, not the file), refuses
  anything but an object before running, and lists the named results.
  The run has no time limit of its own here (the server's is an hour),
  so the sheet can always be stopped: Stop and Esc abort the request,
  and the server shuts the run's kernel down when the client goes away.
  Closing the notebook, or opening another, closes the sheet, which
  aborts it too. A rename doesn't: the sheet and its remembered
  parameters follow the new name.
- The server reads the notebook from its room, so unsaved edits run
  without a save while the pane is joined to the room; a pane that fell
  back to the contents API runs the saved file. Nothing in the window
  changes.
- The run copy's path is shown, not opened: the Mac app opens notebooks
  as documents, and the page's `open` command would bypass that.
- Gated on a Ganymede server that runs the kernels (`runAvailable`): not
  on a connection with `kernels: page` or `both`, where the notebook's
  kernel may be one in the page the server can't start. The page tells
  the Apple apps' menus through `PageState.runParams`.
- Ganymede 0.8 and 0.9 run but refuse `save` ("save must be false"); with
  the box checked the sheet says saving needs 0.10 or later.
  Page command `run-with-params`: Command Palette, the toolbar's More
  menu (the run group's overflow, in a narrow window), Mac Cell menu, iPad Cell and ⋯ menus.
