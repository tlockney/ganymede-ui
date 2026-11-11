## 2026-11-11, Ship the share extension behind its switch (#449)

The share extension from #435 is now embedded in both apps. It is still a
spike, off until Settings › Device › Run Notebooks from the Share Sheet
is on, and that section also lists the notebooks it offers, with Add
Notebook… and Remove. The extension reads the switch from the App
Group's defaults, so with it off the sheet explains how to turn it on.

The App Group differs by platform. iOS uses
`group.com.ganymede-server.Ganymede`, registered for the team, with an
App Store profile for the app and one for the extension
(`IOS_SHARE_PROFILE`); `release-ios.sh` checks that both include the
group and maps each bundle ID to its profile. macOS uses the
team-prefixed `$(TeamIdentifierPrefix)com.ganymede-server.Ganymede`,
which a Developer ID build can use without a provisioning profile, so
`release-app.sh` is unchanged. Each bundle names its group in Info.plist
(`GanymedeAppGroup`), and `AppGroup` reads it from there; a bundle
without it, such as the unit tests, has no group and keeps everything
in its own defaults.

The permission ledger moved to the group's defaults, so a notebook's
kept "always" reaches the extension. On first use the app copies its
old rows over once; after that the group's rows win, so a revoke isn't
undone by the old copy. Folder grants stay in the app: their bookmarks
are scoped to the app and the extension couldn't open them.

What's left (memory cap, loading large or image items, refreshing a
copy on save) is in #476.
