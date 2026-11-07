## 2026-11-07, kernel list follows kernelspec installs (#350)

A kernelspec installed or removed while the Mac app ran (say
`python -m ipykernel install --user`) didn't reach the kernel picker or
Settings › Kernels until a restart. The server was never the problem:
`FsKernelspecs::list` reads the kernelspec directories on every
`GET /api/kernelspecs`. JupyterLab's `KernelSpecManager` polls that every
61 seconds, but nothing re-rendered on `specsChanged`, so the toolbar,
the native toolbar and menus (posted page state) and the problem notice
kept the first list.

- App and NotebookPane re-render on `specsChanged`.
- `refreshKernelsOnReturn` (`src/lib/kernel-refresh.ts`) refreshes the
  specs when the window gets focus or the tab shows, at most once per
  2 seconds. This covers the browser too.
- New page command `refresh-kernels`. The Mac app runs it in each
  window's page when the app becomes active; WKWebView doesn't reliably
  fire `focus` on activation.
- Settings › Kernels reloads when the app becomes active, and has a
  Refresh button for kernelspecs installed from the app's own terminal,
  where the app never leaves the front.

A remote's list comes through the server's gateway, which refreshes it
every minute, so a kernelspec added on a remote can still take that long.

Not yet tried on a real Mac.
