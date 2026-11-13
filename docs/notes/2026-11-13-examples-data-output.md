## 2026-11-13, example notebooks use jupyter.table, sql and chart (#602)

With cdp-kernel 0.11.0 bundled (#595), four examples now use its data
helpers instead of building output by hand:

- 01 Start Here shows the moons with `jupyter.table`. The Markdown
  table it replaces is gone; the Kepler line stays as `jupyter.md`.
- 02 Web APIs shows every earthquake of the week in one sortable table,
  not the top eight in Markdown.
- 03 Charts and Diagrams draws its two Vega-Lite charts with
  `jupyter.chart` (no hand-written `vega.View` helper) and adds an
  Observable Plot box plot, which `jupyter.chart` gives a DOM in the
  Worker. d3 and Graphviz stay as they were.
- 04 DuckDB drops the 40-line cell that started DuckDB on each runtime and
  the Markdown table helper: `jupyter.sql` picks duckdb-wasm or
  `@duckdb/node-api` itself, `jupyter.sql.load` reads the CSV and the
  earthquake rows, and the monthly rain chart is a `jupyter.chart` of a
  query's `rows`. A new cell shows a `${value}` as a bound value.

All four were re-run with `examples.mjs --run` (browser kernel) and pass
`examples-kernels.mjs` on cdp-node and cdp-bun. README's examples table
has an Unreleased note until the next release.
