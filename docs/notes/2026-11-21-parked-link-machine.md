## 2026-11-21, A parked link switches a machine's scene to this device (#762)

Two Lows from #761's review.

- A link parked in `LinkOpener.showWhenServed` (the server is restarting,
  `servedRoot == nil`) while the scene showed a machine never opened:
  `pageReady` runs only when `place.isThisDevice`, so the link waited until
  the person switched back by hand. `waitsForThisDevice(showing:)` is true
  when a link is pending and the place is a machine, and
  `ContentView.showThisDeviceForParkedLink` then calls `switchPlace(.thisDevice)`
  after `links.handle` (`onOpenURL`) and `links.picked` (`linkFolderPicked`).
  `changeFolder` already switched. `switchPlace` calls `PageModel.forgetPage`,
  which makes the page not ready, so this device's page becoming ready is a
  transition and the existing `onChange(of: pageModel.ready)` opens the link;
  no extra `pageReady` call is needed.
- The iPad's Journals poll ran with the sidebar column collapsed. The
  sidebar's own `listShown` didn't help: it follows the sidebar's appear and
  disappear, and a collapsed split-view column stays in the view tree. So
  `ContentView`, which owns the split view's `columns`, passes
  `columnShown` (`NavigatorTab.sidebarColumnShown`: not hidden, and
  not `.automatic` in portrait, which shows the notebook alone). A compact
  window (Split View, Slide Over, a narrow window) makes the split view one
  stack, where `listShown` does follow the sidebar, so the column counts as
  shown there. `NavigatorTab.showsJournals(tabbed:tab:listShown:columnShown:)`
  needs both on the iPad and only `listShown` on the iPhone; a change makes
  the poll's id change and its task end. The rules sit on `NavigatorTab`,
  not in `IPadChrome` (iOS-only), so both test targets compile them.
- `ContentView` keeps the columns as `SidebarColumns` (automatic, hidden,
  shown) and maps them to and from `NavigationSplitViewVisibility`. On the
  iPad simulator `.automatic == .detailOnly` held, so a rule that compared
  the SwiftUI values read landscape's `.automatic` as collapsed (iOS CI).

Tests: `LinkOpenerTests` (a parked link waits for this device while a
machine shows and not while this device shows; a link shown at once waits
for neither) and `NavigatorTabTests` (the iPad's tab, sidebar and column cases,
the split view's column states with and without a compact window, the iPhone's list for every tab).

Checks: `npm run check`, `npm test`, `npm run build`. Swift can't build in
the container; CI's macos-app job is the first compile. The by-hand checks
are on #273.
