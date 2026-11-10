# Releasing

How a release is cut, what it publishes, and what to do when it fails
partway through.

## The normal path

1. From an up-to-date `main`, `scripts/release.sh <level>` previews the
   version bump and the changelog. With `--execute` it bumps `package.json`
   and `package-lock.json`, regenerates `CHANGELOG.md`, commits them on
   `release/vX.Y.Z`, pushes, and opens an issue and a pull request. The
   level is `patch`, `minor`, `major`, or an explicit version; the first
   release can be the version already in `package.json`
   (`scripts/release.sh 0.0.1`).

   Before merging it, remove the docs' "Unreleased" notes on that branch
   ([CLAUDE.md](https://github.com/tlockney/ganymede-ui/blob/main/CLAUDE.md#documenting-unreleased-features)): the
   release ships everything they describe. Reword the text around a note
   if it read as unreleased; a note added to `main` after the branch was
   cut stays. This finds them, and the script lists them in the pull
   request:

   ```sh
   grep -rn 'Unreleased\.' README.md apple/README.md docs/*.md
   ```

   Ganymede's docs and landing page describe the apps too. Text there
   that changes with this release carries "Unreleased in ganymede-ui."
   ([Ganymede's CLAUDE.md](https://github.com/tlockney/ganymede/blob/main/CLAUDE.md#documenting-unreleased-features)).
   The script reads those notes from Ganymede's `main`, lists them in its
   output and the pull request, and with `--execute` opens an issue in
   tlockney/ganymede to update them once the release is out. If it can't
   reach GitHub it warns; then check them by hand.

2. Merging that pull request (with CI green; branch protection on `main`
   is what guarantees this, since `tag-release.yml` does not check CI
   itself) runs `tag-release.yml`. It sees a `package.json` version that
   has a `CHANGELOG.md` section and no tag, tags the merge commit
   `vX.Y.Z`, and starts `release.yml` on the tag.
3. `release.yml` checks that the tag matches `package.json`, runs CI
   (`ci.yml`) on the tag without its `macos-app` job (the commit passed
   it on `main`, and the release builds the app itself), builds the app, packages `dist/` as
   `ganymede-ui-X.Y.Z.tar.gz` and `ganymede-ui-X.Y.Z.zip` with a
   `SHA256SUMS` file, attests their build provenance, and publishes the
   GitHub Release with the changelog section as notes. A version with a
   hyphen (`0.2.0-rc.1`) is published as a prerelease. Its `macos` job
   builds the Mac app and attaches `Ganymede-macOS-X.Y.Z.zip`, listed in
   the same `SHA256SUMS` and attested like the archives (see
   [The Mac app](#the-mac-app)).

The script needs `gh` to open the issue and pull request; without it, it
pushes the branch and says what to open by hand. It runs `git-cliff` from
`PATH` if installed, otherwise through `npx`.

Then check the result:

```sh
gh release view vX.Y.Z --repo tlockney/ganymede-ui
gh release download vX.Y.Z --repo tlockney/ganymede-ui
sha256sum -c SHA256SUMS
gh attestation verify ganymede-ui-X.Y.Z.tar.gz --repo tlockney/ganymede-ui
```

Each archive unpacks to `ganymede-ui-X.Y.Z/`, the built site with
`index.html` at its top. Serve that directory as static files.

## The Mac app

The `macos` job in `release.yml` takes the `GANYMEDE_REF` that ci.yml's
`macos-app` job tests with and runs `apple/scripts/bootstrap.sh`, which
downloads that ganymede release's `GanymedeFFI.xcframework.zip` when the
ref is a release tag, or checks out and builds the commit otherwise
([apple/README.md](../apple/README.md#build)). It then runs
`apple/scripts/release-app.sh`, which:

1. imports the Developer ID Application certificate into a temporary
   keychain;
2. archives the arm64 Release build with that identity, hardened
   runtime, a secure timestamp, and the version from `package.json` as
   `CFBundleShortVersionString` (the run number is the build number);
3. checks the signature, team, runtime flag, and that the app has no
   `get-task-allow` entitlement;
4. submits it to Apple's notary service with `notarytool` and waits
   (usually a few minutes, at most 45), printing the notary log;
5. staples the ticket, checks it with `spctl`, and zips the app with
   `ditto`;
6. signs the zip with the update key and writes `appcast.xml`, the
   update feed, signed too (below).

It reads these repository (or `release` environment) secrets:

| Secret                       | What it is                                                           |
| ---------------------------- | -------------------------------------------------------------------- |
| `MACOS_CERTIFICATE_P12`      | The Developer ID Application certificate and private key, base64     |
| `MACOS_CERTIFICATE_PASSWORD` | The .p12 password                                                    |
| `APPLE_TEAM_ID`              | The team the certificate belongs to                                  |
| `APPSTORE_API_KEY_P8`        | An App Store Connect API key (`AuthKey_<id>.p8`), base64, for notary |
| `APPSTORE_API_KEY_ID`        | That key's ID                                                        |
| `APPSTORE_API_ISSUER_ID`     | The issuer ID shown above the API keys list                          |
| `SPARKLE_ED_PRIVATE_KEY`     | The update signing key (below)                                       |

The job declares the `release` environment. If that environment has a
required reviewer, the job waits for approval; if it limits deployment
branches to tags, a manual run on a branch fails there.

To try the signing without releasing, start `release.yml` by hand on a
branch: `gh workflow run release.yml --ref <branch> --repo
tlockney/ganymede-ui`. It notarizes and uploads the zip as a run
artifact, and publishes nothing.

The app needs no entitlements beyond turning the App Sandbox off:
hardened runtime does not stop it starting kernel processes or shells
(those binaries are not hardened by it), and WKWebView's JIT runs in
WebKit's own processes, which Apple signs. A notarization failure names
the binary and the reason in the printed log.

### Updates

> [!NOTE]
> **Unreleased.** Available only from a build of `main` (HEAD), not in
> the latest release.

The Mac app updates itself with [Sparkle](https://sparkle-project.org)
(#411). It reads
`https://github.com/tlockney/ganymede-ui/releases/latest/download/appcast.xml`,
so the feed is whatever the latest release (not a prerelease) attaches.
`release-app.sh` builds the feed's URL and the public key into the
app's Info.plist (`SUFeedURL`, `SUPublicEDKey`); builds without them
never update. The app takes an update only if the zip and the feed are
signed with the private key, and the feed lists the release's
`CHANGELOG.md` section as its notes.

The key is an EdDSA key made once, on a Mac, with Sparkle's tools:

```sh
curl -LO https://github.com/sparkle-project/Sparkle/releases/download/2.10.1/Sparkle-2.10.1.tar.xz
mkdir sparkle && tar -xf Sparkle-2.10.1.tar.xz -C sparkle
sparkle/bin/generate_keys            # keeps the key in the login keychain, prints the public key
sparkle/bin/generate_keys -x sparkle-private-key   # exports it
gh secret set SPARKLE_ED_PRIVATE_KEY --env release --repo tlockney/ganymede-ui < sparkle-private-key
# then store sparkle-private-key in a password manager, and delete it here
```

The release derives the public key from the secret
(`apple/scripts/sparkle-key.swift`) and prints it in the log. Keep the
key: installed apps accept only updates signed with the key they were
built with, so a new key means everyone installs the next release by
hand. The GitHub secret can't be read back, so keep the exported file
in a password manager as well as the keychain; `generate_keys -f <file>`
imports it on another Mac.

Sparkle orders updates by `sparkle:version`, the release run number, not
by version. The feed is whichever release GitHub marks latest, so release
only from `main`: a release of an older tag published afterwards would
become the feed and offer newer installs a downgrade.

## The iPad and iPhone app (TestFlight)

The `ios` job in `release.yml` builds the `Ganymede-iOS` scheme the same
way as the `macos` job, then runs `apple/scripts/release-ios.sh`, which:

1. imports the Apple Distribution certificate into a temporary keychain
   and installs the App Store provisioning profile, after checking that
   the profile is for `<team>.com.ganymede-server.Ganymede` and lists no
   devices;
2. archives the Release build with the version from `package.json` and
   the run number as the build number, and checks the version and icon;
3. exports it for App Store distribution and uploads it to App Store
   Connect (`xcodebuild -exportArchive` with destination `upload` and the
   API key), marked for internal TestFlight testing only.

App Store Connect then processes the build, which takes a few minutes,
and it appears under TestFlight for the internal testing group. External
testing needs App Review, which would weigh rule 2.5.2 (apps that run
code), so the builds stay internal.

It reads the team and API key secrets from the table above, and these:

| Secret                     | What it is                                                                   |
| -------------------------- | ---------------------------------------------------------------------------- |
| `IOS_CERTIFICATE_P12`      | An Apple Distribution certificate and private key, base64                    |
| `IOS_CERTIFICATE_PASSWORD` | The .p12 password                                                            |
| `IOS_PROVISIONING_PROFILE` | An App Store provisioning profile for `com.ganymede-server.Ganymede`, base64 |

Without those three, the script signs automatically through the API key
(`-allowProvisioningUpdates`), which works only if the key has the Admin
role, and lets Xcode create certificates and profiles on its own.

Set up once, outside the repo:

1. Register the explicit App ID `com.ganymede-server.Ganymede` under
   Certificates, Identifiers & Profiles.
2. Create an Apple Distribution certificate, export it with its private
   key from Keychain Access as a .p12, and store it with `base64 -i
cert.p12 | pbcopy` as `IOS_CERTIFICATE_P12`.
3. Create an App Store Connect provisioning profile (Distribution) for
   that App ID and certificate, and store it the same way as
   `IOS_PROVISIONING_PROFILE`. It lasts a year, as the certificate does;
   the job prints its expiry date.
4. Create the app in App Store Connect (iOS platform, that bundle ID) and
   an internal testing group under TestFlight.

The apps declare `ITSAppUsesNonExemptEncryption = NO` in
`apple/project.yml` (standard TLS and SSH only, #322), so builds go
straight to testing without the export compliance question. Revisit the
key if the apps add non-standard encryption.

To try it without releasing, start `release.yml` by hand on a branch, as
for the Mac app. Unlike the Mac app, that run uploads to TestFlight. App
Store Connect rejects a build number it already has for the version, and
a rerun keeps its run number, so once a run has uploaded, start a new run
rather than rerunning it.

To put the current `main` on TestFlight without a release, start
`release.yml` on `main` with `testflight_only` checked (Actions > Release >
Run workflow), or:

```sh
gh workflow run release.yml --ref main -f testflight_only=true --repo tlockney/ganymede-ui
```

It runs the `version`, CI and `ios` jobs only, and refuses to run on a
tag. The build carries the last released `package.json` version and the
run number, so in TestFlight it looks like a newer build of that release
while holding unreleased code; check the build number against the run.

## When it fails

If `scripts/release.sh --execute` stops before its commit (git-cliff or
the commit failed, or the branch already exists), it puts `package.json`,
`package-lock.json` and `CHANGELOG.md` back and leaves you where you
started; fix the cause and run it again. If it stops after the commit
(the push, an issue or the pull request failed), run it again from the
`release/vX.Y.Z` branch it left you on, with `--execute`: it skips the
bump, pushes the branch, and opens whichever of the release issue, the
pull request and the Ganymede docs issue doesn't exist yet.

If `tag-release.yml` pushed the tag but failed to start `release.yml`,
rerun it: with the tag on the merge commit and no release run for it,
it starts the release.

Otherwise find the failed `release.yml` run under the tag in the Actions
tab. Once it has run, pushing to `main` or rerunning `tag-release.yml`
does nothing ("vX.Y.Z exists and release.yml has run for it"). Recover
from the release workflow itself, depending on how far it got.

### A job failed and nothing was published

A flaky runner, a network error, an npm download that timed out, or
Apple's notary service being slow or down: the code is fine. An expired
certificate, profile or API key, or a wrong secret, fails the `macos` or
`ios` job with a message naming it; replace the secret, then rerun. Rerun the failed jobs from the run's page, or start a fresh
run on the tag:

```sh
gh run rerun <run-id> --failed --repo tlockney/ganymede-ui
# or
gh workflow run release.yml --ref vX.Y.Z --repo tlockney/ganymede-ui
```

### The tagged commit cannot be released

CI, the build, or the version check fails for a reason that needs a code
change. If no GitHub Release exists for the tag, nobody can have
downloaded it, so move the tag:

1. Delete the tag: `git push origin :refs/tags/vX.Y.Z`.
2. Fix the problem in a pull request to `main`, as usual.
3. Retag the new head of `main` and start the release:
   `gh workflow run tag-release.yml --ref main --repo tlockney/ganymede-ui`.

The changelog section stays as `scripts/release.sh` wrote it; the fix
appears in the next release's notes.

### The release was published, but is wrong or incomplete

Once a release is public, someone may have downloaded or deployed it.
Don't replace its assets or move its tag. Fix the problem on `main` and
cut a patch release with `scripts/release.sh patch`. If the broken release
must not be used, mark it a prerelease, so `releases/latest` moves back to
the one before:

```sh
gh release edit vX.Y.Z --prerelease --repo tlockney/ganymede-ui
```

### Publishing failed after the release was created

If the `release` job created the GitHub Release and then failed to upload
part of it, a rerun fails because the release exists. Within minutes of
the failure, while it is plainly incomplete, delete the release but keep
the tag, then rerun the job:

```sh
gh release delete vX.Y.Z --yes --repo tlockney/ganymede-ui   # no --cleanup-tag
gh run rerun <run-id> --failed --repo tlockney/ganymede-ui
```

A rerun of only the failed job reuses the archives the build job already
uploaded, so it attests the same files again, which is harmless. A fresh
run rebuilds them, and the new archives get their own attestations.
