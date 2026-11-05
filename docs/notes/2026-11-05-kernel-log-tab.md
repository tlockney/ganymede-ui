## 2026-11-05, Kernel Log tab in the Mac bottom panel (#248)

- The bottom panel's first tab follows the open notebook kernel's log
  from ganymede's `GET /api/kernels/{id}/log` (ganymede#366), asking for
  the lines after the last one read once a second while the tab is on
  show, and at once again when a page ends before `last_seq`. It keeps
  the last 1000 lines, as the server does.
- The page now sends each running session's kernel id
  (`PageState.running[].kernelId`), so the app knows which kernel the
  open notebook has. The log is read from the app's own server, which
  the page uses.
- A 404 means the server has no log route (`jupyter_server`, or a
  Ganymede older than the route); `reason: "no_process"` means the
  kernel runs on a gateway or in-process. Each gets its own message.
- The app's CI and release build against `GANYMEDE_REF` (v0.5.0), which
  has no log route, so the tab shows "doesn't keep kernel logs" until
  that pin moves to a release with the route.
- The Kernel Log tab never closes and needs no terminal: showing it on
  an empty panel doesn't start a shell, and closing the last terminal
  keeps the panel while the log is on show.
- Not done in #248: moving a terminal between the panel and a main-area
  tab, which needs the transport to outlive its view (#247).

### Follow-up (review of #298)

- Ganymede answers 404 both for a missing route and for a kernel it no
  longer knows. The second has a JSON `message`, so the tab now says
  "The server no longer has this kernel's log" for it instead of
  "doesn't keep kernel logs".
- The log scrolls with new lines only while its end is in view (a
  one-point marker after the last line, tracked with onAppear and
  onDisappear, since macOS 13 has no scroll position API). Scrolled up
  to read a traceback, it stays put.
- A read error shows as a bar above the lines once there are lines, so
  a server that stops answering doesn't look like a quiet kernel.
