## 2026-10-18, unit tests (#7)

Unit tests for the app in `src/`, with Vitest 4.1 (which supports Vite 7)
in jsdom 29 and Testing Library (`react`, `dom`, `user-event`,
`jest-dom`), all pinned exactly. `npm test` runs them and then the client
package's `node --test` suite; `npm run test:coverage` adds a V8 coverage
table and summary (and an HTML report in `coverage/`, ignored by git).

### What was done

- [`vitest.config.ts`](../../vitest.config.ts) is separate from
  `vite.config.ts`, so the PWA, SVG and MathJax plugins stay out of the
  test run. Test files sit next to what they test (`*.test.ts(x)` under
  `src/`), so `tsc -p .` type-checks them with the app; shared fakes are
  in [`src/test/`](../../src/test/).
- [`backends.test.ts`](../../src/lib/backends.test.ts): the Ganymede
  backend against a fake server (a stubbed `fetch` answering the REST
  calls a `ServiceManager` makes, and a fake `WebSocket` installed before
  `@jupyterlab/services` loads, since it takes the page's at import).
  Checked: base and websocket URLs for the same origin and for another
  server (trailing slashes trimmed, `ws`/`wss`), `credentials`, the token
  on every request's `Authorization` header and on websocket URLs, the
  status check going first and its 401/403/500 errors, and the chip's
  label and detail. The browser backend runs for real: JupyterLite's
  in-page server builds in jsdom (localforage falls back to
  localStorage), offers the JavaScript Worker kernel, and creates, lists
  and deletes a notebook without touching the network. No kernel is
  started (jsdom has no Worker). Saved config: round trip, corrupt entry,
  storage that throws.
- `useColorScheme`, `useSignals` and `useJupyterLabTheme` with
  `renderHook`: a fake `matchMedia`, real Lumino signals, and the real
  theme stylesheets (`test.css` processes the two `?inline` imports).
- Components: `ConnectSheet` (choice, trimmed fields, password and URL
  inputs, the browser choice, error, connecting and cancel states),
  `Sidebar` (over a fake contents manager: listing, hidden files,
  folders, selection, new notebook in the current folder, errors,
  refresh on `fileChanged`, running sessions and shutdown, the backend
  chip), `Toolbar` (every button, disabled states, status labels, kernel
  popup), `EmptyState`, and `App`'s wiring (token in the URL, saved
  backend, failed connection, new notebook with the default kernelspec)
  with `connect` and the pane mocked.
- `NotebookPane` with JupyterLab's real `NotebookModel`, a plain Lumino
  `Widget` standing in for the `Notebook`, and a fake `SessionContext`:
  loading, the session's path and kernel preference (with the fallback to
  the default kernel), the dirty flag after an edit, saving through
  `contents.save`, `changeKernel` writing the kernelspec, the error
  message, and disposal on unmount. `@jupyterlab/notebook` needs
  `DragEvent`, `IntersectionObserver`, `ResizeObserver` and `matchMedia`
  stubs just to load in jsdom.

No change to `src/` was needed: every seam was already there (the
`ServiceManager.IManager` interface, the controller object, props).

### Found

- The sidebar's sort only orders folders first and same-type entries by
  name; a notebook and a plain file compare equal, so their order is the
  server's (and the comparator isn't transitive). The test doesn't pin it.
- The server field's only check is the browser's `type="url"`; there is
  no app-level validation to test.
- `ServerConnection.makeSettings` replaces `init` wholesale, so the
  Ganymede backend's `{ credentials }` drops the default
  `cache: 'no-store'` and requests carry no cache buster. Noted, not
  changed.

### Coverage

`npm run test:coverage`: 62 tests in 10 files; 66.6% statements, 80.1%
branches, 64.5% functions, 69.9% lines. `backends.ts`, `theme.ts`,
`useColorScheme.ts`, `useSignal.ts`, `ConnectSheet`, `EmptyState`,
`Sidebar` and `Toolbar` are at 100% of lines.

### Not covered

`src/lib/jupyterlab.ts` (CodeMirror, rendermime, the commands and
shortcuts) and `src/lib/widgets.ts` (ipywidgets) are mocked out: they need
a real kernel and a rendered notebook. So are running cells, the
keyboard, the widget's attachment and parking, and the language-info
sync in `NotebookPane`. Those belong to the end-to-end suite (#13).
