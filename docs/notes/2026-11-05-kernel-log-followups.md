## 2026-11-05, Kernel Log follow-ups (#248)

From the review of #298.

- Ganymede answers 404 both for a missing route and for a kernel it no
  longer knows. The second has a JSON `message`, so the tab now says
  "The server no longer has this kernel's log" for it instead of
  "doesn't keep kernel logs".
- The log scrolls with new lines only while its end is in view (a
  one-point marker after the last line, tracked with onAppear and
  onDisappear, since macOS 13 has no scroll position API). Scrolled up
  to read a traceback, it stays put.
- A read error shows as a bar at the top of the lines once there are
  lines, so a server that stops answering doesn't look like a quiet
  kernel. It is a top safe-area inset on the scroll view, not a row
  above it: shrinking the scroll view could push the end marker out of
  view and stop the log following. An overlay kept the size but covered
  the first lines when scrolled to the top; the inset moves them below
  the bar.
