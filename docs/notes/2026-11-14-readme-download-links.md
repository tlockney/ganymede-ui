## 2026-11-14, README download links (#624)

The README's "Download the Mac app" now links the latest release and the
main build's zip directly. `releases/latest` redirects to the newest
release that isn't a prerelease (v0.11.0 when checked), so the
`main-build` prerelease never takes it. The release zip's name carries
the version, so `releases/latest/download/<file>` can't give a stable
direct link to it; the main build's zip has a fixed name, so its link
is direct.
