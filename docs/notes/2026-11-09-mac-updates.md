## 2026-11-09, Mac app updates with Sparkle (#411)

The Mac app finds and installs new releases with Sparkle 2.10.1. Thomas
chose the defaults: a daily check on, installing asks first.

- The feed is `appcast.xml` on the latest GitHub release
  (`releases/latest/download/`), so there is nothing to host, and
  prereleases are never offered. `release-app.sh` writes it with the
  version's CHANGELOG.md section as markdown notes, and signs both the
  zip and the feed (`SURequireSignedFeed`).
- The public key isn't committed: `sparkle-key.swift` derives it from the
  `SPARKLE_ED_PRIVATE_KEY` secret with CryptoKit and checks Sparkle's
  `sign_update` signature against it, so the key in the app and the key
  that signed the update can't drift apart. One secret is the whole setup.
- `SUFeedURL` and `SUPublicEDKey` are build settings, empty except in
  `release-app.sh`; `UpdateFeed` starts the updater only when both are
  set, so CI and local builds (which share the bundle ID with the
  installed app) never replace themselves or anything else.
- Scheduled checks use Sparkle's gentle reminders: the delegate returns
  false from `standardUserDriverShouldHandleShowingScheduledUpdate`, and
  the toolbar shows an Update Available button that opens Sparkle's
  window. User-initiated checks always show the window.
- Sparkle's prebuilt helpers (Autoupdate, Updater.app, the XPC services)
  are re-signed with the Developer ID, hardened runtime and a timestamp
  before notarization; `release-app.sh` archives without `-exportArchive`,
  so Xcode doesn't do it.

The first release with the updater still has to be installed by hand.
