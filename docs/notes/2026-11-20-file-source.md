## 2026-11-20, file source for the native sidebar (#737)

Step 1 of #736: the native sidebar and its search no longer read the disk
themselves; they take a `FileSource` (`FileSource.swift`), so a machine's
window can use them later. Nothing user-visible changes: the Mac window
passes `LocalFileSource()`.

Decisions:

- **Items stay `FolderEntry`, with an opaque `url`.** A file URL on this
  device; for a machine `ganymede-machine://<id>/<path>`, which
  `FileManager` never sees. `FolderEntry.machineURL`, `machineLocation` and
  `parent(of:)` are the only places that build or take one apart, and
  `FolderEntry.serverPath` understands both, so a row's server path (what
  `open` and `new-notebook` take) needs no source. A malformed machine id
  never makes a URL.
- **The protocol is async and small.** `list`, `newFolder(in:)`,
  `rename(_:to:)`, `duplicate`, `delete`, `readText` and `serverPath`. The
  folder listing is a `.task(id:)`, still keyed by `generation`; a listing
  cancelled by a newer one changes nothing.
- **`LocalFileSource` is the old code, moved.** Same listing rules, "untitled
  folder" and "copy" naming, Trash, move. `FolderEntry.list` stays for the
  iPad sidebar, which keeps `FileManager` and deletes instead of trashing.
- **`MachineFileSource` speaks the contents API through the mount**, at
  `<server>/machines/<id>/api/contents/<path>` with the server URL's query
  (its token) kept. `PlaceReachability.mountURL` builds it now, and
  `statusURL` uses it. Path segments are percent-encoded; names starting
  with "." are skipped and the order is the local one. A non-2xx answer
  throws the response's `message`, else its status. The server names new
  folders and copies, so those names are whatever it answers. Machine URLs
  are encoded by hand (unreserved characters only per segment), since
  `URLComponents.path` leaves `;` and similar alone. Ganymede's contents
  copy refuses folders, so `duplicate` on a machine folder asks for the
  item first (`content=0`) and throws `foldersCantBeDuplicated` without
  sending the copy. Names "." and ".." are refused by both sources.
- **`FileSearch.run` is async and takes a source.** Same limits. Notebook
  text comes from `readText`: for a machine, the notebook JSON re-encoded
  from the contents API's `content`, which `snippet` parses as before.
  Cancellation is the running task's, checked between folders and files.
- **Reveal in Finder stays local-only**, on `entry.url`, since only local
  windows use the native sidebar until step 2.
- **Content search expects UTF-8 notebooks.** `readText` decodes UTF-8 (nbformat
  is UTF-8); a file that isn't is skipped. Page actions re-read the page's
  open path after a trash or rename returns, not before.

Left for step 2 (machine windows):

- Folder expansion is stored by `url.path`, so a machine's and this Mac's
  folders could collide; key it by the whole URL.
- Open in New Tab uses `WindowTarget(opening: url)`, which takes a file URL.
- Search's relative-folder label uses file-URL helpers.
- Reveal in Finder is local-only.
- Duplicate must be hidden for a machine's folders.
