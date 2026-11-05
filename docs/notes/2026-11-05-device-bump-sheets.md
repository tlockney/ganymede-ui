## 2026-11-05, device bump: share, pickers, sound (tlockney/ganymede-device#23)

Bumped ganymede-device to 5709759 (#32-#34 there): `device.share`,
`device.preview`, `device.files.pick`/`export`, `device.photos.pick`
and `device.sound`. The three pins move together (`package-lock.json`,
`apple/project.yml`, `apple/Package.resolved`), and
`node scripts/device-table.mjs --write` regenerated the method table.
docs/device.md says how the new methods behave under its existing
**Unreleased.** note. The Mac app isn't sandboxed, so the open and save
panels need no `user-selected` entitlement; the iOS document and photo
pickers need no permission. `scripts/device-table.mjs` now resolves its
Prettier config with `fileURLToPath`, for checkouts under a path with
spaces (review of #289).
