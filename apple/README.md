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
- The app starts the server on `127.0.0.1` with a random token and this
  repo's build as the static site. On the Mac it serves the whole disk
  (`/`), and each window opens one notebook or folder by its path; on the
  iPad it serves the notebook folder. The web view loads the URL; the
  token becomes a login cookie.
- On the Mac, double-clicking an `.ipynb` file in the Finder (or Open
  With > Ganymede) opens it in its own window; opening it again brings
  that window to the front. File > Open… (⌘O) opens notebooks, File >
  Open Folder… (⇧⌘O) a folder, each in a new window; a new window (⌘N)
  shows the last folder opened, your home folder at first.
- To open notebooks here by default, choose Ganymede > Make Default App
  for Notebooks, or in the Finder choose File > Get Info on a notebook,
  pick Ganymede under Open with, and click Change All.
- It reuses the last port, so the page keeps its origin and ganymede-ui
  its saved state.
- Opened from the Finder, the app takes `PATH` from your login shell, so
  kernelspecs that run `node`, `deno` or `python3` start.
- Downloads from the page (links with a `download` attribute, files an
  output offers) ask where to save, starting in Downloads.
- Quitting shuts every kernel down.
- Settings (⌘,) keeps a list of remotes: Jupyter or Ganymede servers,
  SSH hosts, or both. Kernels run on this Mac or, as on iPadOS, on one
  remote's server. Tokens are kept in the keychain.
- File > New Terminal (⌃⇧`) opens a shell from the app's own server in
the front window's folder (its notebook's folder, or the folder it
shows). File > New Terminal On opens one on a remote's server, if it
has terminals (Ganymede with terminals, or `jupyter server`), or over
SSH with `/usr/bin/ssh`, so `~/.ssh/config`, the SSH agent and
  known_hosts apply. Closing the window ends the shell.
- Not sandboxed: the App Sandbox does not allow launching kernels. It is
  meant to be signed with a Developer ID and notarized.

On iPadOS and iOS (`Ganymede-iOS` target, iOS 16 or later):

- Notebooks live in the app's Documents folder, shown in the Files app
  under On My iPad, or in a folder picked with the folder button (an
  iCloud Drive or SMB folder works); the app keeps a bookmark to it.
- iOS does not let an app launch kernel processes, so on the iPad the
  page runs its own kernel: cdp-kernel's TypeScript kernel in a Worker in
  a hidden second web view, with Swift relaying its messages
  (`KernelHost.swift`; the app opens the page with `kernels=page`). For other
  kernels, tap the server button and enter the URL and token of another
  Jupyter or Ganymede server (for example `ganymede serve --ip 0.0.0.0` on
  your Mac; see its [Security](https://ganymede-server.com/docs/security)
  page for reaching it safely). Either way, notebooks stay on the iPad.
- Downloads open the share sheet, where Save to Files keeps them.
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
The first build asks you to trust SwiftTerm's build plugin
(`SwiftTermBuildInfoPlugin`, which records SwiftTerm's version); choose
Trust & Enable. From the command line, `-skipPackagePluginValidation`
does the same.

From the command line:

```sh
xcodebuild test -project apple/Ganymede.xcodeproj -scheme Ganymede \
  -destination platform=macOS -skipPackagePluginValidation CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
```

For an iPad simulator, name one from `xcrun simctl list devices`:

```sh
xcodebuild test -project apple/Ganymede.xcodeproj -scheme Ganymede-iOS \
  -destination 'platform=iOS Simulator,name=iPad Air 11-inch (M3)' \
  -skipPackagePluginValidation CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=
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
