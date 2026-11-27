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
  device's. Its web view's identity is the place its page was loaded with
  and the server's `root_dir` (`ContentView.pagePlace`), so a server
  restarted on another folder is another window's worth of paths; a
  downgrade does not change it, since the page keeps what it has open.
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
  go to it. `ThisMacChecks` holds the lifecycle: a check is out one at a
  time, and one asked for while it is out runs once more when that one
  ends. It checks when the mounts connect (`syncMachines`), when a machine
  that was offline answers again (`PlaceReachability.onReachable`), and
  when a window appears; the check runs off the main thread, since reading
  the bundled version runs the tool. A window runs a check for itself
  before its first load of a machine's page, so a restored machine window
  is loaded with the place the check finds rather than made again after
  it. That check is made once per window — SwiftUI makes a window's
  `ContentView` more than once and keeps only the first, and the first of
  a turn of the main runloop checks, the rest of that turn taking its
  answer — and it applies without waiting on a check that is out, bumping
  the generation so that one's answer is dropped, this one being newer.
- The bundled version is read only after an info file has passed the
  cheaper checks: the loopback literal and its port, the pid, its signature
  and its socket. An unsigned build, and a folder of files that are no
  server's, never run `Contents/Helpers/ganymede`. `AppMCP.infoFileDates`
  is what a write in the runtime directory is compared against — the
  `jpserver-*.json` files and their dates, never a kernel's own
  `kernel-*.json` — so a kernel running sends no check, and a write waits
  half a second for the writes that come with it (a file written, then
  renamed into place) before one does.
- Trust follows the process. The app watches each verified pid
  (`DispatchSource.makeProcessSource(identifier:eventMask:.exit)`), and
  watches the runtime directory for writes
  (`DispatchSource.makeFileSystemObjectSource`), so a server that starts or
  stops is read again without a window's asking. A pid's exit drops its
  remote's trust at once. The app drops it too when its own server stops
  (`stopServer`, `stopForQuit`, a restart) and where `syncMachines` finds no
  server: with nothing mounted, nothing it verified is a place. A remote
  saved again with another address or token — which is another server, and
  the app's token would go to it — loses its trust as the mount is made
  again, before anything can answer for the server that is gone
  (`ThisMacChecks.forget`).
- A window's place is the one its page was loaded with
  (`ContentView.loadedPlace`), and that is how a trust change applies. An
  upgrade — an ordinary machine whose server the check now verifies —
  takes effect on the window's next load: the page loading again, the
  window opening another page, or a new window, which re-checks before it
  loads. A downgrade — this Mac's own server is gone — takes effect at
  once, and in place: the web view is not made again, which would load the
  page again and drop its unsaved edits, so the ledger's relay, the
  kernel relay and the full device bridge are taken off the page it has
  open, and what it asks from then on answers as a machine's window does
  (`KernelHost.downgrade`). The window's place is a machine's from that
  moment — its Recents, its terminals and its links are the machine's —
  and its identity (`ContentView.pagePlace`) changes on its next load
  only, where the page is loaded again anyway.
- Its page paths are its own server's `root_dir` (`Place.pageRoot`): the
  ledger's notebook paths, a `document` message, Spotlight's save and the
  page's recents, and File › Open Recent Console's folders, are all under
  it, so a this-Mac window's notebooks are files on this Mac and another
  server's aren't in it. A relative `ganymede://open?path=` in a new
  window (`target="_blank"`, `window.open`) opens there too, as a click's
  does (`Place.newWindowAction`), where the system's `AppURL` would
  resolve it as a file on this Mac.
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
