## 2026-11-28, in-app SQL files (#678)

Made **New Notebook from File** and relative-path `jupyter.sql` queries
work on the in-app (`kernel.html`) and browser (`CdpBrowserKernel`) kernels
without changing the generated `await jupyter.sql.load(name, "file.csv")`
code:

- Added a worker preload (`src/lib/sql-preload.ts`, bundled via
  `scripts/sql-preload.ts` / `virtual:sql-preload` and passed to
  `startBrowserKernel` in `src/kernel-host.ts` and `src/lib/cdp-kernel.ts`)
  that wraps `jupyter.sql`, `sql.query`, `sql.load`, `sql.raw`, and
  `sql.close`.
- On a local data file path (`csv`, `tsv`, `json`, `parquet`), the preload
  announces on `ganymede.sql.files.v1`; the notebook page's responder
  (`attachSqlFiles` in `src/lib/sql-files.ts`, wired into
  `src/components/NotebookPane.tsx`) verifies the page's `clientId`, opens
  a subshell calls comm back (`ganymede.sql.files.v1.calls`), reads the
  file via `readBytes` (up to `limitFor`: 8 MB CSV/TSV, 16 MB JSON, 64 MB
  Parquet) and transfers exact `ArrayBuffer` slices to DuckDB wasm via
  `registerFileBuffer`.
- Parameterized `locate(..., allowParent)` in `src/lib/duckdb-console.ts`
  so notebook queries can resolve relative `..` segments inside the server
  root while keeping the DuckDB console scoped to its folder.
- Added the two review tests from #675 (`readStream` cancel check with
  `whole = true` in `src/lib/data-read.test.ts`, and `PageDocument.update`
  Recents/Spotlight injection test in `apple/Tests/GanymedeTests/PageDocumentTests.swift`).
