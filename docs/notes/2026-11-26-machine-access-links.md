## 2026-11-26, Notebook Access and app links on a machine (#868)

A machine's window dimmed Notebook Access, because `hostGrantsAvailable`
said no for `config.machine`: the app's mount didn't forward `api/host`
(#701). Ganymede #973 forwards `api/host/grants` (GET, PUT, DELETE), so the
page now says yes for a machine too, and only `kernels === 'page'` and a
non-Ganymede backend stay out. The paths and defaults the sheet shows are
the machine's: they come through its mount, so nothing on this Mac changes.
Any machine server from Ganymede v0.15.0 on already serves a notebook's
grants; ganymede#973 changes only the app's own mount. The app still
bundles Ganymede at `GANYMEDE_REF` v0.17.0, so until that moves the mount
answers a JSON 404 `{"message":"Not Found","reason":null}`. `answer()` now
reads a 404 whose message is missing or exactly "Not Found" as "no
settings", in the words of the side that lacks them: a machine's window is
told it needs a newer version of the app, a server that it needs a newer
Ganymede. A machine's window also dims Notebook Access until the probe of
its open notebook's grant answers, and shows nothing in the toolbar when
it doesn't; the probe now runs for a machine even when the notebook asks
for nothing, so one GET per opened notebook decides. A server's window is
unchanged.

A `ganymede://` link in a machine's notebook did nothing: `Place.opensExternally`
lets only http(s) out of a machine's window, and everything else was
cancelled. `Place.machineLink(_:)` decides one link against the machine:
`notApp` for a web link (or this device, whose links stay `AppURL`'s),
`open(path:)` for `ganymede://open?path=P` with `P` relative to the
machine's root, and `refused` for everything else. `P` is refused when it is
absolute, starts with `~`, or has an empty, `.` or `..` segment, since the
mount would be asked for a path above its root; `run`, `new`,
`open?folder=&file=`, x-callback URLs and a link that doesn't parse are
refused too. `Place.linkAction(for:clicked:)` now holds the whole decision
`decidePolicyFor` makes for a link, and only a click
(`navigationType == .linkActivated`) acts: a script's navigation to
`ganymede://` in a machine's window is cancelled without a word, so a
script in an output frame can't make the notice loop. `open` runs the
page's `open` with the path, in the same window, and `refused` shows
"This link names a file on another computer." as a sheet on the window, not
an app-modal alert. Never `openExternally` or `AppURLHandler`, so nothing
acts on this Mac. `appLinks` in `Place.allows` stays this device's, and
`createWebViewWith` is unchanged.

Part of ganymede#965, section 2. By-hand checks on #399 (Mac) and #273
(iPad and iPhone).
