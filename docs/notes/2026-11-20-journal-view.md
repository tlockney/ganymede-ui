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
  notebook. The person's choice then holds for the file for the rest of the
  session, across reopens (Reload, a restarted server): the default applies
  only on the first open of a path. No Settings switch, as asked; a page command `toggle-journal`, a palette
  entry (named for where it goes) and a toolbar button.
- **Provenance**: from `agent.mode` (`executed`, `recorded`, `note`);
  agent metadata with another mode is "Agent"; none is "Person". Count is
  shown only for `executed`.
- **History**: "rev N" is `history.length + 1`; entries without a string
  `source` are skipped.
- **Header** (the issue's first element): `journalHeader` gives the title
  (`metadata.title`, else the file name), kernel, who started it and the
  earliest agent `at`, and the cell count; it follows `metadataChanged`.
- **View choice** is keyed by server (`recentsKey`) and path, and moves with
  a rename or folder move (the pane's rename, the native `file-moved`, the
  sidebar's file actions) and is dropped on a delete.
- **Change detection** reads only the cells a transaction touched
  (`changedParentTypes` of each cell's Y.Map), not every cell's JSON.
- **Requests** count only a person's cell (no agent metadata), as the
  server's `by.person` check does.
- **The notebook goes quiet**: the hidden notebook's run, insert, cell-type,
  clear-outputs, language-service and notebook commands do nothing while the
  journal shows (the controller ignores them; the toolbar and palette list
  them as disabled), and focus leaves the hidden cells when the journal
  shows, so command-mode keys can't edit them. Run with Parameters stays
  on: it runs a copy on the server and doesn't touch the open cells.
- **Rendering** goes through the notebook's rendermime (sanitizer, output
  frames, table output), one renderer per output, not `OutputArea`:
  `@jupyterlab/outputarea` isn't a dependency and no dependency was added.
  Trust is the cell model's, so untrusted HTML is sanitized, as in the
  notebook. Markdown is always rendered untrusted, and gets the cell's
  attachments through a small resolver (`attachment:` to a data URL, PNG,
  JPEG, GIF and WebP only). A renderer that fails shows the raw text in its
  own node. Cells are memoized and trust is read once per update. Code is
  plain text when unfolded, not highlighted.
- **Following**: the view follows until a scroll event leaves the bottom
  (48 px of slack); a `ResizeObserver` keeps the end in view while
  following, for outputs that render late. Adding a note or request
  resumes following.
- **Status**: names are the awareness states (this client "You"; "Only you
  are here" when there are no others). The server doesn't publish an agent
  in awareness yet, so an MCP agent is not listed until the open-rooms
  endpoint or presence exists; "changed N ago" starts at the latest
  `agent.at` and then follows the transactions that came from elsewhere (a
  change made on this page doesn't count). "name is running cell N" reads each code cell's
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
  shows for `@agent` and for `@<name>` of an agent that wrote cells in the
  notebook (`agent.by`, or its first part), where the server uses the
  connected client's name; it is "answered" only when
  `metadata.ganymede.request` is done with this cell's own `id`, as the
  server's `is_answered` reads it.

Tests: `journal.test.ts` (pure logic), `JournalView.test.tsx` (labels,
fold, rev chip, composer, status, running, reconnecting, follow),
`room.test.ts` (`live`), `NotebookPane.test.tsx` (default view and
switching), palette, toolbar and App tests, and
`e2e/journal.spec.ts` against a real server.

Not done: the Mac app's native menu item and `PageState` field for the
view (Swift can't be built here) and syntax highlighting. Export is the
existing Publish as Web Page (#563), not a new feature. Follow-ups:
ganymede-ui#702; tlockney/ganymede#898 (the clean-kernel stamp, which needs
ganymede metadata first); tlockney/ganymede#896 (running marks, so Ganymede's
own runs set "running").
