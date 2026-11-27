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
  icon keep its notebooks. Its Recents list is the ones under that root,
  opened by their path in it; another server's notebooks are not in it
  (`RecentsNavigator`). `asker` is nil, since its cells are this Mac's own
  processes. A relative `ganymede://open?path=` in its window opens against
  the server's root, as the page's paths are from it (`relativeOpenPath`);
  an absolute one, `~`, `run`, `new` and x-callback answers are this
  device's, which the system's `AppURLHandler` does. `handlerNames` is this
  device's. Its web view's identity is the place and the server's
  `root_dir` (`PagePlace`), so a server restarted on another folder is
  another window's worth of paths.
- `ThisMacVerifier` reads `jpserver-<pid>.json` from the Jupyter runtime
  directory (`AppMCP.runtimeDirectory`), which Jupyter creates as mode
  0700, so only this user's processes write one (`AppMCP.serverInfoFiles`
  picks them out, as its own cleanup does). It accepts a file only when all
  hold: the `url`'s host is the literal `127.0.0.1` or `::1`, never
  `localhost` or another name, whose meaning is the system's; the `pid` is
  running and its signature meets `anchor apple generic and certificate
leaf[subject.OU] = "<the app's team>" and identifier "<the bundled
helper's>"`; that pid holds the TCP socket listening on the port at that
  same literal address (libproc's `PROC_PIDLISTFDS`, then
  `PROC_PIDFDSOCKETINFO`: a socket in `TSI_S_LISTEN` whose `insi_laddr` is
  the loopback address, v4 or v6), so a bind to `0.0.0.0` or `::` is
  refused and the token never goes to a server answering on every
  interface; and `ganymede_version` is the app's own bundled version. The
  process, signature and socket lookups sit behind `ThisMacProbe`, so the
  tests fake each part, and the socket lookup is tested against listeners
  the test process opens — one on each loopback literal, and a wildcard one
  refused.
- The bundled version is the last word of `Contents/Helpers/ganymede
--version` (`CommandLineTool.version(of:)`, which Settings already
  reads). A success is kept — the app's own tool doesn't change while it
  runs — and a failed read is tried again by the next check, since reading
  it runs the tool. The team is the running app's own (`SecCodeCopySelf`,
  then `SecCodeCopyStaticCode` for its signing information), so an unsigned
  or ad-hoc-signed build — a debug build, and every local `xcodebuild` run
  — verifies nothing: its own bundled server counts as a machine. That is
  intended, and it means the by-hand check (#399) needs a Developer ID
  build.
- The helper has no `--identifier` in the release workflow
  (`apple/scripts/release-app.sh`), so codesign assigns one from the tool's
  name and its Mach-O `LC_UUID` — `ganymede-UUID…`, which changes with each
  build. The verifier asks the bundled tool's signature for the identifier
  rather than hardcoding it; a re-signed copy of the current tool confirms
  the shape.
- `AppModel` keeps the verified servers by remote id, matched on the same
  literal address as the info file's, its port and its token — another
  loopback address, or a name, is another server, and the app's token would
  go to it. It checks when the mounts connect (`syncMachines`), when a
  machine that was offline answers again (`PlaceReachability.onReachable`),
  and when a window appears; a check asked for while one is out runs once
  more when that one ends. The check runs off the main thread, since
  reading the bundled version runs the tool. A window runs it here and now
  before its first load of a machine's page, so a restored machine window
  is loaded with the place the check finds rather than made again after it.
- Trust follows the process. The app watches each verified pid
  (`DispatchSource.makeProcessSource(identifier:eventMask:.exit)`), and
  watches the runtime directory for writes
  (`DispatchSource.makeFileSystemObjectSource`), so a server that starts or
  stops is read again without a window's asking. A pid's exit drops its
  remote's trust at once. The app drops it too when its own server stops
  (`stopServer`, `stopForQuit`, a restart) and where `syncMachines` finds no
  server: with nothing mounted, nothing it verified is a place.
- A window's place is the one its page was loaded with
  (`ContentView.loadedPlace`), and that is how a trust change applies. An
  upgrade — an ordinary machine whose server the check now verifies —
  takes effect on the window's next load: the page loading again, the
  window opening another page, or a new window. A downgrade — this Mac's own
  server is gone — rebuilds the window as `.machine` at once, because its
  elevated handlers must not outlive the verified server.
- The place switcher — the sidebar's list of machines — wears a "This Mac"
  badge on a verified remote beside the current place's name; the menu
  itself says " — This Mac" in the item's title, since a menu item is its
  text alone and the capsule wouldn't show there. File › Open Recent and
  Open Recent Console are dimmed where `indexesLocally` is false, not for
  every machine, so this Mac's own server's window lists them. The window
  keeps the remote's name until section 4 replaces the embedded server with
  it.
- Not done here: the window's banner when a check fails (the page draws the
  offline machine's banner; a native notice would be new chrome, and this
  branch asked for the load-time decision only), and section 4's routing of
  local notebooks through the server. The banner is #887.
