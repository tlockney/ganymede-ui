## 2026-11-28, Mac menu bar extra (#924)

Second step of tlockney/ganymede#965 §4: a macOS `MenuBarExtra` so the app
can be inspected and controlled even when no notebook window is open.

- **Menu bar extra.** `GanymedeApp` adds a `#if os(macOS)` `MenuBarExtra`
  (`MenuBarMenu`, icon `book.closed`) with **Open Window**, **Settings…**,
  a **Server** section (background LaunchAgent or embedded server state,
  MCP mode, Tailnet status), a **Running Kernels** section (notebook title,
  kernelspec name, and execution state), and **Quit Ganymede**.
- **Works with no window open.** `MenuBarMenu` reads `@Environment(\.openWindow)`
  and `@Environment(\.openSettings)` directly, and `WorkspaceTabs.focusOrOpen`
  activates the app and focuses an existing tracked window (deminiaturizing
  if needed) or opens a new window on `model.root` when none is open.
- **Pure view-model and controller.** `MenuBar.swift` separates the
  formatting and JSON parsing (`MenuBarKernel`, `MenuBarSnapshot`) and
  polling (`MenuBarController`, behind `BackgroundServerService` and an
  injectable kernel fetcher) from `AppModel`, so `MenuBarTests` exercises
  all server/MCP/Tailnet/kernel states and `/api/sessions` + `/api/kernels`
  parsing without touching `launchd` or starting a server.
- **Live updates.** `ThisMacChecks` now exposes `verifiedServers` (all
  verified bundled helpers, whether or not added as a remote), so `AppModel`
  can report whether the background server is running and query active
  kernels from both the embedded server and any verified background server.
  `MenuBarController` polls every 5 seconds while the app runs and refreshes
  immediately on app activation and when Settings toggles the background
  server.
