## 2026-11-28, in-app kernel dialog tab (#886)

### Cause

`AppKernels` runs every in-app (`cdp-browser`) kernel across the app in a single shared 1×1 `WKWebView` so kernels survive page reloads. WebKit suspends a `WKWebView` when it has no window, so `AppKernels.lend(_:)` attaches that kernel web view only to the first notebook `WKWebView` that asks for one (`if webView.window == nil`).

When `01 Start Here` opens first in Tab 1 (`w1`) and `08 Device` opens in Tab 2 (`w2`, active), `AppKernels.webView` stays parked in `w1`'s hierarchy (`w1.isVisible == true` in `NSWindowTabGroup`). Previously:

1. `DeviceBridge.userContentController(_:didReceive:replyHandler:)` passed `message.webView` (`AppKernels.webView`, in `w1`) to `respondPage(to:from:reply:)`, so every prompt, action sheet, date picker, and file panel from `08 Device` called `beginSheetModal(for: w1)`. AppKit switches `NSWindowTabGroup.selectedWindow` to a background tab as soon as a sheet begins on it, jumping the window back to `01 Start Here` on the first prompt and leaving later prompts over `01 Start Here`.
2. `AppKernels.prompter.host` used `liveHost()` (`hosts.last`), targeting whichever tab opened last rather than the notebook asking for permission.
3. `SystemDialogPresenter.targetWindow(for:)` fell back to `NSApp?.windows.first(where: { $0.isVisible })`, which iterates windows in creation order (`w1` before `w2`) rather than frontmost/tab-group selection when no explicit host window is present.

### Fix

- `DeviceBridge`: added `dialogHost: (@MainActor (_ owner: Int) -> DialogHost?)?` so a shared kernel web view can map each kernel `owner` to the UI view whose window should host its dialogs without falling back to `message.webView` when no matching window is open.
- `SystemDialogPresenter`: extracted `targetWindow(for:)` on macOS to prefer `keyWindow`, `mainWindow`, `orderedWindows` before `windows`, and `tabGroup?.selectedWindow ?? candidate` when no explicit `host?.window` is given.
- `PageModel` / `AppKernels` / `AppLedgerPrompter`: tracked live `PageModel` attachments in `PageModel.attachedPages` (reused by `NotebookWindows.pages`), wired `AppKernels.device.dialogHost` to resolve the asking kernel's `PageModel` (`kernelID` first, then resolved notebook path, choosing the frontmost window/selected tab when multiple match), and added per-notebook host resolution (`hostForNotebook`) to `AppLedgerPrompter`.
