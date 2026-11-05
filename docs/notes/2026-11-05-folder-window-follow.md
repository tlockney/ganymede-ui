## 2026-11-05, Mac folder windows follow the page's folder (#220)

- `WindowTarget(page:)` read only `open=`, so a window with no notebook
  open never learned the folder the page was showing. It now reads
  `dir=` when there is no `open=`, and the server's root when there is
  neither, matching `readLaunch` in `src/lib/launch.ts`.
- A window opened on nothing must stay `nil` until a notebook opens:
  `OpenRequests` hands the Finder's launch files to the blank window
  (#228). Its first navigation reports the folder it loaded, so
  `follow()` ignores a folder equal to `loaded` while the target is nil.
- With native chrome the page's sidebar is hidden, so `dir=` changes
  mostly when a notebook closes (the page then writes its folder). The
  native sidebar's root (`sidebarRoot`) is not moved by this.
