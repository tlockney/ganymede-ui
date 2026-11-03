## 2026-11-03, safe-area insets on phones (#204)

- index.html has set `viewport-fit=cover` since the PWA work, but no CSS
  read `env(safe-area-inset-*)`, so in Safari landscape and the installed
  web app the sidebar and toolbar ran under the notch and home indicator.
- `--safe-top/right/bottom/left` in `:root` hold the insets, and
  `--toolbar-h` now includes the top one: every rule that places something
  under the toolbar (notebook padding, sheets, the find bar, notices) moves
  down with it without its own change. The toolbar and the sidebar's title
  bar pad their top by the inset and keep 52px for their content.
- The other inset rules sit in one "Safe areas" block at the end of
  app.css, so the Mac rules above it read as before; every inset is zero
  there. The sidebar pads only while open: a collapsed sidebar's padding
  would hold a strip of it open in its 0-wide grid column.
- In the iOS app the web view sits below the navigation bar but runs under
  the home indicator (`ignoresSafeArea(.container, edges: .bottom)`), so
  only the bottom inset applies there: the sidebar's footer and the
  notebook's end clear the indicator.
- Chromium emulates insets over CDP (`Emulation.setSafeAreaInsetsOverride`),
  which e2e/safe-area.spec.ts uses at phone sizes, plus a zero-inset run
  that checks the desktop layout is unchanged.
