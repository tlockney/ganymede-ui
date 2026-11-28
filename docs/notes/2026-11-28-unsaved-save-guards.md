## 2026-11-28, Save guards before closing, switching place, and backgrounding (#808)

Adds save-before-close / save-before-switch guards and iOS background
save across the browser UI and Apple apps, keeping local recovery copy
storage/restore and document states open in #808:

- **Closing or replacing a dirty notebook in the browser**: `guardClose`
  in `src/App.tsx` (sharing `saveWithTimeout` with `connectFromSheet`)
  awaits `open.save()` raced against `SERVER_TIMEOUT_MS` before
  switching notebooks (`openNotebook`), creating a new notebook
  (`newNotebook` before `contents.newUntitled`), copying examples
  (`openExamples` before `copyExamples`), or switching to an in-page
  DuckDB console (`!canOpenTabs()`). When saving fails or times out,
  `UnsavedSheet` (`src/components/UnsavedSheet.tsx`, sharing
  `UnsavedChoice` with `ConnectSheet.tsx`) asks whether to Keep Editing,
  Download a Copy, or Switch Without Saving (`c.discard()`, invoking the
  returned `undo` helper if creating the replacement notebook/examples
  subsequently fails). Intentional close (`close` for trashed files) and
  console tabs (`canOpenTabs()`) stay unguarded.
- **iPad and iPhone place switching**: `SwitchSaveCoordinator`
  (`apple/Sources/Ganymede/SwitchSaveGuard.swift`) guards
  `ContentView.switchPlace` and its callers (sidebar place picker,
  Spotlight / deep-link `showNotebook`, `showThisDeviceForParkedLink`,
  and `changeFolder`). `PageModel.save()` awaits `window.ganymede.save()`
  before retiring `WebViewStore` (`retire()`), calling
  `pageModel.forgetPage()`, mutating `place`, or queuing `"open"`. On
  failure or timeout, `SwitchSaveAlert` offers Keep Editing (cancelling
  any parked link), Download a Copy (via `WebViewCoordinator`'s
  `DownloadWaiter`, then re-prompting), or Switch Without Saving.
- **Apps' Settings › Kernels and remote changes**:
  `AppModel.guardServerRestart`, `requestUseForKernels`, and
  `requestDelete(remote:)` (called from `KernelLocationSection`,
  `KernelLocationPicker`, `RemotesView`, and `RemoteEditor.save()`) save
  open dirty notebooks (`PageDocument.openUnsaved` on macOS,
  `PageModel.openPages` on iOS) before changing `kernelRemoteID` and
  restarting the server, showing `NSAlert` on macOS or `SwitchSaveAlert`
  on iOS on failure.
- **iOS backgrounding and WebKit termination**: `ContentView`'s
  `scenePhase == .background` handler triggers `saveNotebookOnBackground`
  wrapped in `UIApplication.shared.beginBackgroundTask`. In
  `WebViewCoordinator.webViewWebContentProcessDidTerminate`, the page is
  marked not-ready (`PageModel.webContentProcessDidTerminate()`),
  `PageLoads` forgets its cached navigation, and the view reloads once
  foregrounded (`reloadIfTerminated()`), leaving a clean seam for
  #808's local recovery copy once its storage and restore UX decisions
  are settled.
