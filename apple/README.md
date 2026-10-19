# Ganymede for macOS

A SwiftUI app that runs the Ganymede server in its own process and shows
ganymede-ui in a web view. Kernels come from the kernelspecs installed on
the Mac, as with `ganymede serve`. iPadOS comes later from the same code
(see [tlockney/ganymede#59](https://github.com/tlockney/ganymede/issues/59)).

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
your team under Signing & Capabilities, then Run. ⌘U runs the tests.
Safari's Develop menu can inspect the web view.

From the command line:

```sh
xcodebuild test -project apple/Ganymede.xcodeproj -scheme Ganymede \
  -destination platform=macOS CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
```
