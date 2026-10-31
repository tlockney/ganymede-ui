## 2026-10-31, SwiftTerm terminal view (#118)

First step of the built-in terminal (#117). `apple/Sources/Ganymede/Terminal/` has `TerminalTransport`, the seam every source of a shell will implement (Jupyter terminals over a websocket, SSH, a local process), `EchoTransport` for tests, and `TerminalSurface`, a SwiftUI view over SwiftTerm's `TerminalView` on macOS and iOS. Nothing shows it yet; the Mac terminal window (#119) is next.

Why SwiftTerm and not libghostty: Thomas chose to start with SwiftTerm (MIT, pure Swift, one Swift package for both platforms). Upstream stopped building full libghostty for iOS in August 2026 and its C API is unstable, so using it now meant a third-party prebuilt binary. Because the view only sees `TerminalTransport`, swapping in libghostty later replaces `TerminalSurface` alone.

Notes:

- SwiftTerm 1.99 declares `swift-tools-version:6.2`, so it needs Xcode 26. It is pinned with `exactVersion` in `project.yml`.
- Its renderer can still be drawing when SwiftUI removes the view; `updateUiClosed()` returns false until it can be released, so `dismantle` retries every 100 ms, as SwiftTerm's own SwiftUI wrapper does.
- OSC 52 clipboard reads are refused: over SSH, a remote program would otherwise read whatever was copied last. Writes go to the pasteboard. Only http and https links open.
- SwiftTerm runs a build plugin (`SwiftTermBuildInfoPlugin`). Xcode asks to trust it once; `xcodebuild` fails with "must be enabled before it can be used" unless given `-skipPackagePluginValidation`, which CI now passes.
