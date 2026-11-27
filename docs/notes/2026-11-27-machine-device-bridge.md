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
`Dialog.words(title:message:asker:standIn:)` composes those words, the
one helper both presenters use, so an action sheet with no message and a
picker's stand-in are decided in one place. The stand-in stands only for
an asker's line: a date or time picker's own title is
`Dialog.pickerTitle(_:)`, which the Mac passes as the title, as it showed
it before #877, so a Mac picker is named with or without an asker, while
the iOS sheet has no title of its own when no machine asked, as it had
none before #877.

A picker, the share sheet, the save panel and the preview sheet take
what they read or write to the kernel's machine, so one asks first with
a confirm: "A cell on <asker> asks to use this device. It wants to pick
files." — or "to pick photos", "to save a file", "to share", "to show a
preview" — with Continue and Cancel. Continue shows the picker or sheet,
which answers the call; Cancel answers as cancelling the picker itself
does (`[]`, `false`, a dismissed preview), and nothing shows. On the Mac
the open and save panels also carry the ask line above their file list
(`NSOpenPanel.message`, `NSSavePanel.message`). Without an asker, all of
these show as they did. `Place.asker(name:)` names the machine, or
"another computer" when the app has no name for it (a remote removed
while its window was open), so a machine's dialogs never read as this
device's own; a window of this device asks as no machine and its dialogs
are unchanged.

With `confirmClipboardReads`, `clipboard.readText` and
`clipboard.readImage` show a confirm first, "<asker> asks to read your
clipboard.", with Allow and Don't Allow; Don't Allow fails the call
`denied`, the code a person's refusal has, and is Escape on the Mac.

`NotebookPane` passes `disabled: onMachine && !canAnswer()`, so a
machine's cells answer through the handler when its window registered
one and stay off the browser fallback when it didn't.

`PlaceTests` covers both capabilities for each place, both handler
tables and the page URL a machine's kernel can call at all
(`tracksPageURL`); `RemoteStoreTests` decodes JSON as an older build
wrote it, round-trips on through the store and covers
`usesDevice(for:in:)` and the toggle's mapping; `WindowWiringTests`
builds a page with the handlers a machine's window gets, its setting on
and off, through the seam `WebViewCoordinator.makeWebView` calls, and
checks them (`deviceRemote` alone, or neither), that this device's gets
both, and the name its dialogs ask as, "another computer" included;
`KernelHostTests` runs a dialog and a refused clipboard read from a
`?machine=` page, checks that `kernelRelay` and the full `device` handler
aren't registered, that the dialog names the machine, that the page's
reset closes a dialog it left open, and that a machine's window lends
nothing to `AppKernels` where this device's lends its page;
`DeviceBridgeTests` covers `Dialog.words` alone (a title, a message,
both, an empty message, an action sheet with none, no asker) and a
picker's stand-in, which names one only for an asker, the asker on both
paths, each of the five confirms with a fake presenter (Continue shows
the picker and it answers; Cancel answers as cancelling it does and
shows nothing), and the clipboard confirm. `NotebookPane.test.tsx`
checks `attachDevice` with and without the handler.

Checked: `npm run check`, `npx vitest run` (117 files, 1899 tests),
`swift test` in `packages/device` (313 tests), `xcodebuild test` for the
Ganymede scheme on macOS (736 tests, 0 failures), and an iOS arm64
simulator build of the Ganymede-iOS scheme, which succeeds. By-hand
steps on #399 (Mac) and #273 (iPad/iPhone) still to do.
