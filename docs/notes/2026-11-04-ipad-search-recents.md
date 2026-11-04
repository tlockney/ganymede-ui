## 2026-11-04, Search and Recents in the iPad sidebar (#240)

`chrome=native` hides the page's sidebar on the iPad, and with it the
search field and Recents list from #233. The iPad's native sidebar gets
both, and the page still does the work, so the two sidebars behave alike.

- The page runs `useFileSearch` and `useRecents` for the app only with
  `chrome=native` (the page's own sidebar runs its own otherwise), and
  posts `PageState.recents` and `PageState.search`: the query, the
  matches as path, name, type and snippet, and whether it is still
  searching or stopped early.
- New page commands: `search`, whose argument is a JSON `SearchRequest`
  (`query`, `dir`, `contents`; an empty query ends the search), and
  `clear-recents`. A JSON argument keeps the command list's one-string
  arguments while letting the Mac's navigator (#246) pass its folder,
  since its server is rooted at `/`.
- The sidebar uses `.searchable`; while the field has text, the list
  shows a Search notebook contents switch and the results instead of
  Recents and the folder tree. The page debounces typing, so the app
  sends every change.
- Folders in the results are listed but not opened: the native tree has
  no "go to folder" yet.
