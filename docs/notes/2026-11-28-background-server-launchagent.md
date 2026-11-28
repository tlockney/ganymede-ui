## 2026-11-28, background server LaunchAgent (#912)

First step of tlockney/ganymede#965 §4: letting the Mac app run its bundled
`ganymede serve` in the background as a macOS LaunchAgent, off by default.
Local notebook windows still use the app's embedded server; routing them
through the background server, the menu bar item and CLI attach are later
steps.

- **LaunchAgent plist.** `apple/LaunchAgents/com.ganymede-server.Ganymede.server.plist`
  is copied into `Ganymede.app/Contents/Library/LaunchAgents/` by a Copy
  Files build phase in `apple/project.yml` and checked by
  `apple/scripts/check-app-bundle.sh` (valid plist, `Label`
  `com.ganymede-server.Ganymede.server`, `BundleProgram`
  `Contents/Helpers/ganymede`, `ProgramArguments` `ganymede serve
--no-browser --port 0`, `RunAtLoad`, `KeepAlive`, `ProcessType`
  `Interactive`). No token or environment secret lives in the plist: the
  server writes its random per-launch token to `jpserver-<pid>.json` (0600)
  in the Jupyter runtime directory, and reads settings from `ganymede.toml`.
- **Two flags deferred to `ganymede`.** `--path-from-login-shell`
  (`tlockney/ganymede#999`) is omitted from `ProgramArguments` while
  `GANYMEDE_REF` is still `v0.17.0` and doesn't recognize it. Likewise,
  `StandardOutPath` and `StandardErrorPath` are omitted from the plist:
  `SMAppService` requires a static plist sealed inside the signed bundle,
  and `launchd` does not expand `~` or `$HOME` in those keys (and resolves
  relative paths against `/`, which is read-only). Routing server logs to
  `~/Library/Logs/Ganymede/server.log` belongs in `ganymede serve` itself
  once a newer `GANYMEDE_REF` supports a home-relative log file path.
- **Settings UI and protocol.** `BackgroundServer.swift` wraps
  `SMAppService.agent(plistName:)` and
  `SMAppService.openSystemSettingsLoginItems()` behind
  `BackgroundServerService`, with `BackgroundServerController` driving
  Settings › General › **Keep Ganymede running in the background**. The
  section hides itself when `CommandLineTool.bundledTool()` is nil
  (`GANYMEDE_CLI=none` builds). Register and unregister errors are always
  captured and shown under the toggle (no `try?`), alongside **Enabled**
  or **Needs approval in System Settings › Login Items** with an **Open
  Login Items…** button, refreshing on appear and app activation.
- **Stable helper signing identifier and version check.** Previously
  `apple/project.yml` and `apple/scripts/release-app.sh` signed
  `Contents/Helpers/ganymede` without `--identifier`, so codesign assigned
  a Mach-O-UUID-derived identifier that changed on every build — which
  meant a newer app could never match an older running helper's signature
  after an update. Both now sign the helper with
  `--identifier com.ganymede-server.Ganymede.helper` (while
  `SystemThisMacProbe.helperIdentifier` still reads the actual signature
  from the bundle). `ThisMacProbe` gains `helperPath` and
  `executablePath(of:)` (`proc_pidpath`, with `KERN_PROCARGS2` fallback
  when an update moved the old bundle aside while keeping its executable
  mapped), and `ThisMacVerifier.scan(in:)` splits verified helpers into
  `verified` (matching `bundledVersion`) and `mismatched`. On app launch
  (`AppDelegate.applicationDidFinishLaunching`) and every `ThisMacChecks`
  scan, when the LaunchAgent is enabled, `ThisMacChecks` sends `SIGTERM`
  only to verified mismatched pids so `launchd` restarts the server on the
  new binary — never to an unverified pid, and at most once per pid while
  it shuts down. Note for follow-up: if an updater immediately unlinks the
  old `.app` bundle before the new app runs, `SecCodeCopyGuestWithAttributes`
  returns `ENOENT` (`100002`) for the orphaned process, so a future
  Sparkle update hook should also unregister and re-register the
  `SMAppService` as Apple's `SMAppService.h` recommends.
