## 2026-11-09, Host events in the apps (#425)

ganymede-device's Phase 3 added host events (ganymede-device#98): the
`events.watch` stream behind the cell's `device.on(event, handler)`,
for appearance, foreground, background, battery and locale changes.
Like the Phase 2 namespaces it is off until the app calls
`addHostEvents()`, so `KernelHost`'s default bridge now does. It needs
no permission, entitlement or usage string.

The pins move to ganymede-device's main, docs/device.md's table is
regenerated and gains a "Host events" section, and the `hello` list in
`KernelHostTests` adds `events.watch`.

By-hand checks are on #399 (Mac) and #273 (iPad, iPhone).
