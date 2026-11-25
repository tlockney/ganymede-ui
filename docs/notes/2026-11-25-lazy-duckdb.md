## 2026-11-25, DuckDB loads on first use (#794)

`kernel-modules.ts` called `loadDuckdbFiles()` as it was imported, so
every visit fetched DuckDB's wasm and worker (36 MB) from jsDelivr, even
one that only ran arithmetic, and a load that failed (offline) was kept
as the page's answer until a reload.

Now the page fetches them on the first use of DuckDB: an
`execute_request` whose code names `sql` as a word (`noteKernelRequest`,
called by the in-page kernel in `cdp-kernel.ts` and by the apps' kernel
page in `kernel-host.ts`), the DuckDB console and Parquet view (already
through `openEngine`), or Settings > Offline SQL > Download DuckDB. The
match is generous on purpose: a false one only fetches early. As the page
loads it still reads what an earlier visit cached (`readCachedDuckdbFiles`,
no fetch), so the first kernel finds the files mapped offline.

`loadDuckdbFiles` shares a load in flight and forgets it when it settles;
once the files are mapped it does nothing, and after a failure the next
use tries again. Its state (idle, loading with bytes, ready, failed with a
reason, unsupported) drives the Settings section's progress bar and Try
Again. The browser's Settings sheet is the only place with the button:
the apps open their own Settings, and their kernel page has its own data
store (#557), so it fills on its first SQL.

A kernel's `modules` map is fixed when it starts, so the kernel that ran
the first SQL still loads DuckDB from jsDelivr itself; kernels started
after the files are cached use them. Found while writing the e2e test:
with jsDelivr unreachable, cdp-kernel's `jupyter.sql` prints DuckDB's
worker error but the cell never ends (the engine waits on a worker that
failed to load), so a new kernel is needed after going back online.
That belongs to cdp-kernel.

Tests: `duckdb-files.test.ts` (retry after a failed fetch and after
offline, one load shared, progress with and without a known total, the
start-up read fetches nothing, a use during it fetches, `usesSql` cases),
`OfflineSqlSection.test.tsx`, `kernel-host.test.ts`, and e2e:
`offline-charts.spec.ts` (TypeScript and a chart with every off-machine
request refused, and no DuckDB cache) and `offline-sql.spec.ts`
(Download in Settings, then offline; SQL tried offline, then online in a
new kernel without a reload, then offline again). The three new e2e tests
fail against the old page.
