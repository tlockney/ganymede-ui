## 2026-11-12, the Release app bundle is checked before notarizing (#549)

#548 dropped CI's unsigned Release build on pushes to main, so the
bundle checks in ci.yml's macos-app job (the `.ipynb` type declaration,
the four app extensions' extension points, Quick Look's `preview.html`)
ran only on the Debug build. The Release app that main-build.yml and
release.yml sign and ship had no such check; `release-app.sh` checked
only the version, Sparkle keys and signature.

The checks are now `apple/scripts/check-app-bundle.sh <app>`. ci.yml
runs it on the Debug build, and `release-app.sh` runs it on the
archived Release app right after copying it out of the archive (which
`xcodebuild archive` has already signed), before Sparkle's helpers and
the app are re-signed and notarized, so both main-build.yml and
release.yml get it without a step of their own. It lives beside
`release-app.sh` in `apple/scripts/` rather than `scripts/`, which holds
the web build's scripts. Each failure names what is missing, with
PlistBuddy's own error when a file or key is absent. `docs/releasing.md`
lists the check among `release-app.sh`'s steps.
