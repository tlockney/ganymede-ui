## 2026-11-25, Journal reading and live-follow layouts (#816)

The journal always opened scrolled to the end, as if it were being
followed, even a finished one: reading started at the last cell. Now it
opens where reading makes sense, and following is for live work.

**Opening.** `initialFollow` in `src/lib/journal.ts` decides once per mount,
in this order: the cell the reader switched from in the notebook
(`startAt`); the end, following, when the journal is active (a cell
running, or an agent in the room per `agentsAt`); the reader's saved
position, when its cell is still there; the start. Paused openings count "new" cells
from the cell count then (the saved count, clamped; for the others, now).
If the rooms list arrives after mount with an agent, and the reader hasn't
touched anything, a journal that opened at the start or a saved place
follows (`followsLate`). "Touched" is a wheel, touch, pointer or key event
in the view; a scroll alone is not, since Chromium's scroll anchoring
scrolls when outputs above render. Until touched, the view puts the
opening's cell back whenever the content resizes, and sets
`overflow-anchor: none` on the scroll area (`data-anchored`).

**Positions.** `savePosition` keeps `{cell id, offset, cell count}` per
server and path in `localStorage` (`ganymede.journal.positions`, the newest
200). The view saves at most every 500 ms while scrolling, on `pagehide`
and when it unmounts. A failed read is no position; a failed write is not
reported (it is a convenience, and `savePosition` returns false). The
positions move or go with `moveChosenViews` in `App.tsx`
(`movePositions`).

**Mode switch.** Notebook to journal passes the active cell if it shows,
else the first cell whose bottom is below the notebook's top, as `startAt`.
Journal to notebook scrolls the journal's first visible cell to the
notebook's top and makes it active, after the notebook is laid out again.

**Follow live.** The button shows while paused, with new cells ("3 new ·
Follow live") or when the journal is active ("Follow live": a cell
running, an agent in the room, or another client adding, removing or
editing the cells; a change to the notebook's metadata, as a kernel
starting makes, does not count); a finished journal read from the start
has none.

**Phone composer.** Below `NARROW_QUERY`, two buttons until one is used;
the draft survives Cancel and Escape.

**Requests.** After the composer adds a request, `room.save()` runs and the
chip says saving, saved or not saved (a `failed` status or a rejection).
This is per mount: after a reload an open request shows `request`. The
agent sends no delivery acknowledgement, so there is none. An answered
request's chip (which pauses following) links to `metadata.ganymede.request.answer` (what the server
writes with `done`) when that cell is in the notebook.

**Tests.** `src/lib/journal.test.ts` has a case per opening, the store and
`requestAnswer`; `JournalView.test.tsx` the opening, follow button, phone
composer and request chips with a stubbed layout; `NotebookPane.test.tsx`
the notebook, journal, notebook round trip; `e2e/journal.spec.ts` the real
Fremont Bridge journal (`e2e/fixtures/journal/`): start, last position,
follow and pause with a second browser in the room, the mode switch, and
the phone. Each fails without the change.
