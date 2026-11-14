## 2026-11-14, offline charts in the browser kernel (ganymede#747)

`jupyter.chart` imports vega, vega-lite and linkedom when a cell first
draws a chart. The browser kernel loaded them from esm.sh, so charts
needed a network connection, in the PWA and in the apps' kernel page.

cdp-kernel's browser kernel has a `modules` option (cdp-kernel#491): a
map from an import specifier, as written, to a URL, used before the
CDN. A Vite plugin, `scripts/kernel-modules.ts`, bundles each library
into one ES module with Vite's library build. The build emits them as
`kernel-modules/<name>-<version>.js`, which the service worker
precaches. The dev server bundles each one on first request. The
virtual module `virtual:kernel-modules` gives the page the map, and
`src/lib/cdp-kernel.ts` and `src/kernel-host.ts` pass it to
`startBrowserKernel`.

The three packages are devDependencies pinned to the versions bundled:
vega 6.4.0, vega-lite 6.5.0 and linkedom 0.18.15. Together they add
about 1.7 MB minified to the build. `e2e/offline-charts.spec.ts` blocks
esm.sh and draws a chart. It fails on cdp-kernel 0.11.0, which has no
`modules` option.

`jupyter.sql` still loads DuckDB's worker and .wasm from jsDelivr, so SQL
needs the network.
