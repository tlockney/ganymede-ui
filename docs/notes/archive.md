# Development log archive

## 2026-10-18

Goal: a standalone notebook UI for Ganymede, started from
[datalayer/jupyter-ui](https://github.com/datalayer/jupyter-ui), as a Vite
project, styled like a macOS app, headed for a PWA. Also asked: keep the
kernel connection pluggable, since the browser-kernel thread
(`/mnt/project-files/browser-kernel/README.md` in the project) needs a UI to
host a Web Worker cdp-kernel.

Started from jupyter-ui's `examples/vite` (React 19, Vite 7,
`@datalayer/jupyter-react` 2.0.20). Kept its two loader-shim plugins
(`*.raw.css`, `?text`) and `treatAsCommonjs`.

### What broke, and the fixes

- `require is not defined` at load. `@jupyter-widgets/controls` (and
  `html-manager`, `controls7`) do `require('../package.json').version` inside
  ES modules. The example hides this by loading require.js from cdnjs in
  `index.html`. Replaced with a Vite transform plus an esbuild plugin for dev
  pre-bundling that inline the version.
- `__dirname is not defined`: MathJax's CommonJS build. `define` it as `""`.
- jupyter-react falls back to Datalayer's hosted server
  (`https://prod1.datalayer.run/api/jupyter-server`) whenever PageConfig has no
  `baseUrl`; the in-browser contents manager then fetched `all.json` from
  there. Set PageConfig `baseUrl`/`wsUrl`/`token` at startup and on every
  connect. The example's `index.html` also ships Datalayer's server URL and a
  token in a config script; left out.
- Websockets through the Vite proxy got 403: Ganymede compares `Origin` with
  `Host`, like jupyter_server. `changeOrigin` fixes Host only; the proxy now
  rewrites `Origin` on HTTP and websocket requests too.
- The notebook rendered into a zero-height box. `Notebook` is a Lumino panel
  laid out absolutely with `contain: strict`; forcing `height: auto` clips
  every cell. Let it fill the pane and scroll itself; center the cells with
  padding on `.jp-WindowedPanel-inner` and run the scroll area under the
  translucent toolbar with `padding-top`.
- Two sessions per notebook. `Notebook` connects a session to the kernel id
  it's given but names it after its component id. Now the pane starts a bare
  kernel (or reuses the session `findByPath` finds), passes the kernel id, and
  renames the component's session to the file path in `onSessionConnection`.
- Loading marks the model dirty, so "Edited" showed at once. Cleared after
  the first tick.

### Decisions

- The seam is `ServiceManager.IManager`. `src/lib/backends.ts` turns a
  config into one; nothing else knows which backend it has. Two today:
  Ganymede over REST/websocket, and JupyterLite's in-page server with
  jupyter-react's bundled JavaScript Web Worker kernel. A Worker cdp-kernel is
  a JupyterLite kernel plugin (same shape as
  `@datalayer/jupyter-react/lite/javascript-kernel-extension`), so it slots in
  without UI changes.
- `Notebook` in nbformat mode, not path mode. The pane loads and saves through
  the contents API itself, so saving is the same code for a server file and a
  browser (IndexedDB) file.
- Own shell rather than jupyter-react's Primer toolbar: titlebar, sidebar,
  sheets and buttons are plain React and CSS. JupyterLab is restyled only
  through its CSS variables plus a few overrides in `src/styles/jupyter.css`.
- PWA via `vite-plugin-pwa` (Workbox, `generateSW`), `display_override:
  window-controls-overlay` so an installed Chromium app on macOS draws its own
  titlebar next to the traffic lights. `/api/` is never cached.

### Checked

`ganymede serve --token test` (built from tlockney/ganymede main) with
ipykernel installed, `npm run build && npm run preview`, Playwright driving
Chromium (`scripts/screenshots.mjs`): open a notebook, Run All (stdout,
`execute_result`, HTML output), ⌘S saves, switch to "This browser", new
notebook, run JavaScript in the Worker. Light and dark.

### Not working / not done

- In-browser kernel under `npm run dev`: cells stay busy. The JavaScript
  kernel creates its Worker with `new URL('./comlink.worker.js',
  import.meta.url)`, which breaks once Vite pre-bundles the package. Works in
  the production build. Ganymede works in both.
- JupyterLite wants its own service worker at `/lite-service-worker.js` for
  kernel file-system sync; it isn't served, so that sync is off (a console
  warning). It would also compete with the Workbox worker for scope `/`.
- The in-browser contents manager asks `/api/contents/all.json` for seed
  files; through the dev proxy that reaches Ganymede and gets 403. Harmless.
- ipywidgets: jupyter-react loads require.js from cdnjs for widget AMD
  modules. Not tested (no network to cdnjs here).
- Bundle: main chunk 3.5 MB (930 KB gzip), 8.3 MB precached. Pyodide,
  Plotly, Primer and all of JupyterLab come with jupyter-react.
- Not built: completion/inspection UI beyond JupyterLab's own, rename/delete
  files, find, command palette, menus, keyboard shortcut help, trust prompts.

## 2026-10-18, later

Moved out of tlockney/research into this repo. `main` starts from
`git subtree split --prefix=ganymede-ui` of research, so the app's history
came along. Ganymede's `frontend/` package came in the same way
(`git subtree add --prefix=packages/client`), renamed `@ganymede-ui/client`,
since this UI is its only consumer. The root `package.json` is the app and
an npm workspace root for `packages/*`. Added CI (check, client tests,
build on Node 24) and the MIT license, matching Ganymede.
