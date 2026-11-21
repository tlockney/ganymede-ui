## 2026-11-21, Journal composer hint covers notes and the next reader (#726)

With no agent in the room, the journal composer's hint said "A request is
saved in the notebook". Add Note saves a plain note too, and the hint didn't
say the text waits for the next agent that reads the notebook.

- `composerHint` now says: "No agent is in the room. Notes and requests are
  saved in the notebook for the next agent that reads it; an agent watching
  this folder is told of a request while the notebook stays open." Its doc comment and
  the Writing paragraph in `docs/apps.md` say notes and requests too.

`mcp watch` reports only `@agent` requests, so the hint and the docs keep
"told" to requests; a plain note waits for the next agent that reads it.

Tests: `composerHint([])` asserts the whole string, not only its start.

Checks: `npm run check`, `npm test`, `npm run build`.
