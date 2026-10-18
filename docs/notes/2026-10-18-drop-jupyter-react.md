## 2026-10-18, drop jupyter-react (#9)

Replaced `@datalayer/jupyter-react` with JupyterLab's own packages used as
libraries, all on the 4.6 line that matches `@jupyterlab/services` 7.6
(pinned exactly: notebook, rendermime, codemirror, apputils 4.7.4,
the javascript, json, markedparser and mathjax extensions, the light and
dark themes), plus JupyterLite 0.8 directly for the in-browser backend
and `@jupyter-widgets/jupyterlab-manager` 5 for ipywidgets.

### What was done

- [`src/lib/jupyterlab.ts`](../../src/lib/jupyterlab.ts) builds what
  JupyterLab's plugins would: the CodeMirror language, theme and extension
  registries (with the Yjs binding that ties editors to cell models), the
  rendermime registry with the standard renderers, the marked Markdown
  parser, MathJax and the JavaScript and JSON MIME extensions, the cell
  executor, and a Lumino `CommandRegistry` with JupyterLab's default
  notebook shortcuts (Shift+Enter, Ctrl/⌘+Enter, Alt+Enter, Esc/Enter,
  A, B, DD, M, Y, R, X, C, V, Z, J/K and arrows).
- [`NotebookPane`](../../src/components/NotebookPane.tsx) still loads the
  file with `contents.get` and saves `model.toJSON()` with
  `contents.save` (nbformat in, nbformat out), now into a `NotebookModel`
  shown by JupyterLab's `Notebook` widget, attached with
  `Widget.attach`. The session is an apputils `SessionContext` with the
  file's path and name: `initialize()` rejoins the session `findByPath`
  finds or starts one with the kernel the file names, so there is one
  session per notebook named by path, without the old rename. Kernel
  `language_info` is copied into the notebook metadata on each kernel
  change (as `NotebookPanel` does), which sets the editors' language.
  Run, Run All and insert go through `NotebookActions`, so the toolbar no
  longer needs jupyter-react's store.
- [`src/lib/lite.ts`](../../src/lib/lite.ts) assembles JupyterLite's
  in-page server by hand from `@jupyterlite/services` (what
  `@jupyterlite/services-extension`'s plugins do): `LiteKernelClient`,
  `LiteSessionClient`, `LiteKernelSpecClient`, `KernelSpecs`, a
  `BrowserStorageDrive` on localforage, mock-socket for the kernel
  websockets, and local user and event managers so nothing calls the
  server. The kernel is `@jupyterlite/javascript-kernel` in a Web Worker,
  registered as `javascript` with jupyter-react's storage name, so
  notebooks made with the old build still open.
- [`src/lib/widgets.ts`](../../src/lib/widgets.ts), its own chunk:
  `KernelWidgetManager` (the manager JupyterLab uses for consoles; the
  notebook one needs a document context) per kernel, base, controls and
  output widgets registered, the widget-view renderer swapped into the
  notebook's rendermime. An `IntSlider` from ipywidgets 8.1 renders.
- [`src/lib/theme.ts`](../../src/lib/theme.ts) injects JupyterLab's light
  or dark `--jp-*` variables following the system appearance; the shell's
  overrides in `jupyter.css` are unchanged apart from the container
  selector.
- `vite.config.ts`: dropped `treatAsCommonjs`, the `*.raw.css` and
  `?text` plugins, the `.whl` loader and `__webpack_public_path__`
  (nothing imports those any more). Kept, with comments: the
  `@jupyter-widgets/controls` version inline, `__dirname` for MathJax,
  `global` (mock-socket, localforage, backbone read it), and the `~`
  alias (MathJax's font CSS). Added a plugin that imports JupyterLab's
  SVG icons as strings, as webpack does. PageConfig is no longer touched:
  only jupyter-react needed it.

### What broke, and the fixes

- `@jupyterlite/javascript-kernel` 0.4.0-alpha.4 and alpha.5 are
  published without `lib/comm.js` and `lib/widgets.js`, which their own
  modules import. Pinned alpha.3 (the latest that's complete), with an npm
  override so it uses `@jupyterlite/services` 0.8.6; its kernel API is
  the same as 0.7's.
- `@jupyter-widgets/jupyterlab-manager`'s `^4.0.0` ranges pulled
  `@jupyterlab/console`, `mainmenu` and `logconsole` 4.5.11 and a second
  `@jupyter/ydoc`. Overridden to 4.6.4; no JupyterLab, Lumino or ydoc
  package is duplicated now.
- Switching backends crashed the app ("Widget is not attached"): React
  removed the pane's node before the effect detached the widget. Then,
  detaching inside React's commit made JupyterLab's React-based collapsers
  unmount their roots mid-render. The widget now sits in a holder node
  that is parked off-screen when the pane unmounts and is disposed after
  the commit.
- `@jupyterlab/mathjax-extension/style/index.js` imports JupyterLab's
  whole application stylesheet, Font Awesome included (2 MB of fonts, 1.8
  MB of them precached SVG fonts). Import only its `base.css`, and
  precache SVGs only from `icons/`.
- `npm run dev`: the in-browser kernel works now (it didn't with
  jupyter-react). The kernel package is excluded from pre-bundling so its
  `new URL('./worker-runtime.js', import.meta.url)` still finds the
  file, with its dependencies pre-bundled. MathJax's CommonJS modules,
  reached through dynamic imports, came back without named exports when
  bundled into the extension; pre-bundled on their own they work.

### Bundle

From `npm run build`:

| | before | after |
|---|---|---|
| main chunk | 3,512.66 kB (934.11 kB gzip) | 2,075.19 kB (591.09 kB gzip) |
| precache | 203 entries, 8,327.07 KiB | 158 entries, 5,317.08 KiB |

The in-browser server (`lite`, 306 kB), ipywidgets (`widgets`, 223 kB)
and MathJax are separate chunks.

### Checked

`npm run check`, `npm test`, `npm run build`. The production build
(`vite preview`) against `ganymede serve` 0.2.0 with ipykernel and
ipywidgets 8.1.9 in a venv, driven by Playwright in Chromium, light and
dark: open a Python notebook (Markdown with math rendered, "Edited" not
shown on open), Run All (stdout stream, `execute_result`, `text/html`,
a `ZeroDivisionError` traceback, an ipywidgets slider), edit, Ctrl+S,
reload: the edit is there and the same session (one, named by path) is
rejoined. Esc, B, Enter, Shift+Enter from the keyboard; Restart. Then
"This browser", new notebook, JavaScript in the Worker, save, reload:
reopened from IndexedDB with its output. The same run passes under
`npm run dev`. The e2e suite from #13 (cdp-kernel, TypeScript) passes
against this build.

### Not done

- Font Awesome is not loaded, so ipywidgets that show icons (a `Button`
  with `icon=`) show none. Widget state is not saved into the notebook.
  The JavaScript kernel ignores widget comms (alpha.3 has no comm
  support).
- No completer or tooltip (jupyter-react had JupyterLab's), no find, no
  cell toolbar, no trust prompt: outputs loaded from a file render as
  untrusted, as in JupyterLab, until the cell runs again.
- Console noise from upstream: Yjs "Invalid access" and "Not same Y.Doc"
  warnings while `@jupyter/ydoc` builds cells (also there before), and a
  rejected `create_subshell_request` from `@jupyterlab/services` when a
  kernel with open widget comms is restarted or its connection disposed.
- JupyterLite's service worker (kernel file-system sync) is still not
  served.
- The main chunk is still 2 MB: all of JupyterLab's notebook,
  apputils and ui-components. Not looked into further.
