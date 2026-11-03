## 2026-11-03, New Notebook on the Mac (#194)

The Mac app's New Notebook buttons did nothing.

- The empty pane's button created the notebook at the server's root
  (`newNotebook('')`). Since #130 the Mac server's root is `/`, so that
  meant `/Untitled.ipynb`, which the system volume refuses. It now uses
  the folder the sidebar shows, which the sidebar reports to `App`
  (`onDirChange`).
- `newNotebook` didn't catch errors, so the refusal was dropped and the
  click looked dead. A failed create now shows a dismissable notice with
  the server's reason. A rejected promise from a click handler is easy to
  miss: nothing logs it in the app, and the Web Inspector shows it only
  if it's open.
- `dir` was a launch-only parameter, removed after the first load, so a
  reload of a folder window put the sidebar at `/`, where the sidebar's
  button failed the same way. `dir` now stays in the URL beside `open`
  (`withDir`), left out when the page would start there anyway.
- In Chromium against a server rooted at `/` both buttons worked from a
  folder window, so the failure needs the root (or an unwritable folder)
  to show. Not yet tried in the Mac app.
