## 2026-11-19, Data files open in a data view (#671)

CSV, TSV, JSON and Parquet files open in the page, not the text editor: `DataPane` for the path, chosen by `dataKind` (`src/lib/data-files.ts`) in `App.tsx`, as a notebook is. The Swift sidebars route the same extensions through `page.run("open")` (`FolderEntry.opensInPage`, `PageState.Search.Match.opensInPage`); the two extension lists must match.

Notes:

- The table is `RenderedTable` (table-output.ts) with the filter box outside it, which re-renders the model with the matching rows, so a new filter resets the sort. Types are inferred over the loaded rows: integer, number, boolean, else string. Digit strings with a leading zero or a `+` (zip codes, ids) stay text; integers past 2^53 stay text, which the table's sort compares exactly.
- The CSV parser is ours (about 100 lines, tested) rather than a package: no new dependency. A quote only starts a quoted field at the start of a field, so `5" pipe` is text, as spreadsheets read it.
- A Ganymede server's `files/<path>` is read as a stream and cancelled at the cap (8 MB for CSV and TSV, then the cut record is dropped); JSON (16 MB) and Parquet (64 MB) can't be cut, so a file over the cap says so. The in-browser backend has only the contents API, which sends the whole file.
- Parquet runs through the duckdb-wasm module the page already serves for the browser kernel and the wasm and worker `duckdb-files.ts` caches, in a worker of its own started on the first Parquet file and ended with the view. Columns with no plain JavaScript value (decimals, wide integers, dates, lists) are cast in SQL. `parquet.test.ts` runs the real package's Node build.
- Lumino refuses to detach a widget whose node React already removed, so the widget is made and disposed in a layout effect.
- Not done: Finder opens of data files (the app claims only `.ipynb`), data files in Recents, editing in the table, and drag and drop of data files into the window.
