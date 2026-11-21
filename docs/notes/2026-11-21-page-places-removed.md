## 2026-11-21, Remove the page's place list (#773)

Every app window loads with `chrome=native` (#740, #761), so `App.tsx` never
draws the page's `Sidebar` there and its place switcher was never shown. The
app's native place menus (`switchPlace` in `ContentView`, `NavigatorSidebar`,
`IPadChrome`, `NativeChrome`) read `AppModel.places` instead. In a browser
there is no `window.ganymedePlaces` and no `place` handler, so the list was
empty and the switcher disabled. The page's place list was dead code, and it
kept a script message handler (`place`) on machine pages that nothing used.

- Swift: `Places.updateEvent`, `updateScript`, `changeScript` and `pageJSON`,
  `Place.Capability.switchPlace`, `WebViewCoordinator.places` and its
  `ganymedePlaces` user script, `PlaceHandler` with `received(place:)`, and
  the `places:` and `onOpenPlace:` parameters of `WebView` (and
  `ContentView`'s `openPlace`, which only fed it) are gone. A machine now
  allows `settings` and `nativeChrome` only, and this device every
  capability. `PlaceEntry`, `Places.entries` and the native menus stay.
- Page: `usePlaces`, `pagePlaces`, `PlaceInfo`, `PLACES_EVENT`, the
  `ganymedePlaces` global and `openPlace` are gone, with the `places` and
  `onPlace` props of `Sidebar`. The place name and reachability dot remain
  as a plain label (`PlaceLabel`, `role="status"`, same
  `aria-label`), no longer a button with a menu.
- Docs: `docs/design/connected-machines.md` says the app's native menus
  switch places.
- A machine's page now has one entry point less into the app: the `place`
  handler is no longer registered there, and a machine's page is not this
  device's.

Tests: `PlaceTests` drops the change-script and page-JSON tests and expects a
machine to allow exactly `settings` and `nativeChrome` and to register
exactly `settings`, `state` and `document`; this device allows every
capability. `places.test.ts` drops `pagePlaces` and `usePlaces`;
`Sidebar.test.tsx` and `App.test.tsx` check a machine window's sidebar shows
the place name and dot as a label with no menu.

Checks: `npm run check`, `npm test`, `npm run build`. Swift can't build in
the container; CI's macos-app job is the first compile.
