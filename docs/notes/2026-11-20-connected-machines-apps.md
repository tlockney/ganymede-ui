## 2026-11-20, connected machines in the apps (#701)

A Remote with a server URL is now a place (`Place.swift`): This Mac or
On My iPad, or `machine(<Remote UUID>)`. The app's embedded server mounts
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
  written against a guessed signature (`Int32` result, `char **error`
  last, as `ganymede_kernel_register`); check it against the header when
  `GANYMEDE_REF` moves, then turn the flag on in project.yml.
- **A machine window uses the page's own chrome.** The native Mac sidebar,
  toolbar and `PageModel` read this device's files (`FileManager`) and
  state, so a machine window loads the page without `chrome=native`: the
  web sidebar has the place switcher, Files / Journals / Running / Search
  tabs (`Sidebar.tsx`), a "Saved on <machine>" foot and a reachability dot
  (`places.ts`: `api/status` through the mount, every 15 s, 1 s doubling
  to 30 s while it fails). Local windows keep the native sidebar and get a
  `PlaceMenu` at the top (Mac) or a Places section (iPad, iPhone). The
  Journals tab is the web layer's only, so Mac, iPad and iPhone share it;
  a Journals tab for this device waits for #184.
- **Gating is by the window's place.** `Place.allows(_:)` decides which
  message handlers `WebViewCoordinator` registers: a machine window gets
  `settings` and `place` only (no `kernelRelay` / device bridge, `openFile`,
  `state`, `document`, `agentKeys`, and not the person's name). Links in a
  machine's page open in the browser only when `http(s)`. The test lists
  every `Place.Capability`, so a new one must be decided.
- **Offline is read-only, not locked out.** `room.ts` reports connection
  changes (`onConnection`); `watchOffline` sets the model and each cell
  read-only and blocks command-mode edit keys, and the pane shows the
  banner. A toolbar action that edits (insert cell) isn't blocked yet.
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
