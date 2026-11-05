## 2026-11-05, close device dialogs when the kernel page goes (ganymede-device#21)

`KernelHost` now keeps its `DeviceBridge` and calls `dropAll()` when the
hidden kernel web view starts a navigation (a reset or reload) or its web
content process ends. A new kernel page's call ids start over, so a
dialog, picker or sound left from the old page could otherwise be
answered to the wrong call, or stay on screen with nothing waiting for
it (ganymede-device docs/protocol.md, "The path today").
