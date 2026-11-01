## 2026-11-01, device bridge in the apps (#99)

- `KernelHost` registers ganymede-device's Swift `DeviceBridge` (a
  `WKScriptMessageHandlerWithReply` named `device`) on the hidden kernel
  web view's configuration, and nowhere else. The UI web view has no
  `device` handler, so output frames and widgets can't reach it;
  `KernelHostTests` checks both sides.
- The Swift package comes from ganymede-device itself (its root
  `Package.swift`), pinned by revision in `project.yml` since that repo
  has no tags yet.
- In a SwiftPM package, a default argument is evaluated outside the main
  actor, so `init(clipboard: Clipboard = SystemClipboard())` with a
  `@MainActor` type fails to build; ganymede-device takes an optional and
  makes the default inside `init`.
