# Ganymede for macOS and iPadOS

A SwiftUI app that runs the Ganymede server in its own process and shows
ganymede-ui in a web view. On the Mac, kernels come from the kernelspecs
installed there, as with `ganymede serve`. The iPad and iPhone app is
built from the same sources (see
[tlockney/ganymede#59](https://github.com/tlockney/ganymede/issues/59)).

## How it works

- `GanymedeFFI.xcframework` is
  [`crates/ganymede-ffi`](https://github.com/tlockney/ganymede/tree/main/crates/ganymede-ffi)
  built for macOS and iOS: `ganymede_server_start` takes the server
  config as JSON (the keys of `ganymede.toml`) and returns the URL.
- The app starts the server on `127.0.0.1` with a random token, serving
  the notebook folder you pick (File > Open Folder…, ⇧⌘O; your home
  folder at first) and this repo's build as the static site. The web view
  loads the URL; the token becomes a login cookie.
- It reuses the last port, so the page keeps its origin and ganymede-ui
  its saved state.
- Opened from the Finder, the app takes `PATH` from your login shell, so
  kernelspecs that run `node`, `deno` or `python3` start.
- Quitting shuts every kernel down.
- Not sandboxed: the App Sandbox does not allow launching kernels. It is
  meant to be signed with a Developer ID and notarized.

On iPadOS and iOS (`Ganymede-iOS` target, iOS 16 or later):

- Notebooks live in the app's Documents folder, shown in the Files app
  under On My iPad, or in a folder picked with the folder button (an
  iCloud Drive or SMB folder works); the app keeps a bookmark to it.
- iOS does not let an app launch kernel processes, so for now notebooks
  open and save but do not run. An on-device kernel or remote kernels
  come next.
- iOS may close the server's socket while the app is in the background;
  back in the foreground the app restarts the server if it stopped
  answering, on the same port.

## Build

Needs macOS 13 or later, Xcode 16, Rust (rustup), Node 24, and
[XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`),
plus a checkout of [tlockney/ganymede](https://github.com/tlockney/ganymede).

```sh
GANYMEDE_DIR=~/src/ganymede apple/scripts/bootstrap.sh
open apple/Ganymede.xcodeproj
```

`bootstrap.sh` builds the XCFramework and this repo's `dist/` into
`apple/build/` and generates the Xcode project from `project.yml`. Pick
your team under Signing & Capabilities, then Run: the `Ganymede` scheme
for the Mac, `Ganymede-iOS` for an iPad, iPhone or simulator. ⌘U runs
the tests.
Safari's Develop menu can inspect the web view.

From the command line:

```sh
xcodebuild test -project apple/Ganymede.xcodeproj -scheme Ganymede \
  -destination platform=macOS CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
```

For an iPad simulator, name one from `xcrun simctl list devices`:

```sh
xcodebuild test -project apple/Ganymede.xcodeproj -scheme Ganymede-iOS \
  -destination 'platform=iOS Simulator,name=iPad Air 11-inch (M3)' \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
```

## Download

Each CI run of the `macos-app` job uploads `Ganymede-macOS` (a zipped,
universal Release build) under the run's Artifacts. It is ad-hoc signed,
not notarized, so after unzipping it on another Mac clear the quarantine
flag before the first launch:

```sh
xattr -dr com.apple.quarantine Ganymede.app
```

For a notarized copy, archive it in Xcode with your Developer ID
(Product > Archive, then Distribute App > Developer ID).
