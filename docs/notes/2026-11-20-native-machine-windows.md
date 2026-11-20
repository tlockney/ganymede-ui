## 2026-11-20, native window for connected machines (#740)

Step 2 of #736: a machine's window on the Mac is `ContentView`, with the
native sidebar, toolbar, inspector, menus and tabs; `MachineWindow` is gone
on the Mac (the iPad keeps `MachineScreen` and the page's own chrome until
step 4, #741).

Decisions:

- **The window's place is its target's** (`loaded.place`). The sidebar root
  is a location URL: a file URL for this device, `FolderEntry.machineURL`
  for a machine. `WindowTarget.folder` returns that location, so a machine's
  target never yields a path on this Mac; a malformed id yields a URL no
  source accepts.
- **Chrome is native for machines.** `pageURL` drops the machine gate, and
  `Place.allows(.nativeChrome)` is true, so `state` and `document` attach.
  The other gates are as before. `AppModel.page(for:)` still asks the iPad's
  machine screen for the page's chrome. The `place` handler stays: the page's
  switcher is hidden under native chrome, so it is idle, and the native
  `PlaceMenu` opens `WindowTarget.root(of:device:)`.
- **`document` is the machine's own.** `DocumentMessage` takes the place and
  makes a machine URL for the file; `PageDocument` sets the proxy icon only
  for file URLs, and notes Recents / Spotlight only where `indexesLocally`.
- **The web view is made for the window's place and keyed by it** (`.id`),
  so a late-restored machine target (`show(saved)` into a window made for
  this device) never gets this device's handlers.
- **Saved state.** `window.target` is the Codable target as before.
  `window.sidebar` and the expanded folders use `FolderEntry.storageKey`: a
  file URL's path (existing saved values keep working), a machine location's
  whole URL. A restored sidebar is used only if it is in the window's place.
- **Hidden or off for a machine:** Reveal in Finder, Duplicate on a folder,
  the Recents tab, File > Open Recent (a focused `WindowScope`), the
  terminal panel and its toolbar button and menu items (`windowFolder` and
  `panelController` aren't set), the Kernel Log, and the text editor (other
  files are disabled, `FolderEntry.canOpen(in:)`; nothing reads the Mac's
  disk). A machine window never registers with `OpenRequests` or takes the
  Finder's files, and notes no folder for a start window.
- **New Notebook** (toolbar, File menu) passes the sidebar location's server
  path, which `FolderEntry.serverPath` reads for both kinds; the menu takes
  it from `WindowScope`. Open in New Tab uses `WindowTarget(opening: entry)`.
  Search's relative folder is `FileSearch.relativeFolder`, from paths.
- **Title and subtitle:** `displayTitle(machineName:)` as `MachineWindow` had
  it (a tab names its machine), and the subtitle is "on <machine>" then the
  kernel's, so the kernel state is not lost.
- The sidebar foot names the machine instead of where this Mac's kernels run.

Review fixes:

- **Delete, not Move to Trash, on a machine.** Its server deletes for good
  (Ganymede's contents API has no Trash), so the item says Delete… and
  always asks (`RemoveAction`, tested); this device's is as before.
- **A machine's names are untrusted.** `FolderEntry.machineURL` and
  `machineLocation` refuse any `.` or `..` segment (and a `/` hidden in a
  decoded one), `contentsURL` throws for them, and `list` drops names with a
  `/` or `\\` and items whose own `path` isn't the folder's plus the name.
  A server `path` of `../x` is a bad response. Otherwise a `..` could climb
  out of `/machines/<id>/` and reach this Mac's own server with its token.
- **One file operation at a time** in the sidebar: the menu items that
  change files are disabled while one runs (`busy`).
- **`DocumentEffects`** decides what a document message reaches (Recents,
  Spotlight, the proxy icon) in one tested function.
- **Room paths are untrusted too.** A machine's `rooms` paths become
  `page.run("open", …)` and a target's `open=`, where the page's URL joining
  removes dot segments, so `../../api/contents/Users/me/x.ipynb` would reach
  this Mac's own server. Swift: `Journals.parseRooms` drops paths with a
  `.`/`..` (or `%2E`) segment, a backslash or nothing left;
  `WindowTarget.machine` is nil for them and a page URL's `dir=` that climbs
  is the root. Page: `clean()` in `launch.ts` returns '' for such a path (so
  `open=`, `dir=` and the `open` command read none), and the web Journals
  tab's `parseRooms` drops them.
- `FileSource.delete` returns where the item went (the Trash), so the test
  proves the Trash through `delete` and removes its copies.

Left:

- File > New Tab / New Window from a machine window open this device's start
  window; "Runs On (advanced)" in the kernel popover and menu is still this
  Mac's setting; a terminal on a machine (#741).
- Paths in a machine's own answers (a new notebook's path, a copy's, the
  page's listings) still reach the page's contents calls unchecked; the
  transport guard that keeps every request under the mount is #742.

Journals (#705, pulled forward from step 3):

- **A native Journals tab for every place** on the Mac. `Journals.swift` is
  a port of `journals.ts` (`parseRooms`, `isJournal`, `journalsOf`, same
  order), so the page's tab and this one agree. It asks
  `api/collaboration/rooms` on the app's server, through the mount for a
  machine (`PlaceReachability.mountURL`), every 5 s as a view task, so
  hiding the tab or a new server address cancels it. An older server's 404
  stops the polling and says the server is too old.
- **⌘6, last in the strip**: Recents keeps ⌘5, so no key moves and the
  strip reads in key order. The iPad's tab strip leaves Journals out. Its
  local windows use native chrome, which hides the page's web sidebar and
  with it the page's Journals tab, so they have none (the iPad's machine
  screen still has the page's); a native one is ui#705's iPad half.
- **A 404 from the mount** ("No machine … is mounted") is an error and is
  asked again, not "too old"; a non-JSON answer is an error too. The row's
  second line is `journalStatus` ported (`Journals.status`).
