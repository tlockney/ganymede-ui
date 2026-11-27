# Fix brief: pre-push review of #877

Branch `claude/project-thread-fneunc` (6da8594 + this file). Fix these,
delete this file in your commit, make ONE commit, do not push. Cite
`(#877)` in new comments.

1. Pickers, share, export and preview don't name the machine
   (packages/device/swift/Sources/DeviceBridge/Dialogs.swift ~500-515
   and the iOS cases; `asker` unused for `.share`, `.preview`,
   `.pickFiles`, `.exportFile`, `.pickPhotos`). When an asker is set,
   show one confirm first, on both platforms: the ask line ("A cell on
   <asker> asks to use this device.") plus what it wants ("…to pick
   files", "…to share", "…to save a file", "…to show a preview", "…to
   pick photos"), buttons Continue / Cancel. Cancel answers exactly as
   the person cancelling the picker itself does today. On the Mac also
   set `NSOpenPanel`/`NSSavePanel.message` to the ask line. No asker:
   unchanged. Swift tests with the fake presenter for each of the five.
2. Make the text composition testable: move the asker-line composition
   (`text` on the Mac ~596, `words` on iOS ~751, the pickDate label) into
   one pure internal helper on `Dialog` used by both presenters, and unit
   test it: title only, message only, both, empty message, action sheet
   with nil message, no asker.
3. Wiring tests (apple/Tests/GanymedeTests): build
   `WebViewCoordinator(place: .machine(id), sharesName: true,
usesDevice: true).makeWebView()` and assert `deviceRemote` is
   registered and `kernelRelay` isn't; with `usesDevice: false` neither.
   In KernelHostTests assert `attachRemote` lends nothing to the
   `AppKernels` it was given (add a test seam if needed).
4. packages/device/docs/protocol.md ~774: describe the ask line as the
   code does after item 2 (for example "above the cell's own words; the
   title when the dialog has none").
5. WebView.swift ~338: if the machine's name is nil, use "another
   computer" as the asker, never nil, so a machine's dialogs always say
   it isn't this device. Test it.
6. KernelHostTests ~436: the test ending in `host.reset()` must assert
   what its comment says (an open dialog is closed, e.g.
   `presenter.closed`), or drop the comment.
7. Mac clipboard NSAlert: give "Don't Allow" `keyEquivalent = "\u{1b}"`.
8. docs/device.md ~84-87: say that kernels on a remote server run from
   this device's own window still read the clipboard with no dialog,
   and only a connected machine's window asks. Update docs/apps.md,
   docs/device.md and the dev log so "every dialog names the machine"
   matches item 1 exactly.

Checks: `npm run check`, `npx vitest run`, packages/device `swift test`,
macOS unit tests, iOS arm64 simulator build. Report counts.
