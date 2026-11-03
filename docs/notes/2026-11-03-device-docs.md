## 2026-11-03, Device API page (#189)

- `docs/device.md` is the user's guide to the `device` global: where it
  exists, the methods, errors, and why outputs can't reach it. The site
  renders it at /docs/ganymede-ui/device.
- `device` exists only on the iPad and iPhone with no kernel server: the
  Mac app runs kernels as processes (`AppModel.kernels` is always
  `"server"` on macOS), so they never reach `DeviceBridge` (#185).
- The method table lists the same methods as ganymede-device's
  `src/support.ts`, but its columns show what ships today. `SUPPORT` lists
  target support (`remote: true`, `browser: "click"`), and neither a
  remote nor a browser host exists yet, so the table says "planned". A
  generator from that file (ganymede-device's plan, "Documentation") needs
  a shipped/target distinction first, or it would print "yes" here.
