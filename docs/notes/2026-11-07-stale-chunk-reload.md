## 2026-11-07, Reload, not Retry, when a chunk fails to load (#364)

The Mac app showed "Couldn’t open 2026-11-06-co2-acceleration.ipynb:
Importing a module script failed." and Retry kept failing; relaunching
the app opened the notebook. That message is WebKit's for a failed
dynamic `import()`, and opening a notebook always imports the widgets
chunk, so the page was older than the files the server or the service
worker's precache had. The same notebook opens in Chromium against a
build of main.

How the page went stale wasn't confirmed. Candidates: the app or its web
folder replaced while running, or a test build with another bundle. Test
builds share the release app's bundle ID, saved port and WebKit data, so
the same origin and service worker, and the worker's `autoUpdate`
replaces the precache under a running page.

Retry can't recover: the module map remembers a failed fetch, so the
page re-imports the same URL and fails again. The pane now recognizes
the three engines' wordings (`isStaleBundle` in `src/lib/problems.ts`)
and offers Reload, which reloads the page. Other open failures keep
Retry. In a browser, a notebook in the page with unsaved edits asks
before the reload (`beforeunload`); the Apple apps' web view shows no
such prompt (no `runBeforeUnloadConfirmPanel` delegate).
