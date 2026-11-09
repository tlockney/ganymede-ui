## 2026-11-09, Share-sheet extension (#435)

Phase 4.3 of the device API, on the headless runner from #433, so it is
a spike. Two share extensions, `GanymedeShare` for the Mac and
`GanymedeShare-iOS`, from `apple/Sources/Share`: the sheet lists the
notebooks offered to it, runs the chosen one with what was shared as
`device.input` (the first text, the first web link, every file up to
16 MiB), shows the result, and hands `device.output` back to the host
app as an item.

They are built in both schemes but not embedded in the apps, which is
how the spike stays off. Embedding needs the App Group
`group.com.ganymede-server.Ganymede` registered for the team, and an App
Store profile for the extension, since `release-ios.sh` signs the app
alone. #449 lists what shipping takes.

The extension is sandboxed and can't read a notebook where it lives, so
the app copies an offered notebook into the App Group's container
(`ShareNotebooks`), keyed by its original path. That path keys the
ledger, so a kept "always" would carry over once the app's ledger moves
to the group's defaults (#449); until then every permissioned call is
denied. The bridge has the namespaces that need no window: location,
motion, contacts and reminders. The time limit is 20 seconds, shorter
than Shortcuts', since the sheet blocks its host app; there is still no
heap cap, and extensions get far less memory than apps.
