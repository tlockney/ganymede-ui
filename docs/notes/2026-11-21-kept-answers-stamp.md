## 2026-11-21, kept answers follow the file (#584)

A link's "Always allow" (`URLRunPermissions`, keyed by path, destination and
a parameters flag) and the device ledger's "always" and "deny" answers
(`PermissionLedger`, keyed by notebook path and capability) outlived the
file: a notebook replaced by git, Finder, a download or a sync kept its
answers, so a different notebook ran without asking. Each kept answer now
holds what the app last saw of the file, and is forgotten when the file no
longer matches.

- The stamp is `FileStamp.of(path)` in DeviceBridge: `"<size>:<mtime ns>:<inode>"`
  from `stat`, following links, as the server's grants stamp a file
  (ganymede `fileid.rs`, `file_stamp`). The inode catches a replace by rename
  with the same size and mtime. The change time is left out: `chmod`,
  xattrs, Finder tags, quarantine and iCloud move it without a change to the
  contents.
- Ledger rows gain an optional `stamp` (a `"stamp"` key in the defaults row;
  older rows load without one). Every read checks the rows: a stamp that
  differs from the file's now drops the row; no stamp and a file there
  stamps the row (trust on first use, for answers kept before this change
  and ones recorded before the file existed); no file leaves the row alone,
  so `move`, which the app calls after the server renamed the file, still
  finds the old path's rows and carries their stamps. A different file made
  at a missing notebook's path has another inode and drops them then.
  The store is written only when a read changed something.
- `URLRunPermissions` keeps the stamps in a second key,
  `urlRunAllowedStamps`, so `paths`, Settings and stored data stay as they
  were. `allows` applies the same three rules; `pruneStale()` runs them over
  every key when Settings › General › Links appears. Settings › Device
  already reloads on appear, which reads the ledger through the same check.
- The app's own saves keep the answers: a window going dirty to clean
  (`DocumentEffects.indexSaved` on the Mac, `pageModel.state.dirty` in the
  main window, local notebooks only) calls `KeptAnswers.saved`, which
  restamps the link keys and the ledger rows, by the path as the app's root
  gives it and by its canonical path. Clean to dirty (`editStarted`,
  new) calls `KeptAnswers.editing` first, which drops what is stale: an
  outside change the room reloaded is caught before the person's next save
  would restamp it.

What it can't see: a rewrite in place that keeps the size and sets the mtime
back; an outside change that lands while the window already has unsaved
edits, which the window's next save restamps; a change the app's save races (a call
between the file write and the page's dirty-to-clean message sees a stamp
the restamp hasn't reached, and asks again, which is the safe way to be
wrong); and a notebook on a machine, which has no file here.

Tests: `FileStampTests` on real files (same file, rewrite in place by size
and by time, replace by rename with size and mtime set equal, a move, a
missing file, a link); `LedgerTests` and `AppURLTests` with an injected stamp
(change drops always and deny and the next call asks, unchanged and restamp
keep, missing file keeps and a move carries the stamp, unstamped rows take
the file's, check and prune, the defaults round trip);
`DocumentMessageTests` for `editStarted`. Swift can't build in the container;
CI's macos-app job is the first compile.
