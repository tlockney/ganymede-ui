## 2026-11-28, keep Mac app settings in `ganymede.toml` (#902)

Follow-up to `tlockney/ganymede#995` for `tlockney/ganymede-ui#902` (part of
`tlockney/ganymede#965`, one engine per Mac).

## What changed

- **Pinned `GANYMEDE_REF` to `0f01579d9987cf93b7708bdff17b9263212edc0e`** in
  `.github/workflows/ci.yml` so the Apple apps link the XCFramework with
  `ganymede_config_read` and `ganymede_config_set` (`ganymede#995`) along
  with the room-lock and login-shell PATH fixes (`ganymede#967`, `#999`).
- **Added `apple/Sources/Ganymede/SharedConfig.swift`**:
  - `GanymedeConfig` wraps `ganymede_config_read` and `ganymede_config_set`
    via `GanymedeFFI`. Swift never parses or writes TOML directly.
  - `GanymedeConfig.assertNoSecrets` hard-blocks writing `token` or
    `mcp_token` at any nesting depth before touching the C ABI.
  - `SharedConfig` maps `MCPMode` + `mcpImages` (`mcp_enabled`,
    `mcp_read_only`, `mcp_no_execute`, `mcp_images`), `[tailscale] allow`,
    and `[host] read` (Spotlight folders via `HostDefaults`) to and from
    `ganymede.toml`.
  - `SharedConfig.migrateIfNeeded` performs a one-time migration from
    `UserDefaults` (`mcpMode`, `mcpImages`, `tailnetAllow`,
    `spotlightFolders`) into `ganymede.toml`, preserving any keys already
    present in `ganymede.toml`, removing the legacy `UserDefaults` keys once
    written, and recording `sharedConfigMigrated = true`. If `ganymede_config_set`
    fails (for instance, because of a legacy `~/.jupyter/ganymede.toml`),
    `UserDefaults` stays intact and the error is returned so migration can
    retry once fixed.
  - `SharedConfig.launchConfig` reads `ganymede.toml` at server launch,
    merges launch-only keys (`root_dir`, `static_dir`, `quiet`, optional
    `cookie_secret_file`, gateway remote, and the keychain `mcp_token` in
    memory only), defaults missing `[host] read` to `[]` so `root_dir = "/"`
    never exposes the whole disk while preserving `[host] edit_self` and
    `[host] run`, and `SharedConfig.mergeTailnet` merges active `tailscale
serve` settings without clobbering other `local_hostnames` or
    `[tailscale]` keys.
- **Wired into `AppModel`, `SpotlightIndex`, and `SettingsWindow`** (macOS
  only; iOS stays unchanged and compiles cleanly):
  - `AppModel.init()` loads MCP and Tailnet allow settings through
    `SharedConfig.load`; `AppModel.setMCP` and `AppModel.setTailnet` persist
    via `ganymede_config_set` instead of `UserDefaults`.
  - `SpotlightSettings` loads macOS folders from `[host] read` and persists
    folder additions/removals via `ganymede_config_set`.
  - Read, migration, and write errors from `ganymede_config_read` /
    `ganymede_config_set` are surfaced directly in Settings › General
    (Configuration, MCP, Tailnet, and Spotlight sections) rather than
    dropped.
- **Added `apple/Tests/GanymedeTests/SharedConfigTests.swift`** covering the
  C ABI (`0600`/`0700` creation, comment/order preservation, invalid edit
  rejection, secret blocking), settings round-trip, hand-edited file
  loading, one-time migration and failure retry, launch config merging
  against a real `ServerHost`, and `[tailscale]` merge preservation.
- **Updated `docs/apps.md`** with a Shared `ganymede.toml` settings section
  and `**Unreleased.**` note. Ganymede's `docs/reference.md` and
  `docs/embedding.md` `**Unreleased in ganymede-ui.**` markers will be
  updated when `ganymede-ui` releases.
