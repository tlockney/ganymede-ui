## 2026-11-05, Restored notebook tabs show their notebooks (#268)

Testing #267 on Thomas's Mac: after relaunching with saved windows, the
restored notebook tabs came back titled with the notebooks folder and
showing the home-folder welcome page. On a cold Finder open, one of them
was also in front of the notebook that was opened.

- A window keeps what it shows (`WindowTarget`, as JSON) in
  `@SceneStorage("window.target")`. A restored window whose `target`
  comes back empty shows the saved one. Windows opened with File › New
  Tab (`openWindow(id:)`) have no value of their own, and the target set
  later evidently wasn't restored with them, so they came back on the
  default folder. Not confirmed on a Mac; the fix covers both that and a
  value that is restored late.
- A `target` that changes before the page has said what it shows (a
  value restored after the view was made) now replaces what the page
  was loaded for, instead of only renaming the window.
- When launch ends, `OpenRequests.front` names the first file opened at
  launch, and its window comes forward, over restored windows.
- The `open documents:` log line hashes the paths
  (`.private(mask: .hash)`), as #267's review asked.
- The sidebar's folder is kept too (`window.sidebar`), since it can
  differ from the notebook's folder.
- Unit tests cover the saved form and `front`; the restoring itself
  needs a Mac.
- From review: a window writes `window.target` when it appears too
  (`onChange` misses the value it opened with), and gets its saved
  sidebar folder back whether SwiftUI restored its value or not.
  `pageReported` ignores the URL KVO for the app's own load of `loaded`,
  so a late restored value is adopted even when the server was already
  up. A window opened as launch ended comes forward once it has its
  `NSWindow`, and `front` is cleared after.
