## 2026-11-09, Bluetooth in the apps (#427)

ganymede-device's Phase 3 added a Bluetooth LE central
(ganymede-device#100): `device.bluetooth.scan`, `known` and `connect`,
and a `Peripheral` handle with services, read, write, notify and RSSI.
It is off until the app calls `addBluetooth()`, so `KernelHost`'s
default bridge now does. It asks for the `bluetooth` permission, which
needs `NSBluetoothAlwaysUsageDescription` in both apps' Info.plists:
without it Core Bluetooth ends the app when its manager is made, so the
bridge reports the permission undetermined and calls are denied. The
hardened runtime has no Bluetooth entitlement; the usage string is all
a Mac app outside the sandbox needs.

The pins move to ganymede-device's main, docs/device.md's table is
regenerated and "Methods behind a permission" lists `device.bluetooth`.
`KernelHostTests`' `hello` list adds the bluetooth methods and streams,
and its declared-at-open check uses `motion`, which a Mac lacks, in
place of `bluetooth`, which the app now has.

By-hand checks are on #399 (Mac) and #273 (iPad, iPhone).
