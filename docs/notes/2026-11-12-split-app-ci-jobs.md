## 2026-11-12, Mac and iPad app checks as parallel CI jobs (#543)

CI's `macos-app` job ran the Mac XCTest suite and then the iPad
simulator suite on one runner, about 6.5 and 5.8 minutes of a
14-minute job on #538. The iPad suite now runs in its own `ios-app`
job beside `macos-app`, so a pull request that touches the apps waits
for the slower of the two instead of their sum. Each job repeats the
setup (npm, XcodeGen, bootstrap), about 1.5 minutes of runner time.

Both jobs are gated by the same `macos` output of `ci-changes.sh`.
Filtering per platform would rarely skip anything, since almost all of
`apple/` is shared, and could let one platform break unseen.

`GANYMEDE_REF` moved from the `macos-app` job's `env` to the workflow's
`env`, so both jobs read one value. `release-pins.sh` finds it by name
anywhere in ci.yml, so it needed no change; release.yml and
main-build.yml now read `.env.GANYMEDE_REF`.

Releases stay as they are: one tag and one version ship the Mac app
and the TestFlight build, and `testflight_only` covers an iOS-only
build. `macos-app` kept its name, so the required check on `main` is
unchanged until `ios-app` is added to it.
