## 2026-11-12, the kernel page compares its release with the server's (#537)

#528 found a stale kernel page by watching the service worker change:
before `ready`, the page asks for an update and waits for
`controllerchange`. A newer worker that activated and claimed the page
after the old worker served `kernel.html`, but before `kernel-host.ts`
ran, left nothing to see: the event had fired with no listener, the
update found nothing, and the active worker was the controller.

The build now writes `release.json` (`{"release": VITE_RELEASE}`). No
`.json` is in the precache's patterns, so the worker passes the request
to the server, and it is fetched with `cache: 'no-store'`. Once the
worker check passes, the page compares that release with its own and
reloads (once per session, as before) when they differ. A missing or
failing answer counts as current, so a server without the file or an
offline start still says ready; a failed fetch warns in the console for
the #273 device run.

Comparing releases on the web side keeps Swift out of it: the app's web
build and its server's `static_dir` are the same build, so the release
the server serves is the app's.
