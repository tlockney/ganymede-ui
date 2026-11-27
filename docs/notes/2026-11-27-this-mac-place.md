## 2026-11-27, this Mac's own server as a trusted place (#883)

A machine's window is untrusted by design (#877): no permission ledger or
`kernelRelay`, no device API without a per-machine setting, app links read
against the machine, no native Recents or Spotlight. That is right for
another computer. It is wrong for the `ganymede serve` this Mac runs
itself, which section 4 of tlockney/ganymede#965 will route local
notebooks through. The app can't trust a server for being on `localhost`:
any process of any user can listen on a loopback port, and the app sends
that server its token. Trust has to come from who is listening.

- `Place.thisMac(id)` is the third place. It is reached like a machine —
  its mount at `/machines/{id}/`, a window per notebook, its own terminals
  — and `allows` gives it everything `.thisDevice` gives except
  `kernelLocation`, whatever the remote's settings say. `indexesLocally` is
  true, and a `.thisMac` window's `document` message is joined to the
  server's `root_dir`, so Open Recent, Spotlight and the window's proxy
  icon keep its notebooks. `asker` is nil, since its cells are this Mac's
  own processes; its links are this device's (`machineLink` returns
  `.notApp`, so `linkAction` falls through to `opensExternally`), and
  `handlerNames` is this device's.
- `ThisMacVerifier` reads `jpserver-<pid>.json` from the Jupyter runtime
  directory (`AppMCP.runtimeDirectory`), which is mode 0600, so only this
  user's processes write one. It accepts a file only when all hold: the
  `url` is loopback; the `pid` is running and its signature meets
  `anchor apple generic and certificate leaf[subject.OU] = "<the app's
team>" and identifier "<the bundled helper's>"`; that pid holds the TCP
  socket listening on the port (libproc's `PROC_PIDLISTFDS`, then
  `PROC_PIDFDSOCKETINFO`: a socket in `TSI_S_LISTEN`); and
  `ganymede_version` is the app's own bundled version. The process,
  signature and socket lookups sit behind `ThisMacProbe`, so the tests fake
  each part.
- The bundled version is the last word of `Contents/Helpers/ganymede
--version` (`CommandLineTool.version(of:)`, which Settings already
  reads), read once. The team is the running app's own
  (`SecCodeCopySelf` + `SecCodeCopySigningInformation`), so an unsigned or
  ad-hoc-signed build — a debug build, and every local `xcodebuild` run —
  verifies nothing: its own bundled server counts as a machine. That is
  intended, and it means the by-hand check (#399) needs a Developer ID
  build.
- The helper has no `--identifier` in the release workflow
  (`apple/scripts/release-app.sh`), so codesign assigns one from the tool's
  name and its Mach-O `LC_UUID` — `ganymede-UUID…`, which changes with each
  build. The verifier asks the bundled tool's signature for the identifier
  rather than hardcoding it; a re-signed copy of the current tool confirms
  the shape.
- `AppModel` keeps the verified servers by remote id, matched on the same
  loopback address as the info file's, its port and its token — another
  loopback address on the same port is another server, and the app's token
  would go to it — and checks again when the mounts connect
  (`syncMachines`), when a machine that was offline answers again
  (`PlaceReachability.onReachable`), and on every window load
  (`ContentView`'s `onAppear`). The check runs off the main thread, since
  reading the bundled version runs the tool. A window's place comes from
  that (`model.place(for:)`), so a check that fails leaves the window a
  machine's on its next load, its web view rebuilt with a machine's
  handlers (the window's `.id(place)`).
- The place switcher — the sidebar's list of machines — wears a "This Mac"
  badge on a verified remote, in the menu and beside the current place's
  name. The window keeps the remote's name until section 4 replaces the
  embedded server with it.
- Not done here: the window's banner when a check fails (the page draws the
  offline machine's banner; a native notice would be new chrome, and the
  brief asked for the load-time decision only), and section 4's routing of
  local notebooks through the server.
