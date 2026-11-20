## 2026-11-20, Developer settings and engine benchmark (#698)

Settings has a Developer area, hidden until General's "Show Developer
Settings" (`SettingsTab.developerKey`, default off) is on: a tab with the
`hammer` icon in the Mac's Settings window, a row on iPad and iPhone
(`DeveloperSettings.swift`, one `Form` for both). The tab kept from an
earlier launch falls back to General while the switch is off
(`SettingsTab.shown(developer:)`), and the page's `settings` message can't
ask for Developer. It holds the engine benchmark and the crash report
tests, which moved out of General's crash report section (the "Test" menu
is now three buttons, disabled with a line saying to turn crash reports on
while they're off; the two crash buttons are destructive).

The benchmark (`EngineBenchmark.swift`, a `@MainActor @Observable` model
shared by the app so results outlive the Settings window) runs the V8
spike's workloads (ganymede `spikes/v8-engine`) twice. V8 goes through
`ganymede_v8_bench_run` (ganymede#892; `_available` says whether the
library has V8, else the table says "Not in this build" and only the
WebKit half runs), called from a detached task because it blocks its
caller while it runs on its own 8 MB-stack thread. The WebKit half is the
spike's Worker page in a web view served from a `bench://` scheme
(`BenchWorkerPage.swift`), shown on screen while it runs so WebKit doesn't
throttle it, with a timeout and an error report for a failed load or a
dead web process. The results file is `[v8, worker]` as the spike's bench
app shares it, with the device, OS and, on the V8 report, the app's
`phys_footprint` before, after and peak, so `node bench/report.mjs` reads
it. The pure parts (config from the manifest, report parsing, the table,
`report.mjs`'s number formats) are in `EngineBenchmarkReport.swift` and
`EngineBenchmarkTests`, so the test bundles build them without the FFI
calls.

The files it loads are vendored in `apple/Resources/Bench`, refreshed by
`apple/scripts/update-bench.sh` (it builds `dist/strip-bundle.js` in the
ganymede checkout); the Mac and iOS app targets bundle them, the
extensions don't, and `check-app-bundle.sh` checks they are there. A
`.gitignore` exception keeps the vendored `dist/` folder. `-lc++` is added
to the targets that link GanymedeFFI, for the V8 inside it.

No `kernel-start`: the spike's page also times cdp-kernel's browser kernel
from `dist/kernel`, but the apps bundle that kernel only inside the Vite
build of `kernel-host.ts` (hashed file names, no standalone `kernel.js`),
so the page here runs just the five workloads, and the vendored `bench.js`
is the spike's without that step.

Size: V8 is now linked into every build of the apps. The spike measured
+18.7 MB in the iOS binary, +6.9 MB compressed. Thomas chose this on
2026-11-20 for the #646 engine decision; if V8 isn't chosen, a follow-up
drops it. The by-hand checks are in #273 (iPad and iPhone) and #399 (Mac:
run once from a hardened-runtime build, since the macOS rusty_v8 library has
the JIT built in and only turns it off at run time).

Review follow-ups: the `bench://` handler reuses Quick Look's
`PreviewResources` (scheme and host are parameters, plus a `response`
helper; the file is now in both app targets) instead of its own file and
type checks. V8 runs on a `Thread` of ours resumed through a continuation,
so it doesn't hold a cooperative-pool thread. The page is only throttled
off screen, so the footer says to keep the screen open, and a run whose
screen or app left the front is flagged in the UI and as `left_screen` in
the reports. Copy Results copies the text; Share shares the file.

`GANYMEDE_REF` moves to v0.14.0, the first ganymede release with the
`ganymede_v8_bench_*` symbols (ganymede#892).

rusty_v8's iOS libraries are built without WebAssembly, but its C bindings
(`v8__WasmModuleCompilation__NEW` and the rest) still call it, so the first
iOS build failed to link. The macOS library has it. A test bundle and the
debug dylib export their globals, which keeps those bindings past
`-dead_strip`; `-Wl,-unexported_symbol,_v8__*` on Ganymede-iOS and
GanymedeTests-iOS lets the linker drop them. Nothing calls them.

Not compiled or run: the container has no Swift toolchain; CI is the first
build. The Worker page's script parses (`node --check`), and
`check-unreleased` and the dev-log check pass.
