# ganymede-ui

A standalone notebook app for [Ganymede](https://github.com/tlockney/ganymede),
built on JupyterLab's notebook packages used directly as libraries, with Vite, styled to look like a macOS app, and
installable as a PWA. Kernels run either on a Ganymede server or in the
browser.

**Status:** working prototype. Runs notebooks against `ganymede serve` and
against in-browser kernels in a Web Worker: cdp-kernel's TypeScript kernel and
JupyterLite's JavaScript kernel. Started in
[tlockney/research](https://github.com/tlockney/research) and moved here with
its history.

[![CI](https://github.com/tlockney/ganymede-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/tlockney/ganymede-ui/actions/workflows/ci.yml)

![Notebook on Ganymede, light](screenshots/notebook-light.png)

| Dark                                   | In-browser kernel                                          |
| -------------------------------------- | ---------------------------------------------------------- |
| ![Dark](screenshots/notebook-dark.png) | ![Web Worker kernel](screenshots/browser-kernel-light.png) |

## Run

```sh
ganymede serve --port 8888 --token test     # in a folder of notebooks
npm install
npm run dev                                 # http://localhost:5173/?token=test
```

The dev server proxies `/api` to `GANYMEDE_URL` (default
`http://127.0.0.1:8888`), so the page and the server share an origin. A token
in the page URL connects at once; otherwise a sheet asks where kernels run.
The in-browser kernel works in both; to test offline use and Workbox's
service worker, use the production build:
`npm run build && npm run preview` (same proxy, port 4173). To point a
deployed copy at a server on another origin, start Ganymede with
`--allow-origin <app origin>` and enter its URL in the sheet.

Ganymede can also serve the built app itself, on its own origin:
`npm run build`, then `ganymede serve --static-dir dist` and open the URL
it prints. The server trades the token for a login cookie, and the app
connects on that cookie. Changing anything (saving, starting kernels) needs
the `_xsrf` cookie that Ganymede sets with the page, from Ganymede 0.3.0
on. `ganymede ui install` and `ganymede ui` fetch and serve a release.

[`apple/`](apple/README.md) builds a Mac and an iPad/iPhone app that run
Ganymede in their own process and show this app in a web view.

`npm run check` type-checks the app, its tests and the end-to-end tests,
checks the dev log, and runs ESLint and Prettier's check
(`npm run lint`, `npm run format:check`; `npm run format` rewrites),
`npm test` runs the app's unit tests (Vitest,
jsdom, next to the code as `*.test.ts(x)`) and the client package's
tests, `npm run test:coverage` prints a coverage summary, and
`npm run build` builds the app.

Releases are cut with `scripts/release.sh <patch|minor|major|X.Y.Z>`, a
dry run by default; `--execute` opens the release pull request. Merging it
tags `vX.Y.Z` and publishes the built app (`ganymede-ui-X.Y.Z.tar.gz` and
`.zip`, a static site) to GitHub Releases. See
[docs/releasing.md](docs/releasing.md) and [CHANGELOG.md](CHANGELOG.md).

`npm run build && npm run e2e` runs the Playwright suite in `e2e/`
against a real `ganymede serve` it starts on a copy of
`e2e/fixtures/Galilean moons.ipynb`. It needs `ganymede` on `PATH` (or
`GANYMEDE_BIN`) and cdp-kernel's `cdp-node` kernelspec, and no Python.
It also writes light and dark screenshots to `test-results/screenshots/`,
the source of the images in `screenshots/`. CI runs all of the above.
`node scripts/render-icons.mjs` regenerates the PNG icons from
`public/icons/icon.svg`.

## How it fits together

In short below; [docs/architecture.md](docs/architecture.md) has the full
picture, and the Ganymede site shows it at
[ganymede-server.com/docs/ganymede-ui/architecture](https://ganymede-server.com/docs/ganymede-ui/architecture).

- **Backends** (`src/lib/backends.ts`). The UI only uses a
  `ServiceManager.IManager`. `ganymede` builds one over REST and websocket;
  `browser` builds JupyterLite's in-page server (`src/lib/lite.ts`,
  `@jupyterlite/services`) with two Web Worker kernels, storing notebooks in
  IndexedDB: cdp-kernel's TypeScript kernel (`src/lib/cdp-kernel.ts`, from
  `@tlockney/cdp-kernel/browser`), the default, and JupyterLite's JavaScript
  kernel (`@jupyterlite/javascript-kernel`). A `ganymede` connection with
  `kernels: 'page'` (the sheet's "Run kernels in this page", or
  `?kernels=page` in the URL, which the iPad app uses) keeps notebooks on
  the server and runs these kernels in the page.
- **Notebook** (`src/components/NotebookPane.tsx`). JupyterLab's
  `Notebook` widget with a `SessionContext`, which starts or rejoins the
  file's kernel. The pane tracks status, and loads and saves nbformat
  through the contents API. `src/lib/jupyterlab.ts` builds what
  JupyterLab's plugins would: editor, renderers, executor, shortcuts,
  and Tab completion and Shift+Tab tooltips from the kernel, find
  (⌘F), and the cell toolbar. Trust Notebook in the toolbar renders
  untrusted outputs and signs the file on Ganymede.
  ipywidgets run through JupyterLab's widget manager (`src/lib/widgets.ts`).
- **Shell** (`src/components/`, `src/styles/app.css`). Unified toolbar,
  translucent source-list sidebar, sheets, segmented controls, system fonts
  and accent, light and dark from the system setting.
  `src/styles/jupyter.css` restyles JupyterLab through its CSS variables.
- **Client package** ([`packages/client`](packages/client/)). Jupyter
  protocol plumbing with no UI framework: the v1 websocket framing, a
  connection layer, ANSI and stream handling, and renderer and widget seams.
  It was Ganymede's `frontend/` package and moved here with its history. The
  app doesn't use it yet; it's the base for the in-page transport to a
  Worker kernel.
- **PWA** (`vite.config.ts`). Workbox precache, manifest with
  `window-controls-overlay`, Apple touch icon. `/api/` is never cached.
  The Workbox worker also carries JupyterLite's service-worker relay
  (`public/lite-service-worker.js`, `src/lib/lite-sw.ts`), which lets
  in-browser kernels read and write notebook files and ask for stdin
  synchronously; `npm run dev` registers the relay alone.

## Findings

- The prototype started on datalayer/jupyter-ui (`@datalayer/jupyter-react`)
  and moved to JupyterLab's packages directly; see the
  [dev log](docs/notes/2026-10-18-drop-jupyter-react.md).
- Ganymede needed no changes. `@jupyterlab/services` works against it as is,
  through a proxy that rewrites `Origin`, or cross-origin with
  `--allow-origin`.
- Restyling via JupyterLab's CSS variables gets most of the native look;
  fighting Lumino's layout does not (the notebook must scroll itself).
- Bundle: 2.2 MB main chunk (620 KB gzip), 5.5 MB precached. Moving
  off jupyter-react brought it down from 3.5 MB and 8.3 MB (it pulled in
  Pyodide, Plotly and Primer whether used or not); completion, tooltips,
  find and the cell toolbar then added 125 KB. The rest is mostly JupyterLab's notebook,
  apputils and ui-components.

Known gaps are listed at the end of the [dev log archive](docs/notes/archive.md). Work is tracked in [issues](https://github.com/tlockney/ganymede-ui/issues); see [CONTRIBUTING.md](CONTRIBUTING.md).

## Next

1. Wire in the Worker cdp-kernel from the browser-kernel thread as a
   JupyterLite kernel plugin, next to the JavaScript one.
2. Give the Worker cdp-kernel file access and `input()` through the
   service-worker relay, now served inside the Workbox worker (see the
   [dev log](docs/notes/2026-10-18-lite-service-worker.md)).
3. Restore saved widget state when no kernel has the widgets; a trust
   indicator. (Completion, inspection tooltips, find, the cell toolbar and
   a trust action are in; see the
   [dev log](docs/notes/2026-10-18-editor-features.md).)
4. File operations (rename, delete, upload), a command palette, menus.
5. Kernels in the iPadOS app: the on-device cdp-kernel, passed to the
   server through tlockney/ganymede#165's `Startup` fields, or remote
   kernels.
