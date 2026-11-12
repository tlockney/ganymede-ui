## 2026-11-12, Mac app main builds on a rolling prerelease (#539)

There was no link to the latest Mac app from `main`: ci.yml's
`Ganymede-macOS` artifact sits behind a run page, is ad-hoc signed and
isn't notarized, so Gatekeeper blocks it after download. An ad-hoc
signature also changes every build, so Keychain items and permissions
ask again, and the team-prefixed App Group the share extension and
widget use doesn't apply.

`main-build.yml` now signs and notarizes the app with the release
secrets on each push to main that changes it, and replaces
`Ganymede-macOS.zip` on a `main-build` prerelease, as tlockney/ganymede
does for the server. Notarizing costs a few minutes of a macOS runner
per app change; a newer push cancels an older build.

The main build is the same app as the release (same bundle ID), so it
shares settings and data and replaces an installed release. Sparkle
needed two guards. Release installs read
`releases/latest/download/appcast.xml`; `main-build` is a prerelease
with no feed, so it is never offered. The main build itself reads that
feed with a build number of the latest release's plus `.<run number>`
(`45.12`): Sparkle compares build numbers part by part, so the current
release isn't offered as an update to it, and the next release is.
