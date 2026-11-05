## 2026-11-05, a window follows only the app's page (#220)

A review finding on #272. `WindowTarget(page:)` read every URL the web
view showed. A URL with no `open=` or `dir=` read as the server's root.
So a same-origin page that isn't the app moved the window's target to
`/`, and the window was restored there. Examples: a file an output
linked to (`/files/report.html`), or an error page.

`init?(page:)` now returns nil unless the URL's path is the server's root,
where the app's page is served. A test covers `/files/…` and `/api/…`.
This also covers part of the review's second finding: such a URL no
longer counts the blank launch window as not blank (#228).
