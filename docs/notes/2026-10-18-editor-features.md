## 2026-10-18, editor features (#14)

What JupyterLab's completer, tooltip, document search and cell toolbar
extensions add to a notebook, plus a trust action and the two ipywidgets
gaps left by [the switch to JupyterLab's packages](2026-10-18-drop-jupyter-react.md).
All wired by hand, without the plugin system or the settings registry, and
pinned on the 4.6 line: `@jupyterlab/completer`, `tooltip`,
`documentsearch`, `cell-toolbar` 4.6.4 (and, now imported directly,
`cells`, `codeeditor`, `ui-components` 4.6.4, `coreutils` 6.6.4,
`observables` 5.6.4, `@jupyter/web-components` 0.16.7,
`@lumino/coreutils` 2.2.3, `@lumino/messaging` 2.0.5), and
`@fortawesome/fontawesome-free` 5.15.4. No override was needed: nothing
from JupyterLab, Lumino, ydoc, CodeMirror or FAST is duplicated.

### What was done

- [`attachEditing`](../../src/lib/jupyterlab.ts) adds commands and
  JupyterLab's key bindings to each notebook's registry:
  - **Completion**: one `CompletionProviderManager` for the app with the
    kernel provider (`complete_request`) and the context provider (words in
    the notebook), as completer-extension registers them, 1 s provider
    timeout. Each notebook points it at the active cell's editor and the
    session. Tab in edit mode (`.jp-mod-completer-enabled`) invokes it,
    Enter picks; a single match is inserted directly.
  - **Inspection**: Shift+Tab sends `inspect_request` at the cursor and
    shows the reply in JupyterLab's `Tooltip` (tooltip-extension's
    selector, so not in leading whitespace or a selection); Escape or any
    key dismisses it.
  - **Find**: Accel+F opens documentsearch's bar (`SearchDocumentView`)
    over the notebook's own `NotebookSearchProvider`, built on first use.
    The provider and the cell toolbar want a `NotebookPanel`, which needs a
    document context; they only read `content`, `model`, `id` and
    `revealed`, so they get an object with those. Enter / Shift+Enter in
    the bar or Accel+G / Shift+Accel+G step through matches, Escape closes
    it and gives the notebook focus back. The bar sits next to the
    notebook (it scrolls itself), under the translucent toolbar.
  - **Cell toolbar**: `CellToolbarTracker` with a factory instead of the
    settings registry, giving JupyterLab's default items: duplicate, move
    up, move down, insert above, insert below, delete.
- **Trust**. A code cell with outputs that isn't trusted (the file wasn't
  signed) makes the controller report `trusted: false`, and the toolbar
  shows a Trust Notebook button (shield). After a confirm, every cell is
  marked trusted in the model (`NotebookActions.trust` without its dialog),
  which re-renders the outputs in full; the dirty flag is left as it was.
  For Ganymede, `trustNotebook` in
  [`backends.ts`](../../src/lib/backends.ts) then sends
  `POST /api/contents/{path}/trust` (201, as jupyter_server), so the file
  opens trusted next time; unsaved changes get signed by the next save,
  since every cell is trusted. The browser backend has no signatures:
  trust lasts as long as the open notebook.
