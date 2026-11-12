## 2026-11-12, Mac and iPad app checks as parallel CI jobs (#543)

CI's `macos-app` job ran the Mac XCTest suite and then the iPad
simulator suite on one runner, about 6.5 and 5.8 minutes of a
14-minute job on #538. The iPad suite now runs in its own `ios-app`
job beside `macos-app`, so a pull request that touches the apps waits
for the slower of the two instead of their sum. Each job repeats the
setup (npm, XcodeGen, bootstrap), about 1.5 minutes of runner time.

The first split run gained less than expected: `ios-app` took 11.7
minutes, its test step 10.2 instead of 5.8, because it no longer
reused the Swift package checkouts the Mac step had resolved (about
2.5 minutes of fetching). Both jobs now cache
`DerivedData/SourcePackages`, keyed on `apple/Package.resolved`.

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
