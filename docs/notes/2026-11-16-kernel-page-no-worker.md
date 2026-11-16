## 2026-11-16, the kernel page has no service worker (#645)

Removed the kernel page's service-worker checks from #528 and #537
(`src/lib/kernel-page-worker.ts`: the update check, the `release.json`
comparison, the once-per-session reload) and the `release-file` Vite
plugin that emitted `release.json`, whose only reader they were. They
guarded a page that the notebook page's worker served from its precache,
which stopped being true when #557 gave the kernel web view its own data
store: worker registrations are per store, only the notebook page
registers one, so nothing controls `kernel.html`. The checks saw no
controller and said ready at once. #534, the stale-precache case after the
page's worker was replaced, is closed by the same change.

The page and its files come from the app's in-process server, which serves
the release the app was built with. They differ from the server only after
the app restarts, and a restart reloads the page. So nothing replaced the
checks: `src/kernel-host.ts` posts `ready` as it loads. `VITE_RELEASE` stays,
for crash reports. `docs/architecture.md` says this instead of the old
mechanism, and the comment on `AppKernels.kernelPageURL` no longer says a
worker controls the page.

`KernelHostTests.testNoServiceWorkerControlsTheKernelPage` registers a
worker with scope `/` in a notebook page on the default store, checks it
controls that page, then checks the kernel web view, on the same origin,
has no controller. It guards #557's separate store: sharing it again would
let the notebook page's worker control the kernel page. It is skipped where
the web view has no service workers.
