## 2026-10-19, download the macOS app from CI (#44)

The macos-app job builds a Release `Ganymede.app` for
`generic/platform=macOS` (both architectures; the XCFramework's macOS
slice is universal), zips it with `ditto` to keep the bundle's symlinks and
signature, and uploads it as the `Ganymede-macOS` artifact. It is
ad-hoc signed, so Gatekeeper on another Mac needs the quarantine flag
cleared; notarizing needs a Developer ID, which CI doesn't have.
