## 2026-11-20, journal view (#184)

Step 5 of #697 (the design note's "journal view"), web layer only, so the
Mac, iPad and iPhone apps get it with the page. The Journals tab, the
machines and notifications are other steps.

What it is: `NotebookPane` has a `journal` flag. When on, it renders
`JournalView` over the notebook's own shared model (`room.notebook`, the
`YNotebook` the pane already holds), with the notebook's `.notebook-page`
kept mounted but `hidden`. So there is no second connection, "Open as
Notebook" is instant, and the kernel, saver and room go on as before.
Pure logic is in `src/lib/journal.ts` (provenance, fold summary, follow
state, status line, the cells the composer adds); the view is
`src/components/JournalView.tsx`.

Decisions:

- **Default view**: Journal when any cell has `metadata.ganymede.agent`,
  decided once when the file opens (`hasAgentCells`), not live, so the view
  doesn't flip when an agent writes its first cell into a person's
  notebook. The person's choice then holds until the file is reopened. No
  Settings switch, as asked; a page command `toggle-journal`, a palette
  entry (named for where it goes) and a toolbar button.
- **Provenance**: from `agent.mode` (`executed`, `recorded`, `note`);
  agent metadata with another mode is "Agent"; none is "Person". Count is
  shown only for `executed`.
- **History**: "rev N" is `history.length + 1`; entries without a string
  `source` are skipped.
- **Rendering** goes through the notebook's rendermime (sanitizer, output
  frames, table output), one renderer per output, not `OutputArea`:
  `@jupyterlab/outputarea` isn't a dependency and no dependency was added.
  Trust is the cell model's, so untrusted HTML is sanitized, as in the
  notebook. Markdown is always rendered untrusted. Code is plain text when
  unfolded, not highlighted.
- **Following**: the view follows until a scroll event leaves the bottom
  (48 px of slack); a `ResizeObserver` keeps the end in view while
  following, for outputs that render late. Adding a note or request
  resumes following.
- **Status**: names are the awareness states (this client "You"). The
  server doesn't publish an agent in awareness yet, so an MCP agent is
  not listed until the open-rooms endpoint or presence exists; "changed N
  ago" starts at the latest `agent.at` and then follows the document's
  transactions seen here. "name is running cell N" reads each code cell's
  `executionState` (set by JupyterLab clients). Ganymede's server does not
  set it when an agent runs a cell, so today the line shows for runs from
  another JupyterLab window only; a follow-up in ganymede.
- **Connection**: `NotebookRoom.live` (socket up and synced since) and
  `watchLive`. The journal shows "Reconnecting…" and disables the composer
  while it is false, including after the server closed the room for good.
  The notebook view itself isn't made read-only yet (#697's wider
  decision).
- **Requests**: `@agent <text>`, a Markdown cell added through the shared
  model, as docs/live-agent-edits.md describes; text that already starts
  with `@agent` isn't prefixed twice. The server counts it as a request
  only because it arrives over the room from a client. The chip "request"
  shows only for `@agent`, not for `@claude`.

Tests: `journal.test.ts` (pure logic), `JournalView.test.tsx` (labels,
fold, rev chip, composer, status, running, reconnecting, follow),
`room.test.ts` (`live`), `NotebookPane.test.tsx` (default view and
switching), palette, toolbar and App tests, and
`e2e/journal.spec.ts` against a real server.

Not done: the Mac app's native menu item and `PageState` field for the
view (Swift can't be built here), syntax highlighting, the clean-run stamp
and static export from the issue's first text (published pages exist, #563;
the stamp needs ganymede metadata first).
