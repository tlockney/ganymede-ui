# Ganymede for macOS and iPadOS

A SwiftUI app that runs the Ganymede server in its own process and shows
ganymede-ui in a web view. [docs/apps.md](../docs/apps.md) is the user
guide: install, windows, sidebar, kernels, terminals and settings on the
Mac, iPad and iPhone. This page covers how the app works and how to build
it. The iPad and iPhone app is built from the same sources as the Mac's
(see [tlockney/ganymede#59](https://github.com/tlockney/ganymede/issues/59)).

## How it works

- `GanymedeFFI.xcframework` is
  [`crates/ganymede-ffi`](https://github.com/tlockney/ganymede/tree/main/crates/ganymede-ffi)
  built for macOS and iOS: `ganymede_server_start` takes the server
  config as JSON (the keys of `ganymede.toml`) and returns the URL.
- The app starts the server on `127.0.0.1` with a random token and this
  repo's build as the static site. On the Mac it serves the whole disk
  (`/`), and each window opens one notebook or folder by its path; on the
  iPad it serves the notebook folder. The web view loads the URL; the
  token becomes a login cookie.
- It reuses the last port, so the page keeps its origin and ganymede-ui
  its saved state.
- Opened from the Finder, the app takes `PATH` from your login shell, so
  kernelspecs that run `node`, `deno` or `python3` start.
- The window's sidebar, toolbar, menus, terminals, text editor and
  inspector are SwiftUI and AppKit (UIKit on iPadOS); the page shows just
  the notebook. [docs/architecture.md](../docs/architecture.md) has the
  split between the shell and the page.
- The in-app TypeScript kernel is cdp-kernel in a Worker in a hidden web
  view, registered with the app's server as one of its kernels
  (`AppKernels.swift`, ganymede#266): the page reaches it through the
  server's API like any other kernel, and it keeps running across a
  window's reload. Its cells get ganymede-device's `device` (see
  [docs/device.md](../docs/device.md)).

  > [!NOTE]
  > **Unreleased.** Available only from a build of `main` (HEAD), not in
  > the latest release, where the page runs the kernel itself and Swift
  > relays its messages to the hidden web view.

- Not sandboxed on the Mac: the App Sandbox does not allow launching
  kernels. Releases are signed with a Developer ID and notarized instead
  (see [Download](#download)).
- On iPadOS, iOS may close the server's socket while the app is in the
  background; back in the foreground the app restarts the server if it
  stopped answering, on the same port.

## Crash reports

Off until the user says yes ([docs/apps.md](../docs/apps.md#crash-reports)
has what is sent). Crashes in the app and panics in its embedded server
(ganymede-ffi) go to Ganymede's Sentry; scrubbing happens in the app,
before anything is sent.

Release builds upload the archive's dSYMs to Sentry
(`scripts/sentry-dsyms.sh`, needs `SENTRY_AUTH_TOKEN`), including
TestFlight-only runs. ganymede-ffi's static library keeps its line
tables, so Rust frames show files and lines too.

## TestFlight

Each ganymede-ui release uploads the iPad and iPhone app to TestFlight for
internal testers, and a `testflight_only` run of the Release workflow
uploads the current `main` between releases (`release.yml`'s `ios` job, set up as
[docs/releasing.md](../docs/releasing.md#the-ipad-and-iphone-app-testflight)
says). Members of the team's internal testing group install it with the
TestFlight app. TestFlight builds expire after 90 days; the next upload
replaces them.

## Build

Needs an Apple silicon Mac with macOS 26 or later, Xcode 26 or later
(the apps target macOS 26 and iOS 26), Node 24, and
[XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`).
The app links ganymede-ffi as `GanymedeFFI.xcframework`, which
`bootstrap.sh` gets one of two ways:

- `GANYMEDE_REF=vX.Y.Z` downloads it from that
  [tlockney/ganymede](https://github.com/tlockney/ganymede) release
  (`GanymedeFFI.xcframework.zip`) and checks it against the release's
  `.sha256`; a mismatch or a missing asset fails. Releases after
  ganymede v0.7.0 carry it.
- `GANYMEDE_DIR=<checkout>` builds it from a checkout of
  tlockney/ganymede with its `scripts/build-xcframework.sh`, for a commit
  that isn't a release or a local change to ganymede. This needs Rust
  (rustup), and Xcode as the active developer directory
  (`xcode-select -p`) with the iOS platform installed
  (`xcodebuild -downloadPlatform iOS`); `bootstrap.sh` checks both
  before it builds. `GANYMEDE_DIR` wins when both are set.

```sh
GANYMEDE_REF=vX.Y.Z apple/scripts/bootstrap.sh
# or
GANYMEDE_DIR=~/src/ganymede apple/scripts/bootstrap.sh
open apple/Ganymede.xcodeproj
```

CI and release builds use `GANYMEDE_REF` from ci.yml's `macos-app` job:
a release tag downloads, a commit SHA checks out and builds.

`bootstrap.sh` puts the XCFramework and this repo's `dist/` into
`apple/build/` and generates the Xcode project from `project.yml`. Pick
your team under Signing & Capabilities, then Run: the `Ganymede` scheme
for the Mac, `Ganymede-iOS` for an iPad, iPhone or simulator. With the
`Ganymede` scheme selected, Run opens the Mac app even when a phone is
plugged in. ⌘U runs the tests.
Safari's Develop menu can inspect the web view.
The first build asks you to trust SwiftTerm's build plugin
(`SwiftTermBuildInfoPlugin`, which records SwiftTerm's version); choose
Trust & Enable. From the command line, `-skipPackagePluginValidation`
does the same.

The Swift packages' exact commits are in `apple/Package.resolved`, which
`bootstrap.sh` copies into the project; CI and release builds use only
those (`-onlyUsePackageVersionsFromResolvedFile`). After changing
`packages` in `project.yml`, run `apple/scripts/update-packages.sh` and
commit the new `Package.resolved`.

From the command line:

```sh
xcodebuild test -project apple/Ganymede.xcodeproj -scheme Ganymede \
  -destination platform=macOS -skipPackagePluginValidation -onlyUsePackageVersionsFromResolvedFile \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
```

For an iPad simulator, name one from `xcrun simctl list devices`:

```sh
xcodebuild test -project apple/Ganymede.xcodeproj -scheme Ganymede-iOS \
  -destination 'platform=iOS Simulator,name=iPad Air 11-inch (M3)' \
  -skipPackagePluginValidation -onlyUsePackageVersionsFromResolvedFile \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
```

## Download

Since 0.3.0, each
[ganymede-ui release](https://github.com/tlockney/ganymede-ui/releases)
attaches `Ganymede-macOS-<version>.zip`: an Apple silicon app signed with a
Developer ID, notarized, and stapled. Unzip it, move `Ganymede.app` to
Applications, and open it; Gatekeeper opens it without a warning.
`release.yml` builds it with `scripts/release-app.sh`
([docs/releasing.md](../docs/releasing.md)).

Each run of the `macos-app` job on a push to `main` also uploads
`Ganymede-macOS` (a zipped Release build) under the run's
Artifacts; pull requests build and test the Debug app only. It is ad-hoc
signed, not notarized, so after unzipping it on another Mac clear the
quarantine flag before the first launch:

```sh
xattr -dr com.apple.quarantine Ganymede.app
```

To sign and notarize a build yourself, run `scripts/release-app.sh` after
`bootstrap.sh`, with the variables its header lists; with
`MACOS_CERTIFICATE_P12` unset it signs with the Developer ID certificate
in your login keychain.
