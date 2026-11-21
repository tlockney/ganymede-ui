## 2026-11-21, Tests for two machine confinement guards (#751)

Follow-up to #749's review. Two guards failed closed but had no test that
failed without them. No production code changed.

- `confinedFetch` takes a `URL` input through `input.href`. The existing
  test passed a `URL` only outside the mount, where a refusal is the
  result either way. A new test passes an allowed `URL` under the mount
  and checks that the underlying fetch receives it; without the branch, a
  `URL` has no `.url` and is refused.
- `createMixedServices` passes the settings' own `WebSocket` to
  `dispatchingSocket`, so a machine's `confinedWebSocket` still guards
  every socket that is not a page kernel's. A new test builds the services
  from `settingsFor` for a machine (with `fetch` stubbed) and opens a
  socket outside the mount through the resulting `serverSettings.WebSocket`
  for a kernel id no page owns, and one on another host, expecting the
  refusal. Without the argument, the browser's `WebSocket` is used and
  nothing is refused.

Both tests are in `src/lib/backends-confine.test.ts`. Each was checked to
fail with its guard removed (the `URL` branch, then the `WebSocket`
argument) and to pass with it restored.

Checks: `npm run check`, `npm test`, `npm run build`.
