## 2026-11-09, cdp-kernel 0.9.0; pin vite-plugin-pwa and ganymede-device (#453)

Items 8 and 12 of the project read of 2026-11-09
(tlockney/ganymede#629).

- **cdp-kernel 0.9.0** in `package.json`, which is the kernel the app
  runs in the page and so what the apps ship, and in CI's
  `CDP_KERNEL_VERSION`, the kernelspec the e2e job installs. Ganymede
  moved in tlockney/ganymede#622. The app's side needed no change: the
  browser target is the same code as in 0.8.0. What a person will
  notice is in the kernel: a cell can redeclare a name an earlier cell
  declared another way (`let df` after `const df`).
- **`vite-plugin-pwa` is `2.0.0`**, not `^2.0.0`. It was the one
  dependency with a range; the lockfile already had 2.0.0.
- **`@tlockney/ganymede-device` names its commit** in `package.json`
  (`github:tlockney/ganymede-device#1c91ace…`), the one the lockfile,
  `apple/project.yml` and `apple/Package.resolved` already had. Without
  a ref, any `npm install` that rewrote the lockfile could move the web
  side to ganymede-device's `main` while the Swift side stayed put. A
  bump now changes four places that must agree: the ref in
  `package.json`, the `resolved` line in `package-lock.json`,
  `revision` in `apple/project.yml`, and `apple/Package.resolved`
  (`apple/scripts/update-packages.sh`); then
  `node scripts/device-table.mjs --write`.

The whole Playwright suite passed here against a `ganymede serve` built
from Ganymede's `main` with the 0.9.0 kernelspec (53 tests), which
covers the in-page kernel and the Node kernel.
