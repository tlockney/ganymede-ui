## 2026-11-07, the downloadable Mac app on main only, no macos-app on release (#361)

Two macOS costs that bought no check. Every PR's macos-app job also made
a Release build to download (4.5 min of 24); PRs now check the Debug
app's bundle (Finder document type, Quick Look extensions and their
page) instead, and only pushes to main build, zip and upload the Release
app. release.yml called all of ci.yml on the tag, and its macos-app
(27 min in v0.5.0) ran before the signed macos and ios jobs could start,
though the commit had passed it on main. The call now passes
`skip_macos`, so build and e2e still run on the tag.
