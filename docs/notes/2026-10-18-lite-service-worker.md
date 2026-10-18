## 2026-10-18, JupyterLite service worker (#8)

The rest of [#8](https://github.com/tlockney/ganymede-ui/issues/8) after
the dev-mode kernel fix in [#15](2026-10-18-drop-jupyter-react.md):
JupyterLite's service worker, and the `all.json` request.

### What the service worker is for

In JupyterLite 0.8 the worker is `@jupyterlite/apputils`'
`service-worker.js`, with `ServiceWorkerManager` on the page. It does two
things: a cache (off unless `enableServiceWorkerCache` is set), and a relay.
A kernel in a Worker that needs a synchronous answer from the page posts a
synchronous XMLHttpRequest to `api/drive` (Emscripten's DriveFS, so
Pyodide or xeus code can open notebook files) or `api/stdin/kernel`
(`input()` without SharedArrayBuffer). The worker relays it to the page on
the `/sw-api.v1` BroadcastChannel, tagged with the page's
`browsingContextId`, and returns the page's answer.

The console warning in the archive came from jupyter-react's copy of
`ServiceWorkerManager` failing to register `/lite-service-worker.js`.
Since #15 nothing registers it, so there was no warning, and no relay
either.

### Design: the relay inside the Workbox worker

An origin has one service worker per scope, and a client (page or Worker)
is controlled by the worker whose scope its *own* URL falls in, not the
URLs it requests. So a narrower scope for JupyterLite's worker (`/lite/`,
with JupyterLite's base URL moved there) doesn't help: the page at `/` and
the kernel Worker at `/assets/worker-runtime-*.js` would stay with
Workbox, and their `api/drive` requests would never reach it. The kernel
Worker would have to be loaded from under `/lite/`, which Vite's asset
layout doesn't do. The other way round, JupyterLite's worker at `/`
would replace Workbox's and lose the precache.

So there is one worker, and the relay goes into it:

- [`public/lite-service-worker.js`](../../public/lite-service-worker.js)
  is the relay part of JupyterLite's worker, rewritten as a plain script
  (no cache; Workbox caches). Its fetch listener answers only `POST`s to
  `api/drive` and `api/stdin/*` at this origin and leaves everything
  else alone.
- Production build: `workbox.importScripts` in
  [`vite.config.ts`](../../vite.config.ts) puts
  `importScripts("lite-service-worker.js")` at the top of the generated
  `sw.js`, before Workbox's own listeners. Still `generateSW`; no
  `injectManifest` worker to maintain.
- `npm run dev` has no Workbox worker (`devOptions` is off), so the page
  registers the relay alone at `/`, where it also skips waiting and claims
  clients as Workbox's does. It checks `self.define` (set by Workbox's
  loader) to tell the two apart.
- [`src/lib/lite-sw.ts`](../../src/lib/lite-sw.ts),
  `ServiceWorkerBridge`, is the page side: `ServiceWorkerManager`
  without `@jupyterlite/apputils`, which would bring JupyterLab's
  application packages along. Drive requests go to `DriveContentsProcessor`
  (from `@jupyterlite/services`, already a dependency) over the in-browser
  contents manager, stdin to `LiteKernelClient.handleStdin`. `lite.ts`
  creates it with the lite backend and disposes it when the backend is
  switched.

The JavaScript kernel has no file system and no `input()`, so nothing in
it uses the relay by itself. Its Worker gets `globalThis.jupyterlite =
{ driveUrl, browsingContextId }` (set in `onRuntimeReady`), what JupyterLite
hands its Pyodide kernel, so cell code can make the same requests DriveFS
makes; a Worker cdp-kernel would pass them to its own DriveFS.

Trade-offs: the relay is in the worker in Ganymede mode too, idle (Jupyter
servers have no `api/drive`). A relayed request no page answers (the page
closed mid-request) hangs until the browser gives up, as in JupyterLite.
JupyterLite's 20-second heartbeat to keep the worker alive is left out:
an open fetch event keeps it alive in Chromium. Only Workers can use the
relay: a synchronous request from the page would block the thread that
answers it.

### `all.json`

The in-browser drive asks `api/contents/<path>/all.json` for seed files
only when PageConfig's `contentsAllJsonFile` option names one.
jupyter-react set it; since #15 nothing sets PageConfig, so the request
is gone. A comment in `lite.ts` says why it must stay that way. Setting
the option to empty explicitly would need `@jupyterlab/coreutils` as a
direct dependency, for no change in behaviour.

### Checked

`npm run check`, `npm test`, `npm run build`. In Chromium (Playwright),
both `npm run build && npm run preview` and `npm run dev` (with
`ganymede serve` behind the proxy): "This browser", new notebook, `6 * 7`
gives 42, then a cell in the kernel's Worker that posts synchronously to
`driveUrl`:

```
readdir: ["Untitled.ipynb"]
Untitled.ipynb starts with "{\"metadata\":{\"kernelspec\":{\"name\":\"javas"
readdir after put: ["Untitled.ipynb","from-kernel.txt"]
```

Each `POST /api/drive` was answered with `fromServiceWorker=true`; no
other `/api/` request left the page (no `all.json`), and the console has
no service-worker warning. Preview: one registration, `sw.js` at `/`,
which controls the page from the first visit; the precache holds 155
entries (159 in the manifest, four of them duplicate icons), and with the
network off a reload brings the app back. Dev: one registration,
`lite-service-worker.js`. The e2e suite (merged in temporarily from the
e2e branch) passes, 6 of 6.

### Not done

- No stdin demonstration: the JavaScript kernel never sends
  `input_request`. The path is wired the way JupyterLite wires it.
- Under `npm run dev` the browser console shows Vite's "Module fs (path,
  source-map-js, url) has been externalized" warnings, from postcss
  pre-bundled with `sanitize-html`; they are not from this change.
