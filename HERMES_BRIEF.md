# Brief: let a machine's kernels use this device (#877)

Read issue tlockney/ganymede-ui#877 (`gh issue view 877`) first: it is
the design, and this brief only adds where things are. Implement it on
branch `claude/project-thread-fneunc`. Delete this file in your commit,
make one commit, do not push. Cite `(#877)` in new comments. Follow the
comment style of the files you touch (full sentences, why not what).

Where things are:

- `apple/Sources/Ganymede/Place.swift`: `Capability.deviceBridge`,
  `allows(_:)`, `allows(_:sharesName:)`, `handlerNames`. Split into
  `deviceRemote` and `deviceLedger` as the issue says. Replace the
  `sharesName: Bool` argument with a small `PlaceSettings` struct
  (`sharesName`, `usesDevice`) if that reads better; keep the "a place
  never reads the saved remotes itself" rule.
- `apple/Sources/Ganymede/Remote.swift`: add `usesDevice: Bool?`
  (nil = off; old saved JSON must still decode, add a test) and a
  `usesDevice(for:in:)` like `sharesName(for:in:)`.
- `apple/Sources/Ganymede/RemotesView.swift` ~270: a toggle "Let this
  machine's notebooks use this device" under the name toggle, with a
  footnote that it applies to this machine's windows opened after the
  change and that a clipboard read always asks.
- `apple/Sources/Ganymede/WebView.swift` `makeWebView` (~308-311): a
  machine window with `deviceRemote` calls a new
  `KernelHost.attachRemote(to:asker:)` that registers only
  `deviceRemote` (same `fromPage` check), never `kernelRelay`, never
  `kernels.lend`. The `deviceBridge` checks at ~364, ~385, ~393 become
  the right half: `uiWillLoad`/`notebookRoot` for `deviceLedger`;
  `reset()`/`uiPageEnded()` (dropRemote) for `deviceRemote`. Thread
  `usesDevice` through `WebView`, `WebViewStore`, `ContentView`
  (~926, ~1208-1222) and `AppModel` (~425) the way `sharesName` is.
- `apple/Sources/Ganymede/KernelHost.swift`: `attach(to:)` ~118 is the
  model for `attachRemote`.
- `packages/device/swift/Sources/DeviceBridge/Remote.swift`:
  `registerRemote(in:allow:)` gains an options value with `asker:
String?` and `confirmClipboardReads: Bool` (defaults: nil, false, so
  this device is unchanged). With an asker, every dialog the remote
  calls show (`ui.alert/confirm/prompt/actionSheet/pickDate`) says "A
  cell on <asker> asks to use this device." (find where the bridge
  builds dialog text; add it as the dialog's message prefix or
  subtitle, whichever the presenter supports on both macOS and iOS).
  With `confirmClipboardReads`, `clipboard.readText` and
  `clipboard.readImage` first show a confirm "<asker> asks to read your
  clipboard." with Allow / Don't Allow; Don't Allow rejects with code
  `denied` (check which code the protocol uses for a person's refusal
  in `packages/device/docs/protocol.md` and use that). Add Swift tests
  in packages/device with the fake presenter.
- `src/components/NotebookPane.tsx` ~864: `disabled: onMachine &&
!canAnswer()` (import `canAnswer` from
  `@tlockney/ganymede-device/frontend`). Add or update the
  NotebookPane test that checks how `attachDevice` is called on a
  machine with and without the handler.
- `apple/Tests/GanymedeTests/PlaceTests.swift`: the capability table
  lists both new cases; machine with usesDevice off has no
  `deviceRemote`; with it on has `deviceRemote` and never
  `kernelRelay`; this device unchanged.
- Docs: docs/apps.md (Machines section) and docs/device.md (remote
  kernels): what a machine's kernels get, the setting, off by default,
  the clipboard prompt. One `> [!NOTE]` **Unreleased.** note per new
  section, exact text from CLAUDE.md. packages/device/docs/protocol.md:
  the new `registerRemote` options.
- Dev log: docs/notes/2026-11-27-machine-device-bridge.md starting
  `## 2026-11-27, device bridge in machine windows (#877)`.

Checks to run: `npm run check`, `npx vitest run`, the macOS unit tests,
the packages/device Swift tests, and an iOS arm64 simulator build.
Report counts and anything you couldn't do.
