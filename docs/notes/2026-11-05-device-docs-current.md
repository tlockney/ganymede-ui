## 2026-11-05, Device docs current with what's merged (#316)

- Checked the device docs against ganymede-device's merged PRs.
  `docs/device.md` was current: every merged method reads "yes" in the
  app column, with an Unreleased note since 0.3.0 had only Phase 0. Its
  "planned" cells are the Remote kernel and Browser columns, which
  aren't built (ganymede-device#26).
- `architecture.md` still named `hello` and the clipboard as all
  `device` has; it now points to `device.md` for the list, so it
  doesn't go stale again.
- ganymede-device's README and plan.md had the same lag
  (ganymede-device#43).
