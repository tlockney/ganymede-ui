## 2026-11-27, device bridge in machine windows (#877)

`Place.Capability.deviceBridge` was one case, so a machine's window got
neither handler, and `NotebookPane` passed `attachDevice({ disabled:
onMachine })`: a cell on a machine's kernel got `unavailable` for every
`device` call. The gap had to close before this Mac's own kernels can
move to a background server reached as a machine, which would otherwise
take `device` from every notebook.

The case splits in two. `deviceLedger` is `kernelRelay`: the permission
ledger, the prompts a notebook's declarations raise at open, Notebook
Access and the lend of the web view to `AppKernels`. It stays this
device's alone, since the ledger keeps notebooks by their absolute
paths on this device and a machine's paths aren't this device's.
`deviceRemote` is the `deviceRemote` handler, the remote subset only.
`Place.allows(_:_:)` now takes a `PlaceSettings` (`sharesName`,
`usesDevice`) instead of the `sharesName: Bool` argument, and
`handlerNames(_:)` lists both, so `PlaceTests` decides each for each
place.

`Remote` gains `usesDevice: Bool?`, nil meaning off: a remote saved by
an older build has no key, and a machine's notebook can be written by
other people and agents there, so its calls leave this device only when
the person said so. `Remote.usesDevice(for:in:)` is the one lookup, as
`sharesName(for:in:)` is, and `Place` never reads the saved remotes
itself. The editor's toggle, "Let this machine's notebooks use this
device", sits under the name toggle, and says it applies to that
machine's windows opened after the change, and that a clipboard read
always asks. On stays `true` and off stays nil, so an older build that
saves the remotes drops an "on" setting back to off.

`KernelHost.attachRemote(to:asker:)` registers the remote handler alone,
with the same page check `attach()` uses, and nothing else: no
`kernelRelay`, no `kernels.lend`. `WebViewCoordinator.makeWebView`
attaches it when the place has `deviceRemote` but not `deviceLedger`,
and `startLoad` gives `notebookRoot` and `uiWillLoad` to the ledger's
windows and `uiWillLoad` to either, while `didCommit` and a dead web
content process call `reset()`/`uiPageEnded()` for the remote half
(`dropRemote()`), which is all either does. `usesDevice` is threaded
through `WebView`, `WebViewStore`, `ContentView` and `AppModel` the way
`sharesName` is.

In `packages/device`, `registerRemote(in:_:allow:)` takes a
`RemoteOptions`: `asker`, the app's name for the machine, and
`confirmClipboardReads`. Both default to this device's behaviour (nil,
false), so its windows are unchanged. With an asker, every dialog the
remote calls show says "A cell on <asker> asks to use this device.": as
the line above the cell's words in an alert, confirm, prompt or action
sheet on both platforms, and as the message under a date picker's title.
With `confirmClipboardReads`, `clipboard.readText` and
`clipboard.readImage` show a confirm first, "<asker> asks to read your
clipboard.", with Allow and Don't Allow; Don't Allow fails the call
`denied`, the code a person's refusal has.

`NotebookPane` passes `disabled: onMachine && !canAnswer()`, so a
machine's cells answer through the handler when its window registered
one and stay off the browser fallback when it didn't.

`PlaceTests` covers both capabilities for each place and both handler
tables; `RemoteStoreTests` decodes JSON as an older build wrote it,
round-trips on through the store and covers `usesDevice(for:in:)` and
the toggle's mapping; `KernelHostTests` runs a dialog and a refused
clipboard read from a `?machine=` page, checks that `kernelRelay` and
the full `device` handler aren't registered, and that the dialog names
the machine; `DeviceBridgeTests` covers the asker on both paths and the
clipboard confirm. `NotebookPane.test.tsx` checks `attachDevice` with
and without the handler.

Checked: `npm run check`, `npx vitest run` (117 files, 1899 tests),
`swift test` in `packages/device` (310 tests), `xcodebuild test` for the
Ganymede scheme on macOS (729 tests, 0 failures), and an iOS arm64
simulator build of the Ganymede-iOS scheme, which succeeds. By-hand
steps on #399 (Mac) and #273 (iPad/iPhone) still to do.
