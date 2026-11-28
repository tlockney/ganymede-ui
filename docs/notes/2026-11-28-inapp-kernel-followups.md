## 2026-11-28, in-app kernel follow-ups (#469)

Follow-up fixes after registering the in-app TypeScript kernel with the
app's embedded server (#468):

- **Lost-kernel notice in notebooks:** `lostKernelState` in
  `src/lib/state-reset.ts` reads `reason: "lost"` on iopub `status`
  (`restarting` and `dead`). `NotebookPane` surfaces `kernelLost()`
  (`kind: 'kernel-lost'`) with **Restart & Run All** (and the journal-view
  hint when open as a journal) without clearing it on the accompanying
  `restarting`/`autorestarting` transition, and marks `dead` kernels
  ended with `reason: "lost"` via `kernelDead(..., lost)`.
- **Kernel picker `device` marker completeness:** Added `device`
  (`metadata.capabilities.device`) to the Command Palette's
  `Change Kernel to …` entries (`src/lib/palette.ts`,
  `src/components/CommandPalette.tsx`, `src/App.tsx`) and to Settings ›
  Kernels (`KernelSpecs.swift`, `KernelSpecsList.swift`), matching the
  `◆` mark and `, offers the device API` accessible label.
- **Restart cap after `lost` in `AppKernels`:** `AppKernels` tracks
  recent `lost` endings per kernel within `lostRestartWindow` (300s) and
  stops starting once `maxLostRestarts` (3) is exceeded, reporting
  `reason: "lost"` back to `RegisteredKernels` so an OOMing Worker or
  repeatedly crashing kernel page settles cleanly as `dead` even across
  gaps longer than the server's 60s window. Explicit stops clear history.
- **Per-notebook `device` permission prompt routing:** Composing with
  #936's `AppLedgerPrompter.hostForNotebook` and
  `AppKernels.host(forKernel:notebook:)`, `KernelHost.showing(notebook:)`
  tracks `PageState.path` per lent `WKWebView`, `KernelHost.detach()`
  un-lends closed or downgraded pages (`AppKernels.unlend(_:)`), and
  `AppKernels.host(forKernel:notebook:)` falls back to lent paths before
  routing to `frontHost()`.
- **Mac offscreen host window when all notebook windows close:** On
  macOS, `AppKernels` observes `NSWindow.willCloseNotification` and
  `unlend(_:)`, moving its hidden `webView` into an invisible,
  non-activating offscreen `NSWindow` (with a `ProcessInfo`
  `.userInitiatedAllowingIdleSystemSleep` activity while kernels run) so
  WebKit does not suspend running kernels when every notebook window is
  closed. `SystemDialogPresenter.targetWindow(for:)` ignores
  `alphaValue == 0` windows so no dialog ever attaches to the offscreen
  host window.

Checked: `npm run check`, `npm test`, `npm run build`, `packages/device` `swift test`,
macOS `xcodebuild test` (`Ganymede`), `check-app-bundle.sh`, and iPadOS
simulator `xcodebuild test` (`Ganymede-iOS`).