- **ipywidgets**. [`fontawesome.css`](../../src/styles/fontawesome.css)
  loads the Font Awesome JupyterLab ships (Free 5.15.4 with the v4 shims,
  for ipywidgets' v4 icon names), imported by `widgets.ts`, so it comes
  with the widgets chunk. Only the WOFF2 fonts: `all.min.css` would make
  the build emit five formats of each. The fonts are left out of the
  precache and cached by the service worker on first use (`CacheFirst`),
  since only notebooks with icon widgets fetch them. On save,
  `attachWidgets(...).saveState` writes the live widgets into
  `metadata.widgets["application/vnd.jupyter.widget-state+json"]`, as
  JupyterLab's notebook manager does with "Save Widget State
  Automatically" on (`get_state_sync({ drop_defaults: true })`). A
  notebook with no widgets and no saved state is left without the key.

### What broke, and the fixes

- The cell toolbar overflowed the stack (tens of thousands of
  `RangeError`s while moving between cells). Its `jp-toolbar` derives its
  fill color from its parent's when it connects; with JupyterLab's theme
  tokens applied, a parent below `<body>` that has no FAST design-token
  node yet gets one created mid-derivation, and the bindings recurse.
  Reproduced with bare `jp-toolbar` and `jp-button` elements in a page
  with only `@jupyter/web-components` and the light theme. Resolving the
  input area's `fillColor` before the tracker attaches the toolbar
  avoids it.
- The completer popup was 8 px tall and hidden: it sizes itself to the
  `.jp-MainAreaWidget > .lm-Widget` around the editor, else to the editor.
  The notebook's holder now carries `jp-MainAreaWidget`, as in JupyterLab.
- `jupyter.css` hid every `.jp-Toolbar` in the notebook, the cell toolbar
  included; it now spares `.jp-cell-toolbar`.
- `SearchDocumentView` re-renders on every search-state change, even
  closed, into a new React root on its detached node; one such render,
  pending when the notebook closed, ran against the disposed model. A
  small subclass renders only while attached.

### Bundle

From `npm run build`:

|             | before                       | after                              |
| ----------- | ---------------------------- | ---------------------------------- |
| main chunk  | 2,075.19 kB (591.09 kB gzip) | 2,200.14 kB (622.72 kB gzip)       |
| widgets CSS | 44.72 kB                     | 126.09 kB (Font Awesome's classes) |
| precache    | 158 entries, 5,317.08 KiB    | 158 entries, 5,527.17 KiB          |

Each feature's share of the main chunk, from builds with it stubbed out:
completer and tooltip 60.6 kB (16.2 kB gzip), find 52.4 kB (11.9 kB gzip;
the notebook package already brought in the search provider's base, the
rest is the bar and its model), cell toolbar 6.1 kB (1.5 kB gzip;
JupyterLab's `Toolbar` was already bundled). The full search UI is cheap
enough that a minimal equivalent wasn't worth writing. The Font Awesome
fonts (168 kB of WOFF2) are not precached.

### Checked

`npm run check`, `npm test` (83 tests in 12 files; new:
[`jupyterlab.test.ts`](../../src/lib/jupyterlab.test.ts) runs
`attachEditing` on a real `Notebook` with CodeMirror in jsdom against a
fake kernel: key bindings, `complete_request` and `inspect_request` at
the cursor, the tooltip, the find bar, the cell toolbar's buttons;
[`widgets.test.ts`](../../src/lib/widgets.test.ts) for the manager per
kernel and the saved state; trust in the pane, the toolbar and the
backend), `npm run build`. The production build (`vite preview`) against
`ganymede serve` 0.2.0 with ipykernel 7.4 and ipywidgets 8.1.9 in a venv,
driven by Playwright in Chromium: Tab after `ganymede_r` shows the
popup and Enter inserts `ganymede_radius_km`; `moons.` + Tab lists the
list's methods, ArrowDown + Enter inserts one; Shift+Tab after `print(`
shows its signature and docstring, Escape dismisses it and stays in edit
mode; Ctrl+F, typing "Ganymede" highlights 5 matches across code and
Markdown, Enter steps 4/5 to 5/5, Escape closes the bar and clears the
highlights; the cell toolbar's move down, duplicate and delete work; an
unsigned notebook's HTML output renders sanitized (its `<script>` doesn't
run), Trust Notebook posts the trust request (201), the script runs, the
button goes, the file isn't marked edited, and after a reload the server
serves it trusted; a `Button(icon='check')` shows its check mark in
Font Awesome; Ctrl+S writes the button, slider, layout and style models
into the file's widget state; no page errors. In dark mode on the browser
backend: find, and Tab completing `moons` from the context provider (the
JavaScript kernel answers no completions). The e2e suite from #13 passes
against this build.

### Not done

- Widget state is saved but not restored from the file when no kernel has
  the widgets (JupyterLab's notebook manager does; the console manager
  the app uses doesn't).
- No trust indicator beyond the button, and no "untrust".
- Find has no replace-in-outputs or search-in-selection key binding (the
  bar's own toggles work); completion has no documentation panel and no
  continuous hinting (both off by default in JupyterLab too).
