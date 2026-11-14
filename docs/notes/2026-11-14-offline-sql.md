## 2026-11-14, offline SQL in the browser kernel (#614)

`jupyter.sql` in the browser kernel loads DuckDB's module from esm.sh,
and its wasm and worker from jsDelivr, so SQL needed a network
connection. Thomas asked whether the app can pre-fetch the wasm build,
and picked pre-fetch over shipping the files in the app.

DuckDB's module is 200 kB bundled, so `scripts/kernel-modules.ts`
bundles it next to the chart libraries. The service worker precaches it
as before.

The wasm (36 MB) and its worker (0.8 MB) don't ship. `src/lib/duckdb-files.ts`
opens a Cache Storage cache named for the DuckDB version. If both files
are there, it reads them into blob URLs and adds them to the kernel's
`modules` map, under cdp-kernel's `SQL_MODULES` specifiers
(cdp-kernel#495). If they are missing, it fetches them from jsDelivr,
worker first, and maps them once both arrive. The kernel's Worker can't
read the page's cache, which is why it gets blob URLs. Only the `eh`
variant is cached, since every browser the apps run in supports wasm
exceptions; the `mvp` variant stays on jsDelivr.

The lookup starts when the page loads. A kernel that starts before it
settles uses jsDelivr. In the apps, the in-app server keeps its port
between launches, so the page's origin, and with it the cache, persist.

`e2e/offline-sql.spec.ts` serves jsDelivr from the package's own files,
waits for the cache to fill, then blocks esm.sh and jsDelivr and runs a
query. It fails when the files aren't mapped.

DuckDB extensions that aren't built in, and queries over remote files,
still need the network.
