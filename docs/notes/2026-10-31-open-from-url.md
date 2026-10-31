## 2026-10-31, Open a notebook from the page URL (#129)

First step of making the Mac app the default app for `.ipynb` files
(#128). The page can now be told what to open: `?open=<path>` opens a
notebook as soon as the backend connects, with the sidebar closed, and
`?dir=<path>` sets the folder the sidebar lists first, defaulting to the
notebook's own folder. The page title follows the open notebook, for the
Mac app's window title later (#132).

- `readLaunch` in `src/lib/launch.ts` is pure, like `initialConfig`, since
  React may run state initializers twice under StrictMode (#60). The
  parameters are stripped from the URL with `token` and `kernels`, so a
  reload doesn't reopen the launch file over whatever is open by then.
- Leading slashes are dropped: the Mac app (#130) will run one server
  rooted at `/` and pass absolute file paths, which are then server paths.
- The launch file opens only on the first successful connection. Switching
  backends from the connect sheet clears it, as before.
- A missing file shows the pane's load error, not the connect sheet.
