## 2026-11-05, Opt-in crash reports in the Apple apps (#318)

Sentry's Cocoa SDK (9.31.0, static XCFramework via SwiftPM) reports to
the `ganymede-apple` project when the person opts in
(tlockney/ganymede#384 has the rules).

- `CrashReports.swift`: the choice is `crashReports` in UserDefaults,
  nil until answered. `GanymedeApp.init` starts the SDK only when it is
  true, before anything else, so a crash at launch is reported. The Mac
  asks with an `NSAlert` after launch ("Don't Send" is the default
  button, ? opens the privacy page); iPad and iPhone with an `.alert` on
  the main window. Settings has a toggle and, while on, test buttons.
  Turning it off calls `SentrySDK.close()`.
- Options: no sessions, breadcrumbs, tracing, network capture, app-hang
  tracking, screenshots or view hierarchy. `beforeSend` (`scrub`) clears
  user, server name, extra, tags and request; keeps `os`, `device` and
  `app` contexts with only model, architecture and version keys
  (`CrashScrub.contexts`, no device name); rewrites home paths in
  messages, exception values, frame files and image paths to `~`.
- Rust: `ganymede_set_panic_callback` (tlockney/ganymede#389) reports a
  panic as a message event captured on the panicking thread, so the
  stack has the Rust frames; a panic in a server task doesn't crash the
  app otherwise. `ganymede_debug_panic` aborts, for the test button.
  `GANYMEDE_REF` points at that PR's commit until it is released.
- dSYMs: `scripts/sentry-dsyms.sh` uploads `<archive>/dSYMs` with
  `sentry-cli` from `release-app.sh` and `release-ios.sh`, so
  `testflight_only` runs upload too. It warns when the app's dSYM has no
  ganymede-ffi line tables.
- The web views get `window.ganymedeCrashReports` as a document-start
  user script, which the page's reporting reads (#319). The value is
  fixed when the web view is made, so windows opened after a change
  follow it.
- iOS privacy manifest declares crash data (not linked, not tracking,
  app functionality). App Store Connect's privacy answers need the same.
