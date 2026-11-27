## 2026-11-27, Mac Find tab (#879)

The Mac's sidebar had Search and Outline as two tabs, and neither
searched the notebook the window had open: Search looked through the
folder's files, and Outline only listed headings. The Mac now has one
Find tab in their place, as Xcode's navigators do; the iPad keeps Search
and Outline for now. Step 4 of the Mac redesign (#844).

- `find-in-notebook` takes a trimmed query and the page answers in
  `PageState.notebookFind` (`src/lib/notebook-find.ts`): each match a
  cell, the heading at or above it and its matching line, fifty at most
  and how many more matched. Every cell's source is searched, code as
  well as Markdown, because code holds the names people look for. The
  snippet is the line around the match, not the cell's first line, so
  the result reads as the place it goes to.
- The field asks the page for the notebook's matches 250 ms after typing
  stops, and the page recomputes 300 ms after its cells or the query
  change, as the outline already waits for headings. Emptying the field
  clears the page's answer, and so does leaving the tab: nothing else
  asks for matches. The rows shown are the answer whose query matches
  the field, so a stale answer never stands under a newer query.
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
  that was Outline's key and the hand still goes there. ⌘⇧F shows Find
  and puts the cursor in its field, and Escape clears it. None of the
  three is a menu item, as asked.
- A stored `.search` or `.outline` shows as Find (`NavigatorTab.shown`),
  so a window left on either doesn't fall back to Files. `tabs(for:on:)`
  takes the platform, since `allCases` is no longer any window's list:
  the Mac's is Files, Find, Running, Recents (this Mac only) and
  Journals, and the iPad's is today's without Find. `IPadChrome` passes
  `.iPad`, and its behaviour is unchanged.
- `FindLayout.sections` decides whether the outline or the sections
  show, and which sections, so the view has no conditions of its own
  that a test can't reach; `NavigatorTabTests` covers it, the platform
  lists and the stored-tab mapping.
