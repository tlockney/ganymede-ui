## 2026-11-09, Website and docs links in the apps (#409)

The Mac and iPad Help menus and the iPad and iPhone Settings screen link
to ganymede-server.com, its docs and the apps guide. `HelpLink` holds the
URLs in one place. SwiftUI's `Link` works as a menu item in `Commands` on
both platforms, so neither needs `openURL` plumbing. The apps guide URL is
the one Ganymede's VitePress build publishes for this repo's
`docs/apps.md` (`/docs/ganymede-ui/apps`); renaming that file breaks the
link, and the test pins the URL so the change is visible.
