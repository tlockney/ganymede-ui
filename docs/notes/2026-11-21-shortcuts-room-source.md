## 2026-11-21, Shortcuts run cells from the room's source (#653)

ganymede#843 (PR #848, in every Ganymede release since v0.12.0; the app's
`GANYMEDE_REF` is v0.14.0) lets `POST /api/kernels/{id}/execute` name cells
without a `source_hash`: `{"cell_id"}`, `{"tag"}`, or `"cells": "all"`. The
room resolves them against its own current source. `NotebookActions` (Run
Notebook, Run Cell, App Intents, `ganymede://run`) used to read the saved
file, which lags the room by about a second, hash those sources, and refuse
a notebook of nbformat 4.4 (`noCellIDs`), so a run could miss unsaved edits
and cells.

- `cellRun` sends `[{"cell_id": cell}]`. On `400` with `"error":
"cell_not_found"` it sends `[{"tag": cell}]`, and when that is not found
  either, throws `noCell`. An id that names a markdown or raw cell is
  answered `400 Cell "x" is not a code cell` (no `error` key,
  execute.rs in v0.14.0), which maps to `noCell` without trying the tag: what the
  app did before, but matched on the server's message.
- `notebookRunAll` restarts as before, then sends `"cells": "all"` (code
  cells with non-blank source). A notebook with none answers
  `finished: true` with no cells, so it still returns `[]`.
- Both read the notebook with `requireIDs: false`, only for the kernelspec,
  so a 4.4 notebook runs by the ids its room gave. `noCellIDs` stays for
  Get Notebook Outputs and for the fallback.
- A server before ganymede#843 (v0.11.0, execute.rs: `source_hash is
required for cell …`; for `"all"`, `cells must be a non-empty list of
{cell_id, source_hash}`; for a tag entry, `Each cell entry must have a
cell_id string, got …`, all `400`) is detected from those messages
  (`NotebookActions.needsSourceHash`). The run then takes the old path
  unchanged: read the file, select, hash, retry once on `source_mismatch`,
  `noCellIDs` for 4.4. The restart is not repeated. The retry exists only
  there, since a hashless request cannot be stale.
- Every execute request still carries `by`.

Tests (`NotebookActionsTests`, with its fake server): no `source_hash` key
for Run Cell, tag fallback, `noCell` for both missing and for a markdown
cell, `"all"` after the restart, an empty notebook, a 4.4 notebook running,
the old server's id and `"all"` refusals falling back to hashed requests
(the tag-entry refusal is matched but an old server never reaches it), and the stale
retry moved to that path. The docs (apps.md, Shortcuts) carry the
Unreleased note.

Checks: `npm run check`, `npm test`, `npm run build`. Swift can't build in
the container; CI's macos-app job is the first compile.
