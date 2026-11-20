## 2026-11-20, connected machines in the apps (#701)

A Remote with a server URL is now a place (`Place.swift`): this device
(named This Mac, This iPad or This iPhone, `Places.deviceName`), or `machine(<Remote UUID>)`. The app's embedded server mounts
each machine under `/machines/{id}/` (ganymede#894:
`ganymede_server_add_machine` / `_remove_machine`), and a machine's window
loads the app's own page with `machine=<id>&machine_name=<name>`. The page
(`backends.ts`) then uses `<origin>/machines/<id>/` as its server base: the
same origin, no token in the page, the page's own cookie. `serverBase`,
`machineFromSearch` and `isMachineId` are the one place that builds or
reads it; a malformed id is dropped, never put in a path.

Decisions:

- **The C functions are behind `GANYMEDE_FFI_MACHINES`.** `GANYMEDE_REF`
  (v0.13.1) lacks them and nothing in the project weak-links or `dlsym`s
  newer symbols, so `ServerHost.addMachine` / `removeMachine` compile only
  with that flag (off by default) and `ServerHost.machinesSupported` is
  false without it: the app then lists no machines. The flag-on Swift is
  written against the header of #894 (tlockney/ganymede PR #900), so
  turn the flag on in project.yml once `GANYMEDE_REF` moves to a release
  that has it.
- **A machine window uses the page's own chrome.** The native Mac sidebar,
  toolbar and `PageModel` read this device's files (`FileManager`) and
  state, so a machine window loads the page without `chrome=native`: the
  web sidebar has the place switcher, Files / Journals / Running / Search
  tabs (`Sidebar.tsx`), a "Saved on <machine>" foot and a reachability dot
  (`places.ts`: `api/status` through the mount, every 15 s, 1 s doubling
  to 30 s while it fails). Local windows keep the native sidebar and get a
  `PlaceMenu` at the top (Mac) or a Places section (iPad, iPhone). The
  Journals tab is the web layer's only, so Mac, iPad and iPhone share it;
  a Journals tab for this device is ganymede-ui#705.
- **Gating is by the window's place.** `Place.allows(_:)` decides which
  message handlers `WebViewCoordinator` registers: a machine window gets
  `settings` and `place` only (no `kernelRelay` / device bridge, `openFile`,
  `state`, `document`, `agentKeys`, and not the person's name). Links in a
  machine's page open in the browser only when `http(s)`. The test lists
  every `Place.Capability`, so a new one must be decided.
- **Offline is read-only, not locked out.** `room.ts` reports connection
  changes (`onConnection`); `watchOffline` sets the model and each cell
  read-only (and puts each back as it was), the pane shows the banner, and
  the pane's own document key handler, which runs before the notebook's,
  drops `isEditKey` keys while the room is down. The controller's run,
  insert, cell type, clear outputs and command actions do nothing then.
  A machine's kernels also get no `device` (`attachDevice` `disabled`).
- **State by place.** Recents keys are `machine:<id>` (`recentsKey`); a
  machine config is never saved as the page's next backend (`saveConfig`).
  Native Recents / Spotlight take only `Place.indexesLocally` notebooks.
- **Journals** are the rooms (`GET api/collaboration/rooms`, ganymede#893)
  with an agent client, or whose `last_change.person` is false. A 404 is
  shown as "too old to list journals".
- **Run Kernels On** moved out of the sidebar foot into Kernel > Advanced
  (Mac), the iPad's Kernel menu (Advanced), and the Mac toolbar popover
  ("Runs On (advanced)"); Settings > Remotes is unchanged.

The e2e (`e2e/machines.spec.ts`) starts a second `ganymede serve` and
`e2e/mount-proxy.ts`, a stand-in for the app's mount (it forwards
`/machines/<id>/` to the second server with its token, drops the page's
cookie, can go down, and answers the rooms list when the machine's Ganymede
has none). It proves the page's side; the real mount is exercised once
ganymede#894 is released.

Review follow-ups:

- **Offline writes nothing.** A cell with `syncEditable` writes its
  read-only state to `metadata.editable` in the shared notebook, so
  `watchOffline` sets `syncEditable = false` before locking the cells, and
  back to `true` on reconnect (which reads each cell's state from its
  metadata). Nothing is touched when the room is connected from the start.
- **Commands, not keys, are the gate.** `createCommands` takes `canEdit`,
  which the pane makes false while a machine is away: insert, delete, cut,
  paste, undo, redo, move, cell type and every run do nothing, whatever
  keys (or the touch keyboard bar, which is hidden) call them. The cell
  menu's items are disabled, and the add-cell buttons and drag handle do
  nothing (`attachCellControls`' `away`). The pane's key handler still
  drops edit keys, only those pressed inside the notebook.
- **A machine window can't become one of this device's pages.** A link in
  its page to the app's own origin loads only under its mount or as its
  own page (`Place.allowsFollowing`). The page's places list is refreshed
  when the app's list changes (`WebViewCoordinator.places`).
- **Running tab** of a machine says "Nothing is running on <machine>." It
  has no New Terminal; a terminal on a machine is a follow-up.
- The journal list's classes are `journal-item-agent` and
  `journal-item-status`, apart from the journal view's `journal-status`.
- **By hand:** in a machine's notebook, a link or `window.open` with
  `target="_blank"` to this device's server (an absolute same-origin URL
  outside the machine's mount) loads nothing in the window; one to a web
  site opens the browser. Check both on the Mac and iPad.
- **Collapse and scroll don't sync while away.** `watchOffline` turns off
  `syncCollapse` and `syncScrolled` with `syncEditable`, and reads each
  state back from the metadata before turning them on again, so neither
  the outage nor the reconnect writes. The four collapse and expand
  commands are `mutating` too.
- **Heading collapse and the code toggle** also do nothing while away
  (`attachCodeCollapse`'s `away`): a Markdown heading's buttons write
  `jp-MarkdownHeadingCollapsed` with no sync flag, and the code toggle
  would otherwise show a state the reconnect reverts.
