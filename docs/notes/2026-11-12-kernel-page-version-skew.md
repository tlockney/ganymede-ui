## 2026-11-12, the kernel page loads the current release's worker first (#521)

The review of #519 noted that `kernel.html` is answered from the active
service worker's precache. After an app update, the first kernel page of
a session could come from the previous release's worker, and nothing
reloaded it when the new worker took control, so a change to the relay
ops would run old page code against new Swift.

Of the two options in the issue, reloading on `controllerchange` is the
one that needs no Swift change, but only before the page says `ready`:
Swift queues starts until then (`AppKernels.pending`), and a reload
after `ready` would end running kernels and lose messages Swift sends
into the reloading page. So the page now calls `registration.update()`
first, and when a worker is installing or waiting it waits for
`controllerchange` (`autoUpdate` activates and claims at once) and
reloads. It gives up after 3 s or on any error and says `ready` anyway,
and a `sessionStorage` flag allows one reload per web view session, so a
worker that never claims can't loop the page. With no controlling worker
(the dev server, tests, the first install) it says `ready` at once, as
before.

The navigation fallback's denylist is now built from the same `PAGES`
map as the build's inputs, so a new page can't be answered with the
notebook app the way #518's `kernel.html?token=` was. The built `sw.js`
carries the same `^\/kernel\.html(\?|$)` pattern as before.

Tests: `src/lib/kernel-page-worker.test.ts` covers no controller, an
update that finds nothing or fails, a new worker claiming the page, the
timeout, and the once-per-session guard. The reload itself needs an
updated app on a device, so it is a by-hand check in #273 and #399.

Review follow-ups: a newer worker that is already activating when the
page's `update()` returns (the notebook page's update ran first) counts
as newer, by comparing the registration's active worker with the page's
controller. Once a newer worker is found, the page waits up to 20 s for
it to install and take control rather than 3 s, and warns in the console
when either wait gives up or the tab already reloaded once, so a device
run can tell which path ran. A newer worker that arrives after `ready`
takes control of the old page at once and drops its precache; that
predates this change and is #534.
