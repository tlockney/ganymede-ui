## 2026-10-31, Open a notebook from the page URL (#129)

First step of making the Mac app the default app for `.ipynb` files
(#128). The page can now be told what to open: `?open=<path>` opens a
notebook as soon as the backend connects, with the sidebar closed, and
`?dir=<path>` sets the folder the sidebar lists first, defaulting to the
notebook's own folder. The page title follows the open notebook, for the
Mac app's window title later (#132).

- `readLaunch` in `src/lib/launch.ts` is pure, like `initialConfig`, since
  React may run state initializers twice under StrictMode (#60). `dir` is
  stripped from the URL with `token` and `kernels`.
- `open` stays in the URL and follows the open notebook
  (`history.replaceState`), so a reload, ⌘R or WebKit restarting a crashed
  page, comes back to the same notebook. A first version stripped it and
  claimed the same; review caught that nothing restored it. Keeping it
  broke two e2e tests that reload and then open the notebook from the
  sidebar, which `?open=` had collapsed: only a fresh load with `open`
  collapses it now (`isReload` reads the Navigation Timing entry), since
  a reload isn't a newly opened document window.
- Paths are normalized to server paths: no leading, trailing or repeated
  slashes. The Mac app (#130) will run one server rooted at `/` and pass
  absolute file paths; a `//` would otherwise never match the sidebar's
  `item.path`, so the row wouldn't highlight.
- The launch file and folder belong to the first backend. If the connect
  sheet picks another one (say the first connection failed), both are
  dropped, and the sidebar starts at the root, where the other backend's
  folders may not exist. Retrying the same server (same URL and kernel
  mode, another token) keeps them, and so does the first pick when the
  page started with no backend at all.
- A missing file shows the pane's load error, not the connect sheet.
