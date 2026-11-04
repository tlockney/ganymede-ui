## 2026-11-04, iPad and iPhone builds to TestFlight (#188)

`release.yml` has an `ios` job that runs `apple/scripts/release-ios.sh`:
archive `Ganymede-iOS`, export for App Store distribution, and upload to
App Store Connect for internal TestFlight testing. docs/releasing.md has
the secrets and the one-time setup in the Apple account.

- The Developer ID certificate the Mac job uses can't sign an iOS app.
  iOS needs an Apple Distribution certificate and an App Store
  provisioning profile (`IOS_CERTIFICATE_P12`, `IOS_CERTIFICATE_PASSWORD`,
  `IOS_PROVISIONING_PROFILE`). Without them the script falls back to
  automatic signing through the API key, which needs the key's Admin role.
- The profile is named only on the app target, through
  `PROVISIONING_PROFILE_SPECIFIER: $(GANYMEDE_IOS_PROFILE)` in
  project.yml. Passed on the xcodebuild command line, it would apply to
  the Swift packages' targets too, which fail with "does not support
  provisioning profiles".
- `xcodebuild -exportArchive` with `destination: upload` and the API key
  uploads directly, so no `altool`. `testFlightInternalTestingOnly` keeps
  the builds away from external testing, which needs App Review (rule
  2.5.2, running code).
- App Store Connect rejects an upload without an app icon or with an icon
  that has an alpha channel. The iOS target had no asset catalog; it now
  has `apple/Resources/iOS/Assets.xcassets` with one 1024-point icon.
  Chromium screenshots are always RGBA, so `scripts/render-icons.mjs`
  draws that icon on a canvas and writes an RGB PNG itself.
- A privacy manifest (`PrivacyInfo.xcprivacy`) declares the app's one
  "required reason" API, UserDefaults (CA92.1).
- Export compliance is not declared: the app uses HTTPS/TLS and SSH
  (swift-nio-ssh), both standard encryption, but the exemption answer is
  the account holder's to give. Until `ITSAppUsesNonExemptEncryption` is
  set, each build asks in App Store Connect.
- The GitHub Release doesn't wait for the `ios` job, so a TestFlight
  failure doesn't hold back the web archives and the Mac app.
- Not verified yet: nothing here ran on macOS, and the iOS secrets don't
  exist yet. A manual `release.yml` run on a branch is the first test.
