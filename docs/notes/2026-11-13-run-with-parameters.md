## 2026-11-13, Run with Parameters (#592)

Third of the features Thomas picked for the apps (#582): the run
contract (`ganymede execute -p --results`) from the apps, over
Ganymede's `POST /api/notebooks/run` (released in 0.10.0).

- `src/lib/run.ts` posts `{path, params}` (and `save: "copy"`), and
  turns the answer into `{status, results, error?, copy?}`. A route the
  server doesn't have (jupyter_server's bare "Not Found", a non-JSON
  404/405, or an answer without `status`) reads "It needs Ganymede."
- `RunSheet` takes the parameters as JSON, starting from
  `metadata.ganymede.params` (what the notebook last ran with), refuses
  anything but an object before running, and lists the named results.
  The run has no time limit of its own here (the server's is an hour),
  so the sheet can always be stopped: Stop and Esc abort the request,
  and the server shuts the run's kernel down when the client goes away.
  Unmounting (the notebook closed) aborts it too.
- The server reads the notebook from its room, so unsaved edits run
  without a save, and nothing in the window changes.
- The run copy's path is shown, not opened: the Mac app opens notebooks
  as documents, and the page's `open` command would bypass that.
- Gated on a server connection (`PageState.publish`), like the exports.
  Page command `run-with-params`: Command Palette, the toolbar's run
  menu, Mac Cell menu, iPad Cell and ⋯ menus.
