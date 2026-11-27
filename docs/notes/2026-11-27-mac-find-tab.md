## 2026-11-27, Mac Find tab (#879)

The Mac's sidebar had Search and Outline as two tabs, and neither
searched the notebook the window had open: Search looked through the
folder's files, and Outline only listed headings. The Mac now has one
Find tab in their place, as Xcode's navigators do; the iPad keeps Search
and Outline for now. Step 4b of the Mac redesign (#844).

- `find-in-notebook` takes a trimmed query and the page answers in
  `PageState.notebookFind` (`src/lib/notebook-find.ts`): each match a
  cell, the heading at or above it and its matching line, fifty at most
  and how many more matched. Every cell's source is searched, code as
  well as Markdown, because code holds the names people look for. The
  snippet is the line around the match, not the cell's first line, so
  the result reads as the place it goes to. It finds that line's match
  with a case-insensitive pattern on the original text, so a query whose
  lower case is longer or shorter than itself ('İ' folds to two
  characters) still shows its line; a match on a setext heading's text
  line takes the underline after it too, so its heading resolves to that
  text.
- The field asks the page for the notebook's matches 250 ms after typing
  stops. The page recomputes 300 ms after an edit to a cell, and at once
  when a cell is added, removed or moved, so a row never points at the
  wrong cell in between. Emptying the field clears the page's answer,
  and so does leaving the tab. The rows shown are the answer whose query
  matches the field, so a stale answer never stands under a newer query;
  `FindLayout.answer(for:in:)` makes that call, and a test covers it.
- A page loaded again forgets which query it was asked, as it forgets
  `inspect-variables`, so the tab asks again once the page is back:
  `FindLayout.shouldReask` says when the field has a query and the page's
  answer is gone or another query's, and the reloaded page shows its
  matches without the field having to change.
- With the field empty the tab is the notebook's outline, row for row
  as the old Outline tab (#212); a match goes to its cell the same way,
  so the two never disagree about where a heading is.
- The folder's rows are the old Search tab's (`FileSearch`, #246):
  names first, then the text of its notebooks with "Contents" ticked.
  They keep `navigator.query` and `navigator.contents`, so a window
  opened before this change comes back with its search; the toggle's
  new label is just "Contents", because the tab and its section name
  the scope now. The notebook's section is "In this notebook" and the
  folder's "In <folder>", which says which is which without a heading
  per result.
- ⌘2 is the capsule's Find, as it was Search's, and ⌘4 opens it too:
  that was Outline's key and the hand still goes there. Neither puts the
  cursor in the field: ⌘2 only shows the tab, whose empty field is the
  outline. ⌘⇧F shows Find and puts the cursor in its field, and Escape
  clears it.
- ⌘⇧F, ⌘4 and ⌘2 show the sidebar when the window has it hidden, or an
  area fills over it, then Find: the column's visibility is the
  window's, so the sidebar's keys are handed a way to bring it back
  (`ContentView.sidebar`). The capsule's other keys do the same.
- A stored `.search` or `.outline` shows as Find (`NavigatorTab.shown`),
  so a window left on either doesn't fall back to Files. `tabs(for:on:)`
  takes the platform, since `allCases` is no longer any window's list:
  the Mac's is Files, Find, Running, Recents (this Mac only) and
  Journals, and the iPad's is today's without Find. `IPadChrome` passes
  `.iPad`, and its behaviour is unchanged.
- `FindLayout.sections` lists the sections, and the view draws each one
  from that list, so a section added there shows without a condition the
  view keeps to itself. `FindLayout.status` says what the list says over
  no rows: "Searching…" while the page's answer for the field's query
  hasn't come, even when the files' search is done, so "No matches"
  doesn't flash before it. `NavigatorTabTests` covers these, the
  platform lists and the stored-tab mapping.
- When no notebook pane is shown, as when the notebook failed to open,
  the page answers the field's query itself with no matches, so the list
  can't say "Searching…" for good (review of #881). The page searches a
  new query at once; only cell edits wait 300 ms, since the field has
  already waited for typing to stop.
