## 2026-11-26, My name goes to a connected machine's rooms (#842)

`Place.allows(.personName)` was false for a machine, so a machine's
window never got `PersonName.pageScript`, and an agent working in a
journal on that machine saw my edits `by "a person"`. The page already
sends the name to rooms on its own origin, and a machine's rooms are
reached through the app's relay on that same origin, so only the app's
gate stopped it.

`Remote` gains `sharesName: Bool?`, nil meaning on: a remote saved by
an older build has no key, so synthesized Codable decodes it as on
(`shares`), and the editor saves off as `false` and on back as nil. An
older build that saves the remotes drops an "off" setting, so after a
downgrade the setting is on again.
`Place.allows(_:sharesName:)` gives a machine `personName` only when
the setting says so; this device always gets it, and the rest of the
table is whatever `allows(_:)` says. `WebView`, its store and its
coordinator carry the flag; a later change to the setting reloads that
machine's open notebook in place, with the new scripts
(`update(sharesName:)`). `Remote.sharesName(for:in:)` is the one lookup
(this device always; an unknown, removed or server-less machine never);
`Place` never reads the saved remotes itself.

A window loads only its own place's pages (`Place.allowsLoading`): this
device's never a machine's, on any path, and a machine's never this
device's or another machine's.

A machine that lets you in by your tailnet login credits edits to that
login (the room's `connect_as`), so the setting doesn't change what it
shows; apps.md and the footer say so. On iPad and iPhone the toggle is
saved but nothing is sent, since they have no name; the footer says so.
The toggle is "Show my name in this machine's notebooks", in the
machine's editor on the Mac, iPad and iPhone.

`PlaceTests` checks the gate both ways and that the rest of the table is
unchanged; `RemoteStoreTests` decodes JSON as an older build wrote it,
round-trips off through the store, and covers `sharesName(for:in:)` and
the editor's on/off mapping. `npm test` and `npm run check`
pass, and `xcodebuild test` for the GanymedeTests scheme passes on
macOS.

By-hand check on #399. README's privacy line is updated too; ganymede#968
adds an `Unreleased in ganymede-ui` note to Ganymede's docs/privacy.md and
merges after this.
