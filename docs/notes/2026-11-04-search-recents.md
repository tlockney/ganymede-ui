## 2026-11-04, sidebar search and Recents (#215)

- The sidebar has a search field. It matches file and folder names
  (ignoring case, notebooks without `.ipynb`) in the folder shown and its
  subfolders, and with "Search notebook contents" ticked, the cells of
  the notebooks there; a content match shows the line that matched. A
  folder result opens in the sidebar and ends the search, Escape clears
  the field (without also closing a floating sidebar on a phone).
- The Jupyter contents API has no search, so `src/lib/search.ts` lists
  the tree one directory at a time, breadth first, four requests at a
  time, and fetches each notebook for a content search. Limits keep a
  big folder from stalling the server or the page: six levels below the
  folder, 300 directories, 5000 entries, 200 notebooks fetched. Hitting
  one says "Stopped early". A subfolder that can't be listed is skipped.
- Typing waits 250 ms before searching, and each search has an
  `AbortController`: a newer query cancels the older one's remaining
  requests, and its late matches are dropped (a test holds one notebook's
  fetch until the newer search has shown its results). The listing is
  reused across queries in the same folder until `fileChanged` fires;
  notebook sources are cached by `last_modified`.
- Recents (`src/lib/recents.ts`): the last eight notebooks opened, newest
  first, in local storage under `ganymede-ui:recents`, one list per
  backend (by where its files are: the server URL, or this browser), at
  most ten backends. Every read and write is in try/catch, so blocked or
  full storage, or a bad value, leaves an empty list rather than an
  error. The list updates in other tabs through the `storage` event.
- The sidebar records the open notebook itself, so `App.tsx` is
  unchanged; with `chrome=native` the page's sidebar isn't drawn and
  nothing is recorded, which is fine since the Mac app has File > Open
  Recent. Renames and deletes are followed through the contents
  manager's `fileChanged` signal, which covers the sidebar's file menu
  and the title rename alike, and a renamed or deleted folder takes its
  notebooks with it. Each recent is checked once per page load
  (`contents.get` without content); only a 404 drops it, so being
  offline doesn't empty the list.
- The test fakes' `get` now returns a file in the tree (with its
  `content`) and answers a missing path with a 404, as a server does.
- Not checked on a device: how the field and the 36px result rows feel
  on an iPad and iPhone, and that the 16px field keeps iOS from zooming
  on focus.
