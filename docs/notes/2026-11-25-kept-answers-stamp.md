## 2026-11-25, Kept answers follow the notebook's file (#584)

A link's "Always allow" (`URLRunPermissions`, keyed by path, destination and
a parameters flag), the device ledger's "always" and "deny" answers
(`PermissionLedger`, keyed by notebook path and capability) and the folders a
notebook was given (`FolderGrants`, per notebook) outlived the file: a
notebook replaced by git, Finder, a download or a sync kept them, so a
different notebook ran without asking. Each kept answer now holds what the app
last saw of the file, and is forgotten when the file changes by anything
but the app's own server.

- **The stamp** is `FileStamp.of(path)` in DeviceBridge:
  `"<size>:<mtime ns since epoch>:<inode>"` from `stat`, following links, with
  a time before the epoch as `0`. It is the string the server makes
  (ganymede `fileid.rs`, `file_stamp`), which is what lets the server's write
  reports be compared with it. The inode catches a replace by rename with the
  same size and mtime. The change time is left out: `chmod`, xattrs, Finder
  tags, quarantine and iCloud move it without a change to the contents.
  `FileStamp.canonical` is `realpath`, as the server names a file (macOS keeps
  `/private`, which `resolvingSymlinksInPath` drops).
- **Storage.** Ledger rows and folder grants gain an optional `stamp` (older
  rows load without one). `URLRunPermissions` keeps its stamps in a second
  key, `urlRunAllowedStamps`, so `paths`, Settings and stored data stay as
  they were.
- **Checks** (`allows` for links, every read of the ledger and of the folder
  grants, which the bridge, Settings and the notebook-open prompt all go
  through): a stamp that differs from the file's now drops the answer; no
  stamp and a file there stamps it (trust on first use, for answers kept
  before stamps and ones recorded before the file existed); no file leaves it
  alone, so `move` and `notebookMoved`, which the app calls after the server
  renamed the file, still find the old path's rows and carry their stamps. A
  different file made at a missing notebook's path has another inode and drops
  them then. A dropped "deny" only means the next call asks again. The stores
  are written only when a check changed something. Settings lists only live
  answers: Links prunes on appear, Device reads through the same checks.
- **The server's own writes keep the answers.** Ganymede v0.16.0
  (`GANYMEDE_REF`) has `ganymede_server_set_write_observer`, which reports
  every write the server makes of a file under its root (REST save, a room's
  autosave, a run saving its outputs, MCP, a checkpoint restore, a copy to a
  named path) with the file's canonical path and its stamp before and after.
  `ServerHost.setWriteObserver` wraps it (under the lock `addMachine` uses,
  with the retained context box released by the server's `release`), and
  `KeptAnswers.watch(host)` sets it after each server start. A report goes two
  places:
  1. `ServerWriteLog.shared.record` at once, on the server's thread (last 32
     transitions per file, 256 files);
  2. `KeptAnswers.serverWrote` on the main actor, which tells the links, the
     ledger and the folder grants. Each moves the rows of that file (compared
     by `realpath` of the row's path, so a root-relative spelling, a link and
     `/private/var` against `/var` all match) from `before` (or no stamp) to
     `after`. A row at some other stamp stays and the next check drops it: an
     outside change came first, and a server autosave after it doesn't make
     that change the app's. `before == nil` (the server made the file) leaves a
     stamped row alone for the same reason. `after == nil` changes nothing.
     The log closes the gap between the two: a check on the main actor that runs
     before the hop has restamped sees a stamp the row doesn't have, and asks
     `log.leads(path, from: rowStamp, to: fileStamp)`, which follows recorded
     transitions (A to B to C, with a visited set so a cycle ends). If it leads
     there, the row is restamped and kept. Reports heard in the other order are
     covered the same way. The stores take the log as an injected `ServerWriteLog?`,
     `.shared` by default in the app and nil or their own in tests.

**Why the window-save approach was dropped.** The first draft restamped on the
window's saves (`pageModel.state.dirty` going true to false, `DocumentEffects`'
`indexSaved`, a new `editStarted` to check when an edit began). Most writes of
a notebook on the app's own server have no window: a Shortcuts or
`ganymede://` run saving its outputs, a room's autosave, an MCP agent. Each
changed the stamp and, with that draft, forgot "Always allow" after every
Shortcuts run. The server's report covers all of them, and the window hooks
(`KeptAnswers.editing/saved`, `editStarted`) and their tests are gone.

What it can't see: a rewrite in place that keeps the size and sets the mtime
back; and a notebook on a machine, which has no file here (the server
reports files under its own root only). The share extension has its own
process and an empty log, so a check there that races a server write in the
app asks again, which is the safe way to be wrong. Other things kept per
notebook path (published widgets, notebook secrets) are not stamped; they
are not kept answers about what the notebook may do.

Tests: `FileStampTests` (the format against `stat`'s numbers, pre-epoch as 0,
`canonical` through a link, same file, rewrite in place by size and by time,
replace by rename with equal size and mtime, move, missing, link);
`ServerWriteLogTests` (single, chain, gap, created file, cycle, the 32 and
256 limits, threads); `LedgerTests`, `FolderStampTests` and `AppURLTests` with
injected stamps and logs (change drops always and deny and the next call asks;
unchanged keeps and saves nothing; the server's write keeps that notebook's
answers only; a check before the hop keeps via the log; a chain A to B to C;
reports out of order; a server write after an outside change drops; a file
the server created drops a stamped row; a row with no stamp takes it; a move
carries the stamp; a link's spelling matches the canonical report; the
defaults round trip); `FoldersTests` for a call failing `denied` after an
outside change; `ServerHostTests` against the real server at `GANYMEDE_REF`
(a PUT reports the canonical path and stamps equal to `FileStamp.of` before
and after). Swift can't build in the container; CI's macos-app job is the
first compile.

**By-hand check for #399** (on a Mac with a build of `main`):

1. Make a notebook that uses a ledger capability (a cell calling
   `device.location.current()`) and open it from a `ganymede://run` link or
   a Shortcuts action. Answer "Always allow" on the link prompt, and "Always"
   on the capability prompt. Pick a folder with `device.folders.pick()`.
   Settings › General › Links and Settings › Device list all three.
2. Run the link again, and edit and save the notebook in its window, and run a
   Shortcuts action that saves outputs. None asks again, and Settings still
   lists all three.
3. Quit the app. In a terminal, `git checkout` another version of the
   notebook (or `mv` a copy over it). Open the app: the link asks again;
   the capability asks again; `device.folders.list()` is empty; Settings
   lists none of the three for that notebook.
4. Repeat step 3 with the app open and the notebook open in a window.
5. Answer "Don't allow" for a capability, change the notebook outside the app:
   the capability asks again (a forgotten deny only costs that question).
6. Rename the notebook in the sidebar: its answers follow, none asks.
7. Touch the file with `chmod` or a Finder tag only: nothing is forgotten.
