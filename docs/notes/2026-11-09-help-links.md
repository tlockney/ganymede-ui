## 2026-11-09, Website and docs links in the apps (#409)

The Mac and iPad Help menus and the iPad and iPhone Settings screen link
to ganymede-server.com, its docs and the apps guide. `HelpLink` holds the
URLs in one place, including the privacy page the crash reports question
links to. The menus use `Button` with `openURL` rather than `Link`, which
the iPadOS menu bar may not show as an item. The apps guide URL is the
one Ganymede's VitePress build publishes for this repo's `docs/apps.md`
(`/docs/ganymede-ui/apps`); a test fails if that file is renamed.
