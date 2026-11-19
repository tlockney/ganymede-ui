## 2026-11-19, TypeScript in the in-app kernel (#668)

Item 2 of #663. cdp-kernel 0.14.0's browser target takes a `typescript`
option (cdp-kernel#524: `createWorker`, `module`, `libs`, `runtimeTypes`),
and runs the language service in a Worker of its own that fetches
TypeScript on the first request for typed help. This change gives it the
files and turns it on for both browser kernels: the Apple apps' kernel
web view (`src/kernel-host.ts`) and the in-browser backend
(`src/lib/cdp-kernel.ts`).

`scripts/kernel-typescript.ts` is a Vite plugin like `kernel-modules.ts`.
`virtual:kernel-typescript` exports three URLs; the build emits the files
under `kernel-typescript/`, named by version
(`typescript-6.0.3/typescript.js`, `typescript-6.0.3/lib/lib.*.d.ts`,
`cdp-kernel-0.14.0/runtime/*.d.mts`), and the dev server serves them from
`node_modules`. The lib files are the ones `lib.esnext.d.ts` reaches by
its `/// <reference lib>` lines (87 in 6.0.3, itself included), the
same walk the Worker makes, so `lib.dom` and `lib.webworker` (3 MB)
aren't shipped. 104 files, 9.7 MB, 1.8 MB zipped.
`src/lib/kernel-typescript.ts` makes the option.
`typescript` was already a dev dependency at 6.0.3; nothing new is added,
but its `lib/typescript.js` now ships in the build.

The service worker doesn't precache `kernel-typescript/` (9 MB for every
visitor otherwise); a `CacheFirst` route keeps the files once a notebook
has fetched them. The Apple apps copy `dist` whole
(`apple/scripts/bootstrap.sh`), so the files are in the app and served by
its in-process server; the Worker reads them as text, whatever their
content type.

Found by the e2e: type errors in the browser kernel showed only some of
the time. The first checks go out while TypeScript is loading, the kernel
answers `null` ("can't tell"), and nothing asked again until the next
edit. `type-errors.ts` now asks again after a null, after 1 s, doubling
to 8 s, at most six times (about half a minute), and starts over with an
edit. That helps the Node kernels too, which also answer null while their
TypeScript installs on first use.

Not measured here: first-answer time and memory on an iPhone, which the
issue asks for; that is a by-hand item in #273.
The engine question (WKWebView's worker now, jitless V8 later, ui#273 V8
spike) is left to that measurement.
