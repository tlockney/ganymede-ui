## 2026-11-04, first-run onboarding and a sample notebook (#214)

- The empty window, once connected, shows a welcome under New Notebook
  (`Onboarding.tsx`): where notebooks live (the sidebar's folder, on
  which server or in this browser's storage) and where kernels run (in
  this page on this device, on a server, or both), with Show Folder
  (opens the sidebar; left out with `chrome=native`, where the app draws
  its own) and Change… (the connect sheet, which picks where kernels
  run). The sentences come from the backend's config, not its `detail`.
- Open Sample Notebook (`src/lib/sample.ts`) writes a seven-cell
  TypeScript tour with `contents.save` into the folder the sidebar shows
  and opens it. It uses only `jupyter.md` (a Markdown table) and
  `jupyter.svg` (a bar chart), so it needs no packages and runs on every
  cdp-kernel target. The kernel is the backend's default if that runs
  TypeScript, else a `cdp-*` TypeScript kernel, else the default.
- A name that is taken gets a number (`Ganymede Tour 2.ipynb`), so an
  edited earlier copy is never overwritten. The check is `rename.ts`'s
  `lookUp`, now exported: only a 404 (or JupyterLite's "Could not find")
  counts as free, other errors are shown in the welcome.
- "Don’t Show Again" sets `ganymede-ui:onboarding` in local storage,
  read and written in try/catch; with storage off it hides for the page
  only. Not named "Dismiss", which the New Notebook error notice uses.
- App.tsx only passes the folder, the sidebar opener and the copy.
- Not checked here: the tour's cells running on a real cdp-kernel (in the
  page and on `cdp-node`), the SVG's colors in both themes, and the
  welcome's layout in the Mac and iPad apps.
