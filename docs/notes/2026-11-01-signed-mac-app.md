## 2026-11-01, Signed and notarized Mac app in releases (#134)

`release.yml` has a `macos` job that builds the Mac app, signs it with the
Developer ID Application certificate, notarizes and staples it, and adds
`Ganymede-macOS-X.Y.Z.zip` to the release, its checksum and provenance
attestation alongside the web archives. The work is in
`apple/scripts/release-app.sh`, so it runs the same on a Mac.

- No provisioning profile: Developer ID distribution with no App Store
  capabilities signs with the certificate alone, so `xcodebuild archive`
  with manual signing and the `Developer ID Application` identity is
  enough, and the signed app is taken straight from the archive (no
  `-exportArchive`).
- `OTHER_CODE_SIGN_FLAGS=--timestamp`: notarization rejects a signature
  without a secure timestamp. The script also checks for the runtime flag
  and for `get-task-allow` before submitting, so those failures show up
  with a clear message rather than in the notary log.
- Entitlements: only `app-sandbox: false`. Hardened runtime limits the
  app's own process (no JIT, no unsigned libraries, no DYLD variables);
  kernels and shells it starts are separate binaries and are not
  hardened by it. WKWebView's JavaScript JIT runs in WebKit's
  WebContent process, signed by Apple with its own entitlements, so the
  app needs no `allow-jit`.
- The job reads `GANYMEDE_REF` from ci.yml's `macos-app` job with `yq`,
  so the released app links the ganymede-ffi that CI tested, and the pin
  lives in one place.
- The job declares a `release` environment. If it doesn't exist GitHub
  creates it without rules, and repository secrets still apply; if it
  has a required reviewer, the job waits.
- Not verified yet: the secrets can't be read from a Claude session, and
  nothing here ran on macOS. A manual `release.yml` run on a branch is the
  first test.
- The first dry run signed with the Developer ID and then stopped at the
  version check: the app said 1.0. XcodeGen writes
  `CFBundleShortVersionString` 1.0 and `CFBundleVersion` 1 into a
  generated Info.plist unless `info.properties` sets them, so a
  `MARKETING_VERSION` override does nothing. project.yml now sets both
  from the build settings, and each check in release-app.sh says what
  failed (the first one exited without a message).
