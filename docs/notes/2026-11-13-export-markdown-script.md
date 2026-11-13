## 2026-11-13, Export as Markdown or Script (#590)

Second of the CLI and server features Thomas picked for the apps (#582).
The server already answers JupyterLab's Save and Export Notebook As
route, `GET /nbconvert/{format}/{path}?download=true`, so this is UI
only.

- `src/lib/export.ts` fetches the export through `makeRequest` (the
  connection's token and settings), with the publish request's
  two-minute timeout, and names the file from `Content-Disposition`:
  Ganymede sends `filename*=utf-8''…`, jupyter_server `filename="…"`.
  Only the last path segment is kept. Markdown with images comes back
  as a zip; `downloadFile` now takes a blob as well as text.
- The pane's save-first step is shared with publishing
  (`saveForServer`): refuse while locked (and show the lock notice
  again), save unsaved edits with the same time limit. An export's
  failure shows as the pane's notice with Retry.
- Gated like publishing on a server connection (`PageState.publish`),
  since the in-browser server has no exporter. Unlike publishing it
  also works against a Jupyter server: the export replaces nothing in
  either case, the same as Download Notebook.
- Page command `export` with `markdown` or `script`: Command Palette,
  the toolbar's More menu beside Download, Mac File › Export As, iPad
  and iPhone ⋯ › Export As.
