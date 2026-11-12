## 2026-11-12, kernel page under the service worker (#518)

In the Mac app 0.10.0 the in-app TypeScript kernel never answered: cells
stayed at Running, and Interrupt, Restart and a kernel change all waited
on it. Since #470 the app loads its hidden kernel page from the embedded
server as `/kernel.html?token=…`. The notebook page's Workbox service
worker controls the same origin (the app reuses its port), and its
precache ignores only `utm_*` and `fbclid`, so `kernel.html?token=…`
missed it and the navigation fallback served `index.html`. The kernel
web view ran the notebook app, which never posts `ready`, so no kernel
started. CI didn't see it: the kernel-host e2e loads the page in a fresh
context with no worker and no query.

The fix is on both sides. The app loads `kernel.html` with no query: the
page makes no API calls, the server serves static files without the
token, and a precache hit works even under a release's old worker, which
stays active until the new one takes over. The worker's navigation
fallback also leaves `kernel.html` alone, so a query can't turn it into
the app again. `served.spec.ts` now loads the kernel page under the
worker, with and without a query.

The hang itself, Restart and a kernel change waiting forever on a kernel
that never started, is a separate problem.
