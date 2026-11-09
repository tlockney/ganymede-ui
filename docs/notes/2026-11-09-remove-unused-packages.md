## 2026-11-09, remove the client package, the agent spike harness and four screenshots (#451)

Three things nothing used, from the project read of 2026-11-09
(tlockney/ganymede#629, items 1 to 3):

- **`packages/client`.** Jupyter protocol code that came over from
  Ganymede's `frontend/` package. The app never used it: it talks to
  servers through `@jupyterlab/services`, and the in-page kernels go
  through JupyterLite's service worker relay, not a transport built on
  this package. Parts of it were sketches, and `npm test` built it and
  ran its 50 tests on every PR. The history is in git if a Worker
  transport ever wants it back.
- **`packages/agent/spike/` and `vite.spike.config.ts`.** The harness
  that measured the agent's bundle size and probed provider CORS for
  #124. The numbers are in
  [the spike's note](2026-10-31-agent-spike.md); `models.ts` and the
  `agent-*` chunks are what the app builds now.
- **Four `screenshots/reading-*.png`.** Copies from an e2e run that no
  page linked. `e2e/reading.spec.ts` still writes the full set to
  `test-results/screenshots/`.

`npm test` is `vitest run` alone now. The lockfile change is the two
entries for the client package; `npm install --package-lock-only` makes
the same file.
