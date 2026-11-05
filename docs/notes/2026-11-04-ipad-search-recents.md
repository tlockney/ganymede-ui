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
- The native sidebar renames and deletes with `FileManager`, so the
  contents manager's `fileChanged`, which Recents follows, never fires.
  After either, the app sends `file-moved` (`{from, to}`, `to` null for
  a delete) and the page moves or drops the Recents entries.
- A page that reloads posts `search: null` while the field still has
  text, and a keystroke before the page is ready is dropped. The sidebar
  sends the search again whenever the state has a backend but no search,
  or the results would say Searching… for good.
- For one render after a new query, `useFileSearch` still holds the last
  query's matches; the page posts them as searching, not as the new
  query's results, so the list doesn't flash old matches or "No
  matches". The test records every state posted for the second query.
- Search state says `opensFiles` (the page's `editsFiles`): a file that
  isn't a notebook opens in the app's editor only from the app's own
  server, as in the page's sidebar.
