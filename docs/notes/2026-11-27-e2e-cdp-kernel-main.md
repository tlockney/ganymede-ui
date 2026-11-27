## 2026-11-27, e2e against cdp-kernel main (#840)

The v0.17.0 round found two broken e2e specs only when the release pull
request pinned cdp-kernel 0.16.0: `interrupt-reset` had skipped itself
while the pin lacked `state_reset`, and `offline-sql` assumed a hang that
cdp-kernel#539 had removed. Nothing ran the app against the kernel's
`main` in between.

`.github/workflows/e2e-cdp-kernel-main.yml` now does, weekly (Monday
06:41 UTC) and on `workflow_dispatch`. It clones cdp-kernel's `main`,
writes the commit to the run's summary, `npm pack`s it, and installs the
tarball twice: globally for the server's `cdp-node` kernel, and with
`npm install --no-save` over the pin so `npm run build` bundles it as
the page's browser kernel. A check stops the run if npm kept the
registry's copy. Ganymede is the version ci.yml's e2e job pins, read
with `yq` as examples.yml does. Specs that skip on the pinned kernel
detect what the installed one sends, so they run here once `main` has
it.

It is its own workflow, not a ci.yml job: ci.yml is what release.yml
calls and what pull requests run, and a kernel change that isn't
released must not block either. It uses only ubuntu runners.
Playwright's `--global-timeout` (20 minutes) ends a hanging suite as a
failure before the job's 30-minute timeout would end it as cancelled,
which sends no failure notice. docs/releasing.md says to check its
latest run before a round moves the cdp-kernel pin.

Run locally on 2026-11-27 against cdp-kernel main 6413f7f with Ganymede
0.17.0: 139 passed, including both interrupt-reset tests.
