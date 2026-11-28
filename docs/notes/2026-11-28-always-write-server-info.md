## 2026-11-28, always write jpserver info file on Mac (#934)

Part of tlockney/ganymede#965 §4 (CLI attach): the Mac app now writes its
`jpserver-<pid>.json` info file whenever its embedded server is running,
not only while MCP is enabled.

- **Scoped secret handling.** `AppMCP.serverInfo(serverURL:settings:pid:version:)`
  always produces a server info dictionary when `root_dir` and `serverURL`
  are valid, setting `token` to `mcp_token` only while `mcp_enabled` is
  true and `mcp_token` is non-empty, and `""` otherwise (`password: false`).
  The app's own page/session token is never written to disk. When the
  bundled `ganymede` helper is present, `ganymede_version` is included
  (resolved once off the main thread via `SystemThisMacProbe().bundledVersion`
  before `writeServerInfo`).
- **Atomic writes and lifecycle.** `AppModel` continues writing via
  `AppMCP.writeServerInfo` (mode `0600` temp file + atomic `rename`),
  removing stale `ganymede_app: true` files from dead pids, rewriting on
  MCP toggles/restarts (`setMCP` / `resetMCPToken` restart the server), and
  removing the file on server stop and quit.
- **Verifier isolation.** `ThisMacVerifier.read(_:)` now explicitly skips
  files marked `ganymede_app: true` in addition to rejecting empty tokens,
  so the app's own embedded server info file is never mistaken for a
  background helper server or sent `SIGTERM` even when MCP is enabled.
