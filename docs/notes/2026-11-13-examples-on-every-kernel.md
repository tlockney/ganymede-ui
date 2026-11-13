## 2026-11-13, Example notebooks on every kernel (#558)

The examples were written for the apps' browser kernel, and three failed
on cdp-kernel 0.10.0's Node, Deno and Bun kernels: DuckDB started its
WebAssembly build in a classic Worker (Node has no `Worker`, Deno allows
only module workers, Bun hung), and Generative Art and the Widgets
binary-data cell drew on `OffscreenCanvas` (none on Node and Bun; Deno's
has no 2D context).

- DuckDB: the first cell picks the build by `navigator.userAgent`:
  `@duckdb/node-api` on Node, Deno and Bun, duckdb-wasm otherwise. Both
  sit behind `query(sql)` returning columns and plain-object rows, and
  `close()`. The JSON cell loads its rows with `from_json` and `unnest`
  in SQL instead of duckdb-wasm's `registerFileText`. Output on Node
  matches the browser's.
- Generative Art: `makeCanvas` and `show` use `OffscreenCanvas` when it
  draws 2D, else `@napi-rs/canvas`.
- Widgets: the swatch is SVG bytes, so it needs no canvas.
- `scripts/examples-kernels.mjs` runs each source's runnable cells on
  each kernel through `ganymede run --json`, expecting an error only in
  `error` cells, and retries a failed example once, since Wikipedia
  sometimes answers 429 to shared addresses.
- `.github/workflows/examples.yml` runs it (matrix node, deno, bun, on
  ci.yml's e2e pins of ganymede and cdp-kernel) and `examples.mjs --run`
  in Chromium, on PRs and pushes that touch the examples or their
  scripts, and by hand. It is not a required check.
  `scripts/ci-changes.sh` treats the new script and workflow as not
  affecting CI's slow jobs.

Not covered: workerd and celld (no file system, Workers-only APIs, no
native add-ons; the examples aren't aimed at them) and the in-app kernel
in WKWebView, which Chromium's run stands in for.
