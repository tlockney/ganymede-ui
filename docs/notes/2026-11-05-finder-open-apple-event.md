## 2026-11-05, Finder opens by Apple Event; no Connect… frame at launch (#266)

On a signed build of main, double-clicking a notebook in the Finder with
the app running brought Ganymede forward but didn't open the notebook,
after #229 moved Finder opens to the app delegate's
`application(_:open:)`. A plain launch also flashed a bare screen with
one button, then showed the welcome.

- The app now installs its own handler for the Open Documents Apple
  Event in `applicationWillFinishLaunching`. AppKit's handler, which
  this replaces, goes through SwiftUI's own app delegate. Whether that
  passes the call on to the adaptor's `application(_:open:)` is
  SwiftUI's choice, and here it evidently didn't. The handler also gets
  the files the app was launched to open, before
  `applicationDidFinishLaunching`, as before.
- After launch, `OpenRequests` opens each file at once with
  `openWindow(value:)` (a new tab, or the window already showing it),
  so nothing waits on a window to notice the queue. At launch, the
  blank launch window still shows the first file.
- Opens are logged to the unified log, subsystem
  `com.ganymede-server.Ganymede`, category `open`:
  `log stream --predicate 'subsystem == "com.ganymede-server.Ganymede"'`.
- The launch flash was the page's first frame. React runs effects after
  the first paint, so with a config and no backend yet, `connecting`
  was still false and the empty state offered **Connect…**. It now
  counts that, and the server sign-in probe, as connecting. "Connecting…"
  fades in after 0.6 s, so a quick start goes from the logo to the
  welcome. jsdom flushes effects inside `render`, so the test renders
  the first frame with `renderToStaticMarkup`.
- On Thomas's Mac (Remote Control, `open -a` on a copy of the app), main
  did call `application(_:open:)`, so the delegate theory isn't
  confirmed; a real Finder double-click on the quarantined installed app
  (app translocation) is still untested. Every cold open did leave a
  stray tab, though: the window opened on nothing, showing the welcome
  in front, with the notebook in a tab behind it. The files came after
  `applicationDidFinishLaunching`, so they didn't count as opened at
  launch. `OpenRequests` now ends launch a second later, with
  `WorkspaceTabs.launching`, and gives any file still unclaimed then a
  window of its own.
- The open log line is at notice level, so a plain `log stream` shows it.
- Thomas narrowed it down: opening a notebook while the app runs works,
  but launching the app from the Finder by opening a notebook shows no
  window at all. When an app is launched to open a document, SwiftUI
  makes no window of its own, expecting the document's scene to take
  it, and every scene here refuses external events. The files then wait
  in `OpenRequests` for a window that never comes, and `openWindow` is
  only set by a window. The menus exist without any window, so
  `NewCommands` hands its `openWindow` to `OpenRequests` as a fallback,
  and when launch ends, files no window took open through it.
