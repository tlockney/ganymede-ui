## 2026-11-26, Notebook Access and app links on a machine (#868)

A machine's window dimmed Notebook Access, because `hostGrantsAvailable`
said no for `config.machine`: the app's mount didn't forward `api/host`
(#701). Ganymede #973 forwards `api/host/grants` (GET, PUT, DELETE), so the
page now says yes for a machine too, and only `kernels === 'page'` and a
non-Ganymede backend stay out. The paths and defaults the sheet shows are
the machine's: they come through its mount, so nothing on this Mac changes.
The app bundles Ganymede at `GANYMEDE_REF`, still the last release, so
until that bump the mount answers 404. `answer()` already turns a bare 404
into "This server has no notebook access settings. They need a newer
Ganymede."; the padlock's wants check treats any failure as no grant info
and shows nothing, so an older machine server gets no error in the toolbar.

A `ganymede://` link in a machine's notebook did nothing: `Place.opensExternally`
lets only http(s) out of a machine's window, and everything else was
cancelled. `Place.machineLink(_:)` decides one link against the machine:
`notApp` for a web link (or this device, whose links stay `AppURL`'s),
`open(path:)` for `ganymede://open?path=P` with `P` relative to the
machine's root, and `refused` for everything else. `P` is refused when it is
absolute, starts with `~`, or has an empty, `.` or `..` segment, since the
mount would be asked for a path above its root; `run`, `new`,
`open?folder=&file=`, x-callback URLs and a link that doesn't parse are
refused too. `WebView`'s `decidePolicyFor` and `createWebViewWith` send a
machine's `ganymede://` link through it: `open` runs the page's
`open` with the path, in the same window, and `refused` shows "This link
names a file on another computer." as the window's other short notices.
Never `openExternally` or `AppURLHandler`, so nothing acts on this Mac.
`appLinks` in `Place.allows` stays this device's.

Part of ganymede#965, section 2. By-hand checks on #399 (Mac) and #273
(iPad and iPhone).
