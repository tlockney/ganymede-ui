## 2026-11-26, My name goes to a connected machine's rooms (#842)

`Place.allows(.personName)` was false for a machine, so a machine's
window never got `PersonName.pageScript`, and an agent working in a
journal on that machine saw my edits `by "a person"`. The page already
sends the name to rooms on its own origin, and a machine's rooms are
reached through the app's relay on that same origin, so only the app's
gate stopped it.

`Remote` gains `sharesName: Bool?`, nil meaning on: a remote saved by
an older build has no key, so synthesized Codable decodes it as on
(`shares`), and the editor saves off as `false` and on back as nil.
`Place.allows(_:sharesName:)` gives a machine `personName` only when
the setting says so; this device always gets it, and the rest of the
table is whatever `allows(_:)` says. `WebView`, its store and its
coordinator carry the flag, so a machine's windows pick the setting up
as they are made again; `Place` never reads the saved remotes itself.
The toggle is "Show my name in this machine's notebooks", in the
machine's editor on the Mac, iPad and iPhone.

`PlaceTests` checks the gate both ways and that the rest of the table is
unchanged; `RemoteStoreTests` decodes JSON as an older build wrote it
and round-trips off through the store. `npm test` and `npm run check`
pass, and `xcodebuild test` for the GanymedeTests scheme passes on
macOS.

By-hand checks are on #399.
