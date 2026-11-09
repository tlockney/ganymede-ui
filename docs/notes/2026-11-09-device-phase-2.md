## 2026-11-09, Device API Phase 2 in the apps (#422)

ganymede-device's Phase 2 (#57) added the namespaces behind a system
permission: notifications, location, motion, photo saving, camera,
contacts and reminders. Each is off until the app calls its `add…()`,
so this turns them on.

`KernelHost` builds the default bridge with all seven. One the device
lacks stays out of `hello`: a Mac has no motion sensors, and no camera
in the app. Notifications are skipped outside an app bundle, because
`UNUserNotificationCenter` throws there, and the unit tests run in
xctest's runner rather than the app.

The usage strings go in both Info.plists (the camera only on iOS). The
Mac app isn't sandboxed but runs with the hardened runtime, which needs
the `personal-information` entitlements for location, photos, contacts
and calendars (reminders), or the system refuses without asking. The
pins move to ganymede-device's main, and docs/device.md's table is
regenerated.

By-hand checks are on #399 (Mac) and #273 (iPad, iPhone).
