## 2026-11-07, release publishes only its own archives (#334)

The release job downloaded every artifact of the run with
`merge-multiple: true`. `release.yml` calls `ci.yml`, whose jobs upload
the ad-hoc signed `Ganymede-macOS` build and the e2e `screenshots`, so
v0.4.0 shipped an unnotarized `Ganymede-macOS.zip` and about 30 PNGs,
and `releases/latest/download/Ganymede-macOS.zip` served the CI build.

The job now downloads the two artifacts it builds by name,
`ganymede-ui-X.Y.Z` and `Ganymede-macOS-X.Y.Z`. A single artifact
downloaded by name lands its files directly in `path`, so `dist/` holds
the same files as before. The stray assets on existing releases are
removed by hand; v0.4.0 and v0.5.0 both carry them.
