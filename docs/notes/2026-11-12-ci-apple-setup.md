## 2026-11-12, One Apple setup action; no unsigned main build in CI (#547)

Five jobs set up the apps the same way before xcodebuild: ci.yml's
macos-app and ios-app, release.yml's macos and ios, and main-build.yml.
Each read GANYMEDE_REF, checked out ganymede or restored the
XCFramework, installed Rust, ran npm ci, xcodegen and bootstrap.sh. That
is now `.github/actions/apple-setup`, with two switches:

- `caches: 'true'` (CI only) restores and saves the XCFramework built
  for a commit, Rust, npm and Swift packages. Signed builds leave it off,
  so nothing a pull request wrote to the cache reaches an app that ships.
- `sentry-sourcemaps: 'true'` (signed builds) builds the web UI with
  source maps and uploads them, with `sentry-auth-token`.

macos-app no longer builds an unsigned Release app and uploads
`Ganymede-macOS` on pushes to main: since #540, main-build.yml builds,
signs and notarizes the same app on the same pushes and publishes it to
the `main-build` prerelease. "Check the app bundle" checks the Debug
build the tests ran, on every event.

e2e caches Playwright's Chromium, and docs.yml is named "Docs", to match
the other repos (tlockney/ganymede#736).
