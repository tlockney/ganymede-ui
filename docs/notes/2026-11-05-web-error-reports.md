## 2026-11-05, Opt-in error reports from the web UI (#319)

The page sends unhandled errors to Sentry's `ganymede-web` project when
the user opts in (tlockney/ganymede#384 has the rules).

- `src/lib/crash-reports.ts`. The setting: in the Apple apps,
  `window.ganymedeCrashReports`, which the app sets before the page loads
  (#318); in a browser, `ganymede-ui:crash-reports` in local storage,
  from the Settings sheet. Off loads nothing: `@sentry/browser` is a
  dynamic import, so the bundle and the network stay as they were.
- Only error capture: `defaultIntegrations: false` with global handlers,
  browser API wrapping, linked errors, dedupe and the HTTP context (for
  the user agent). No breadcrumbs, sessions, tracing or replay.
- `scrubEvent` runs in `beforeSend`. It drops an event whose innermost
  frame isn't the page's own file (a notebook's JavaScript output runs in
  the page, and its errors aren't Ganymede's), keeps the exception's
  type, message and frames, rewrites frame URLs to `app:///<path>` (no
  host or port), cuts URLs in messages to their path, home directories
  to `~`, messages to 300 characters, and sends the user agent as the
  only header. Everything else on the event is dropped.
- Source maps: `SENTRY_SOURCEMAPS=1` builds them `hidden`;
  `scripts/sentry-sourcemaps.sh` injects debug IDs, uploads with
  `sentry-cli` (`npx`, pinned) and deletes the maps. The Release
  workflow does this in the web `build` job and, through `bootstrap.sh`,
  in the Mac and iOS jobs, which build the web UI themselves.
- The release is `ganymede-ui@<version>+<commit>`, so a TestFlight build
  from `main` isn't filed under the release before it.
- `window.ganymede.call('test-crash-report')`, and "Send a test report"
  in Settings, throw an error from a timer so it takes the uncaught path.
