## 2026-11-12, Notebooks in Spotlight (#305)

The apps put notebooks in Core Spotlight: the recents (File › Open
Recent on the Mac, the page's Recents on iPad and iPhone) and, on the
Mac, notebooks in folders added in Settings › General › Spotlight. An
entry holds the title (first heading, else the file name), Markdown
text, headings and the kernel's language as keywords; code only with
Include code, outputs never. `NotebookIndexText` reads that straight
from the JSON, as the Quick Look thumbnail does.

`SpotlightIndex` is an actor, so reading and indexing stay off the main
thread. It keeps a manifest (path to modification date) in Application
Support and indexes only files that changed since, drops entries whose
files are gone or no longer wanted, and skips files over 5 MB. Changing
Include code indexes everything again.

The app has no file watcher, so instead of one the index is checked at
launch, when the app comes to the front (at most once a minute), when
Recents change, and after a save. A result whose file has gone is
removed when chosen. On the Mac a result arrives at the app delegate's
`application(_:continue:restorationHandler:)` and opens through
`OpenRequests`; on iOS `onContinueUserActivity` opens it in the page,
when it is under the folder the server serves.
