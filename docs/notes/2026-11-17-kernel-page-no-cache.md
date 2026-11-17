## 2026-11-17, the kernel page always loads from the server (#647)

The kernel web view's data store is persistent (#557) and the app reuses
its port, so the origin is the same across launches. The server serves
`kernel.html` and `/assets/*` through `ServeDir`, which sends
`Last-Modified` but no `Cache-Control`, so WebKit's heuristic freshness
could serve a cached `kernel.html` on the first launch after an update:
the old release's page talking to the new Swift (#521).

`AppKernels.kernelPageRequest` builds the request that loads the page with
`cachePolicy: .reloadIgnoringLocalCacheData`, so the page is always fetched
from the server. `.reloadRevalidatingCacheData` was the first idea, but
WebKit maps it to the same full reload, and Foundation marks it
unimplemented, so the code names what actually happens. Only the page's
own load uses this policy: its hashed `/assets/*` and what cells import
load as subresources with normal caching.

`toPage` is the one place that loads the page, and a restart after the
page's process ended (`kernelPageEnded`) goes through it again.
`KernelHostTests.testKernelPageRequestSkipsTheCache` checks the helper's
URL and cache policy; the call site itself is covered only by the
by-hand check added to the Mac checklist, #399 (Web Inspector on the
kernel web view after an update on the same port: `kernel.html` from the
network, `/assets/*` from the cache).
