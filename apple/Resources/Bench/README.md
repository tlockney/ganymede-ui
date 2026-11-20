Vendored files of the engine benchmark in Settings > Developer (#698).
`workloads/`, `dist/strip-bundle.js` and `web/worker.js` come from
ganymede's `spikes/v8-engine/bench`; `apple/scripts/update-bench.sh`
refreshes them (taken from ganymede commit 246f475). `web/index.html` and
`web/bench.js` are this repo's: the spike's page without its
`kernel-start` step. The app's Mac and iOS targets copy this folder into
the bundle (not the widget).
