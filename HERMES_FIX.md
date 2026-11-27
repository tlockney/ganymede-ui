# Fix brief: second pre-push review of #883

Branch `claude/project-thread-fneunc` in tlockney/ganymede-ui. Fix every item
below in ONE commit titled "Fix the #883 second review's findings (#883)".
That commit deletes this file. Keep docs/apps.md and
docs/notes/2026-11-27-this-mac-place.md true to the code. Don't touch other
docs. No new dependencies.

Rule for every root below: in a `.thisMac` window, paths from the page are
relative to the server's `root_dir`, so resolve them against
`model.thisMacRoot(for: place) ?? model.serverRootFolder`, never
`serverRootFolder` alone.

1. **Relative app link in a new window** (`WebView.swift`,
   `createWebViewWith`). In a `.thisMac` window, a `ganymede://` link opened
   with `target="_blank"` or `window.open` whose `Place.relativeOpenPath` is
   non-nil must run `page?.run("open", arg:)` like `decidePolicyFor` does;
   only the rest go to the system. Test it.
2. **Open Recent Console** (`GanymedeApp.swift` ~192): in a `.thisMac`
   window resolve `recent.folder` with the rule above. Test the resolved
   target if the code allows a pure function; otherwise extract one.
3. **Spotlight on save and `recentFiles`** (`ContentView.swift` ~474 and
   ~1243): use the rule above. Test via an extracted pure function.
4. **Tests that fail without the behaviour** (add each; check each fails
   when its code is reverted):
   a. Extract the window's trust rule (upgrade on next load, downgrade at
      once) from ContentView into a pure function and test it.
   b. AppModel's check lifecycle with a fake probe: single flight, the
      pending re-run, the generation drop, process exit, and trust cleared
      by stopServer/stopForQuit/start/syncMachines' no-server path.
   c. `ledgerRoot`: the kernel relay's `notebookRoot` and
      `received(document:)` use it in a `.thisMac` window.
   d. `VersionCache`: keeps a success, retries after a failure (make it
      internal for tests).
   e. `RecentsNavigator.entries`/`relativePath`: filters to the root, path
      relative to it, opens as a machine target.
5. **`verifyThisMacNow()` in `ContentView.init`**: run it once per window,
   not on every init. Apply its result without touching `checkingThisMac`,
   and bump the generation so an older running check's result is dropped.
   In `servers(in:)`, read the bundled version only after an info file has
   passed the cheaper checks (loopback, pid, signature, socket), so no
   `jpserver` file or an unsigned build never runs the tool. Update the
   AppModel.swift:479 comment and the dev log's "before its first load"
   sentence to match.
6. **Downgrade without losing edits**: a downgrade must not rebuild the web
   view (`.id` change) and drop unsaved edits. Downgrade in place: remove
   the elevated script-message handlers (ledger, device bridge, kernel
   relay) from the existing web view and make every elevated request answer
   as a machine window's would. The window's identity then changes on its
   next load only. Upgrade stays "next load". Test the in-place downgrade as
   far as unit tests allow. Update docs/apps.md and the dev log.
7. **Editing a trusted remote**: when `syncMachines` sees a remote's URL or
   token change, drop that id's trust synchronously before re-mounting.
   Test it.
8. **Runtime-directory watcher**: debounce (about 0.5 s), and only run a
   check when the set of `jpserver-*.json` files or their modification
   dates changed, so `kernel-*.json` writes don't trigger checks.
9. **Nits**: reuse `FolderEntry.serverPath` or `LinkFolders.relativePath`
   (whichever resolves symlinks and fits) instead of
   `RecentsNavigator.relativePath`; remove the test-only `thisMac:` path of
   `Place.init?(remote:token:thisMac:)` and make the tests use the
   production path.

Before committing: `npm run check`, `npx vitest run`, the macOS unit tests
(scheme Ganymede) and the iOS build (ARCHS=arm64) all pass. Delete any build
output you created.
