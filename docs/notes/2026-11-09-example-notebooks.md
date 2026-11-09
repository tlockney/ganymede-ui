## 2026-11-09, Example notebooks bundled with the app (#414)

Seven TypeScript notebooks in `examples/`, copied into a new `Examples`
folder by Open Example Notebooks (empty window, command palette, File
menu on the Mac and iPad). Widgets is held for #417: cdp-kernel's
`jupyter.widget` is anywidget, which the app's widget manager doesn't
render yet.

Everything in them runs in the kernel's Worker, which has no DOM: charts
are SVG text (d3 scales and shapes, `vega.View.toSVG()`, Graphviz in
wasm), art is `OffscreenCanvas` encoded as PNG or JPEG, and UI frameworks
either render to a string in the kernel or run in a trusted HTML
output's sandboxed frame. DuckDB's Worker is started from a Blob that
`importScripts` the jsDelivr bundle, since a Worker's script must be
same-origin.

Two data sources didn't work from duckdb-wasm and were swapped: jsDelivr's
CSV (served compressed, so the sniffer saw one column) and
shell.duckdb.org's Parquet (no `Content-Length` on HEAD, which range
reads need). The sources are raw.githubusercontent.com and
blobs.duckdb.org.

The notebooks are built from Markdown sources by `scripts/examples.mjs`,
which runs them in headless Chromium for their outputs and collects
ipywidgets models from `comm_open` into `metadata.widgets`. Copies mark
each code cell `trusted`, so the server signs them on save and the
browser's storage keeps the flag; outputs render without Trust Notebook.
The device notebook is saved without outputs, since its answers depend
on the device.

The browser's storage hands a notebook to the page with its multiline
strings still split into lines, where the server joins them. Rendered
that way an SVG or HTML output came out joined by commas, and Graphviz's
SVG, which starts with an XML prolog, didn't draw at all. This hit any
notebook dropped into browser storage from elsewhere, not only these.
The notebook view now joins them as the Quick Look preview already did
(`rejoinLines`, moved to `rejoin-lines.ts`).
