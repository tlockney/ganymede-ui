## 2026-10-19, the iPadOS app (#42)

The `Ganymede-iOS` target builds the Swift shell for iPad and iPhone from
the macOS app's sources, linking the iOS slices of `GanymedeFFI.xcframework`.

- The notebook folder defaults to the app's Documents folder
  (`UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` show it
  in the Files app). SwiftUI's `fileImporter` picks another folder; its
  URL is security-scoped, so the app holds the scope while serving it
  and keeps a bookmark rather than a path.
- The cookie secret goes in Application Support, not the Jupyter runtime
  dir under the sandbox home.
- WebKit on iOS shows nothing for `alert`/`confirm`/`prompt` without a
  `WKUIDelegate`; they are `UIAlertController`s now.
- On becoming active the app probes `/api/status` and restarts the server
  if it does not answer, since iOS may close listening sockets of a
  suspended app.
- No kernels yet: iOS cannot launch subprocesses. Next is an on-device
  kernel through tlockney/ganymede#165's `Startup` fields, or remote
  kernels.
- CI runs the `Ganymede-iOS` tests on the first available iPad
  simulator, found with `simctl list -j`, since device names change with
  each Xcode.
