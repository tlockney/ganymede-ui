## 2026-11-03, Device API page (#189)

- `docs/device.md` is the user's guide to the `device` global: where it
  exists, the methods, errors, and why outputs can't reach it. The site
  renders it at /docs/ganymede-ui/device.
- `device` exists only on the iPad and iPhone with no kernel server: the
  Mac app runs kernels as processes (`AppModel.kernels` is always
  `"server"` on macOS), so they never reach `DeviceBridge` (#185).
- The method table mirrors ganymede-device's `src/support.ts` by hand.
  Generating it from that file is in ganymede-device's plan
  ("Documentation"); worth doing once Phase 1 adds methods.
