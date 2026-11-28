import XCTest

/// Tests for `GanymedeConfig` (`ganymede_config_read` / `ganymede_config_set`)
/// and `SharedConfig` (#902): round-tripping settings through `ganymede.toml`,
/// preserving comments and untouched keys, one-time `UserDefaults` migration,
/// refusing secrets (`token`, `mcp_token`), launch config merging, and error
/// surfacing.
final class SharedConfigTests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent("ganymede-config-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    // MARK: C ABI (macOS and iOS)

    func testMissingFileReadsEmptyAndFirstSetCreates0600() throws {
        let initial = try GanymedeConfig.read(in: dir.path)
        XCTAssertTrue(initial.isEmpty)

        try GanymedeConfig.set(["mcp_enabled": true, "mcp_images": true], in: dir.path)

        let file = dir.appendingPathComponent("ganymede.toml")
        XCTAssertTrue(FileManager.default.fileExists(atPath: file.path))
        let fileMode = try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? Int
        XCTAssertEqual(fileMode, 0o600)
        let dirMode = try FileManager.default.attributesOfItem(atPath: dir.path)[.posixPermissions] as? Int
        XCTAssertEqual(dirMode, 0o700)

        let readBack = try GanymedeConfig.read(in: dir.path)
        XCTAssertEqual(GanymedeConfig.boolValue(readBack["mcp_enabled"]), true)
        XCTAssertEqual(GanymedeConfig.boolValue(readBack["mcp_images"]), true)
    }

    func testSetPreservesCommentsOrderAndUntouchedKeys() throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("ganymede.toml")
        let original = """
        # Custom server settings
        cull_idle_secs = 600

        # Tailnet config
        [tailscale]
        cli = "/opt/homebrew/bin/tailscale"
        allow = ["old@example.com"]

        # Host defaults
        [host]
        edit_self = false
        read = ["Users/a/Old"]
        """
        try original.write(to: file, atomically: true, encoding: .utf8)

        try GanymedeConfig.set([
            "mcp_enabled": true,
            "mcp_read_only": true,
            "tailscale": ["allow": ["me@example.com"]],
            "host": ["read": ["Users/a/Notes"]],
        ], in: dir.path)

        let updated = try String(contentsOf: file, encoding: .utf8)
        XCTAssertTrue(updated.contains("# Custom server settings"), updated)
        XCTAssertTrue(updated.contains("cull_idle_secs = 600"), updated)
        XCTAssertTrue(updated.contains("# Tailnet config"), updated)
        XCTAssertTrue(updated.contains(#"cli = "/opt/homebrew/bin/tailscale""#), updated)
        XCTAssertTrue(updated.contains("# Host defaults"), updated)
        XCTAssertTrue(updated.contains("edit_self = false"), updated)

        let parsed = try GanymedeConfig.read(in: dir.path)
        XCTAssertEqual((parsed["cull_idle_secs"] as? NSNumber)?.int64Value, 600)
        XCTAssertEqual(((parsed["tailscale"] as? [String: Any])?["allow"] as? [String]), ["me@example.com"])
        XCTAssertEqual(((parsed["tailscale"] as? [String: Any])?["cli"] as? String), "/opt/homebrew/bin/tailscale")
        XCTAssertEqual(((parsed["host"] as? [String: Any])?["read"] as? [String]), ["Users/a/Notes"])
        XCTAssertEqual(GanymedeConfig.boolValue((parsed["host"] as? [String: Any])?["edit_self"]), false)
    }

    func testSecretsAreNeverWrittenToConfig() throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("ganymede.toml")

        XCTAssertThrowsError(try GanymedeConfig.set(["token": "secret"], in: dir.path)) { error in
            XCTAssertTrue(error.localizedDescription.contains("token"), "\(error)")
        }
        XCTAssertThrowsError(try GanymedeConfig.set(["mcp_token": "agent-secret"], in: dir.path)) { error in
            XCTAssertTrue(error.localizedDescription.contains("mcp_token"), "\(error)")
        }
        XCTAssertThrowsError(try GanymedeConfig.set(["nested": ["mcp_token": "agent-secret"]], in: dir.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: file.path), "refused secret must not create the file")
    }

    func testInvalidEditThrowsAndLeavesFileUnchanged() throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("ganymede.toml")
        let before = "mcp_enabled = true\n"
        try before.write(to: file, atomically: true, encoding: .utf8)

        XCTAssertThrowsError(try GanymedeConfig.set(["not_a_real_key": 123], in: dir.path))
        XCTAssertThrowsError(try GanymedeConfig.set(["mcp_enabled": "yes"], in: dir.path))

        let after = try String(contentsOf: file, encoding: .utf8)
        XCTAssertEqual(after, before)
    }

    #if os(macOS)

    // MARK: Mac shared settings, migration, launch merging, and error surfacing

    private func makeSuite() throws -> (UserDefaults, String) {
        let name = "SharedConfigTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: name))
        return (defaults, name)
    }

    func testSettingsRoundTripThroughConfigFile() throws {
        let store = SystemGanymedeConfigStore(directory: dir.path)
        let folders = [
            URL(fileURLWithPath: "/Users/alice/Notes", isDirectory: true),
            URL(fileURLWithPath: "/Volumes/Work/Lab", isDirectory: true),
        ]

        try store.set(SharedConfig.mcpPatch(mode: .readOnly, images: true))
        try store.set(SharedConfig.tailnetPatch(allow: ["alice@example.com", "tag:agent"]))
        try store.set(SharedConfig.hostReadPatch(folders: folders))

        let raw = try store.read()
        XCTAssertNil(raw["token"])
        XCTAssertNil(raw["mcp_token"])

        let settings = SharedConfig.settings(from: raw)
        XCTAssertEqual(settings.mcpMode, .readOnly)
        XCTAssertEqual(settings.mcpImages, true)
        XCTAssertEqual(settings.tailnetAllow, ["alice@example.com", "tag:agent"])
        XCTAssertEqual(settings.hostFolders, folders)

        // Switching to editOnly, full, and off round-trips accurately.
        try store.set(SharedConfig.mcpPatch(mode: .editOnly, images: false))
        XCTAssertEqual(SharedConfig.settings(from: try store.read()).mcpMode, .editOnly)
        XCTAssertEqual(SharedConfig.settings(from: try store.read()).mcpImages, false)

        try store.set(SharedConfig.mcpPatch(mode: .full, images: true))
        XCTAssertEqual(SharedConfig.settings(from: try store.read()).mcpMode, .full)

        try store.set(SharedConfig.mcpPatch(mode: .off, images: false))
        XCTAssertEqual(SharedConfig.settings(from: try store.read()).mcpMode, .off)

        // None of the app's generated patches ever carry secrets.
        for mode in MCPMode.allCases {
            for images in [false, true] {
                let patch = SharedConfig.mcpPatch(mode: mode, images: images)
                XCTAssertNil(patch["token"])
                XCTAssertNil(patch["mcp_token"])
                XCTAssertNoThrow(try GanymedeConfig.assertNoSecrets(in: patch))
            }
        }
    }

    func testHandEditedFileShowsInLoadedSettings() throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("ganymede.toml")
        try """
        mcp_enabled = true
        mcp_no_execute = true
        mcp_images = true

        [tailscale]
        allow = ["hand@example.com"]

        [host]
        read = ["", "Users/alice/Research", "/Users/alice/Research/"]
        edit_self = false
        """.write(to: file, atomically: true, encoding: .utf8)

        let (defaults, suite) = try makeSuite()
        defer { defaults.removePersistentDomain(forName: suite) }

        let store = SystemGanymedeConfigStore(directory: dir.path)
        let loaded = SharedConfig.load(defaults: defaults, store: store)
        XCTAssertNil(loaded.error)
        XCTAssertEqual(loaded.settings.mcpMode, .editOnly)
        XCTAssertEqual(loaded.settings.mcpImages, true)
        XCTAssertEqual(loaded.settings.tailnetAllow, ["hand@example.com"])
        // Empty "" (whole root) is skipped for Spotlight; duplicates deduplicated.
        XCTAssertEqual(
            loaded.settings.hostFolders,
            [URL(fileURLWithPath: "/Users/alice/Research", isDirectory: true)]
        )
    }

    func testOneTimeMigrationMovesUserDefaultsAndClearsThem() throws {
        let (defaults, suite) = try makeSuite()
        defer { defaults.removePersistentDomain(forName: suite) }

        defaults.set(MCPMode.editOnly.rawValue, forKey: AppMCP.modeKey)
        defaults.set(true, forKey: AppMCP.imagesKey)
        defaults.set(["alice@example.com"], forKey: AppTailnet.allowKey)
        defaults.set(["/Users/alice/Notes", "/Volumes/Data/Notebooks"], forKey: SpotlightKeys.folders)

        let store = SystemGanymedeConfigStore(directory: dir.path)
        let loaded = SharedConfig.load(defaults: defaults, store: store)
        XCTAssertNil(loaded.error)
        XCTAssertEqual(loaded.settings.mcpMode, .editOnly)
        XCTAssertEqual(loaded.settings.mcpImages, true)
        XCTAssertEqual(loaded.settings.tailnetAllow, ["alice@example.com"])
        XCTAssertEqual(loaded.settings.hostFolders, [
            URL(fileURLWithPath: "/Users/alice/Notes", isDirectory: true),
            URL(fileURLWithPath: "/Volumes/Data/Notebooks", isDirectory: true),
        ])

        // Legacy keys were removed and the migrated flag set.
        XCTAssertNil(defaults.object(forKey: AppMCP.modeKey))
        XCTAssertNil(defaults.object(forKey: AppMCP.imagesKey))
        XCTAssertNil(defaults.object(forKey: AppTailnet.allowKey))
        XCTAssertNil(defaults.object(forKey: SpotlightKeys.folders))
        XCTAssertTrue(defaults.bool(forKey: SharedConfig.migratedKey))

        // Verify the file itself never received secrets.
        let text = try String(contentsOf: dir.appendingPathComponent("ganymede.toml"), encoding: .utf8)
        XCTAssertFalse(text.contains("token"))
        XCTAssertFalse(text.contains("mcp_token"))

        // Migration runs only once: even if someone later writes legacy keys back
        // into UserDefaults and edits ganymede.toml, load reads ganymede.toml.
        defaults.set(MCPMode.full.rawValue, forKey: AppMCP.modeKey)
        defaults.set(["stale@example.com"], forKey: AppTailnet.allowKey)
        try store.set(SharedConfig.mcpPatch(mode: .readOnly, images: false))

        let secondLoad = SharedConfig.load(defaults: defaults, store: store)
        XCTAssertNil(secondLoad.error)
        XCTAssertEqual(secondLoad.settings.mcpMode, .readOnly)
        XCTAssertEqual(secondLoad.settings.mcpImages, false)
        XCTAssertEqual(secondLoad.settings.tailnetAllow, ["alice@example.com"])
    }

    func testMigrationPreservesExistingKeysInConfigFile() throws {
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("ganymede.toml")
        try """
        mcp_enabled = true
        mcp_read_only = true
        """.write(to: file, atomically: true, encoding: .utf8)

        let (defaults, suite) = try makeSuite()
        defer { defaults.removePersistentDomain(forName: suite) }

        defaults.set(MCPMode.full.rawValue, forKey: AppMCP.modeKey)
        defaults.set(["migrated@example.com"], forKey: AppTailnet.allowKey)

        let store = SystemGanymedeConfigStore(directory: dir.path)
        let loaded = SharedConfig.load(defaults: defaults, store: store)
        XCTAssertNil(loaded.error)
        // Existing MCP setting in ganymede.toml wins; missing tailscale.allow is migrated.
        XCTAssertEqual(loaded.settings.mcpMode, .readOnly)
        XCTAssertEqual(loaded.settings.tailnetAllow, ["migrated@example.com"])
        XCTAssertTrue(defaults.bool(forKey: SharedConfig.migratedKey))
        XCTAssertNil(defaults.object(forKey: AppMCP.modeKey))
        XCTAssertNil(defaults.object(forKey: AppTailnet.allowKey))
    }

    func testFreshInstallMarksMigratedWithoutCreatingConfigFile() throws {
        let (defaults, suite) = try makeSuite()
        defer { defaults.removePersistentDomain(forName: suite) }

        let store = SystemGanymedeConfigStore(directory: dir.path)
        let loaded = SharedConfig.load(defaults: defaults, store: store)
        XCTAssertNil(loaded.error)
        XCTAssertEqual(loaded.settings, SharedConfig.Settings())
        XCTAssertTrue(defaults.bool(forKey: SharedConfig.migratedKey))
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.appendingPathComponent("ganymede.toml").path))
    }

    func testMigrationFailureSurfacesErrorAndPreservesUserDefaultsForRetry() throws {
        final class FailingSetStore: GanymedeConfigStore, @unchecked Sendable {
            let message: String
            var failSet = true
            var written: [[String: Any]] = []
            init(_ message: String) { self.message = message }
            func read() throws -> [String: Any] { [:] }
            func set(_ patch: [String: Any]) throws {
                if failSet { throw GanymedeConfig.ConfigError(message: message) }
                written.append(patch)
            }
        }

        let (defaults, suite) = try makeSuite()
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set(MCPMode.readOnly.rawValue, forKey: AppMCP.modeKey)
        defaults.set(["alice@example.com"], forKey: AppTailnet.allowKey)

        let legacyMessage = "/Users/alice/.jupyter/ganymede.toml is in the Jupyter config dir; move it before changing settings"
        let store = FailingSetStore(legacyMessage)

        let first = SharedConfig.load(defaults: defaults, store: store)
        XCTAssertEqual(first.error, legacyMessage)
        // Unmigrated values remain active in memory and stay in UserDefaults.
        XCTAssertEqual(first.settings.mcpMode, .readOnly)
        XCTAssertEqual(first.settings.tailnetAllow, ["alice@example.com"])
        XCTAssertFalse(defaults.bool(forKey: SharedConfig.migratedKey))
        XCTAssertNotNil(defaults.object(forKey: AppMCP.modeKey))
        XCTAssertNotNil(defaults.object(forKey: AppTailnet.allowKey))

        // Once the legacy file is moved, retrying migration succeeds and clears UserDefaults.
        store.failSet = false
        let retryError = SharedConfig.migrateIfNeeded(defaults: defaults, store: store)
        XCTAssertNil(retryError)
        XCTAssertEqual(store.written.count, 1)
        XCTAssertTrue(defaults.bool(forKey: SharedConfig.migratedKey))
        XCTAssertNil(defaults.object(forKey: AppMCP.modeKey))
        XCTAssertNil(defaults.object(forKey: AppTailnet.allowKey))
    }

    func testLaunchConfigReadsFileMergesLaunchKeysAndNeverWritesSecrets() async throws {
        let web = dir.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try "<!doctype html>".write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        let notebook = #"{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}"#
        try notebook.write(to: dir.appendingPathComponent("a.ipynb"), atomically: true, encoding: .utf8)

        let configDir = dir.appendingPathComponent("cfg")
        try FileManager.default.createDirectory(at: configDir, withIntermediateDirectories: true)
        try """
        port = 9999
        root_dir = "/nonexistent/from/file"
        cull_idle_secs = 123

        [host]
        read = ["Notes"]
        edit_self = false
        """.write(to: configDir.appendingPathComponent("ganymede.toml"), atomically: true, encoding: .utf8)

        let store = SystemGanymedeConfigStore(directory: configDir.path)
        let launch = SharedConfig.launchConfig(
            store: store,
            rootDir: dir.path,
            staticDir: web.path,
            cookieSecretFile: dir.appendingPathComponent("cookie_secret").path,
            mcpMode: .readOnly,
            mcpImages: true,
            mcpToken: "keychain-mcp-secret",
            fallbackHostFolders: []
        )
        XCTAssertNil(launch.error)
        XCTAssertEqual(launch.config["root_dir"] as? String, dir.path)
        XCTAssertEqual(launch.config["static_dir"] as? String, web.path)
        XCTAssertEqual(launch.config["cull_idle_secs"] as? Int64, 123)
        XCTAssertEqual(launch.config["mcp_token"] as? String, "keychain-mcp-secret")
        XCTAssertEqual(launch.config["mcp_enabled"] as? Bool, true)
        XCTAssertEqual(launch.config["mcp_read_only"] as? Bool, true)
        XCTAssertEqual(launch.config["mcp_images"] as? Bool, true)

        // Verify ganymede.toml itself was NOT modified and contains no token/mcp_token.
        let fileText = try String(contentsOf: configDir.appendingPathComponent("ganymede.toml"), encoding: .utf8)
        XCTAssertFalse(fileText.contains("keychain-mcp-secret"))
        XCTAssertFalse(fileText.contains("mcp_token"))

        // Start a real ServerHost using the merged launch config (with port: 0).
        var serverConfig = launch.config.mapValues { $0 as Any }
        serverConfig["port"] = 0
        let host = try ServerHost(config: serverConfig)
        defer { host.stop() }

        let endpoint = try XCTUnwrap(ServerEndpoint(serverURL: host.url))
        let (data, response) = try await URLSession.shared.data(for: endpoint.request("api/host/grants/a.ipynb"))
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        let answer = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let defaults = try XCTUnwrap(answer["defaults"] as? [String: Any])
        XCTAssertEqual(defaults["read"] as? [String], ["Notes"])
        XCTAssertEqual(GanymedeConfig.boolValue(defaults["edit_self"]), false)
    }

    func testLaunchConfigDefaultsHostReadToEmptyWhenAbsentFromFile() throws {
        let configDir = dir.appendingPathComponent("cfg")
        try FileManager.default.createDirectory(at: configDir, withIntermediateDirectories: true)
        try """
        [host]
        edit_self = false
        """.write(to: configDir.appendingPathComponent("ganymede.toml"), atomically: true, encoding: .utf8)

        let store = SystemGanymedeConfigStore(directory: configDir.path)
        let launch = SharedConfig.launchConfig(
            store: store,
            rootDir: "/",
            staticDir: "/web",
            mcpMode: .off,
            mcpImages: false,
            mcpToken: nil,
            fallbackHostFolders: []
        )
        XCTAssertNil(launch.error)
        let host = try XCTUnwrap(launch.config["host"] as? [String: any Sendable])
        XCTAssertEqual(host["read"] as? [String], [], "root_dir = / must never default to reading the whole disk")
        XCTAssertEqual(host["edit_self"] as? Bool, false, "other [host] keys in ganymede.toml are preserved")
    }

    func testMergeTailnetPreservesExistingHostnamesAndTailscaleKeys() throws {
        let base: [String: any Sendable] = [
            "local_hostnames": ["localhost", "custom.local"],
            "tailscale": ["cli": "/custom/tailscale", "allow": ["old@example.com"]] as [String: any Sendable],
        ]
        let merged = SharedConfig.mergeTailnet(
            into: base,
            dnsName: "mac.tailnet.ts.net",
            allow: ["me@example.com"]
        )
        XCTAssertEqual(merged["local_hostnames"] as? [String], ["localhost", "custom.local", "mac.tailnet.ts.net"])
        XCTAssertEqual(merged["trust_xheaders"] as? Bool, true)
        let tailscale = try XCTUnwrap(merged["tailscale"] as? [String: any Sendable])
        XCTAssertEqual(tailscale["cli"] as? String, "/custom/tailscale")
        XCTAssertEqual(tailscale["allow"] as? [String], ["me@example.com"])
    }

    func testLaunchConfigHardensEmbeddedServerAgainstServeOnlyKeys() throws {
        let web = dir.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try "<!doctype html>".write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)

        let configDir = dir.appendingPathComponent("cfg")
        try FileManager.default.createDirectory(at: configDir, withIntermediateDirectories: true)
        try """
        ip = "0.0.0.0"
        allow_remote_access = true
        token = ""
        trust_xheaders = true

        [tailscale]
        allow = ["alice@example.com"]
        whois = true
        cli = "/custom/tailscale"

        [kernel_providers]
        enabled = true
        """.write(to: configDir.appendingPathComponent("ganymede.toml"), atomically: true, encoding: .utf8)

        let store = SystemGanymedeConfigStore(directory: configDir.path)
        let launch = SharedConfig.launchConfig(
            store: store,
            rootDir: dir.path,
            staticDir: web.path,
            cookieSecretFile: dir.appendingPathComponent("cookie_secret").path,
            mcpMode: .off,
            mcpImages: false,
            mcpToken: nil,
            fallbackHostFolders: []
        )
        XCTAssertNil(launch.error)
        XCTAssertEqual(launch.config["ip"] as? String, "127.0.0.1")
        XCTAssertEqual(launch.config["allow_remote_access"] as? Bool, false)
        XCTAssertNil(launch.config["token"], "embedded server must generate its own per-launch random token")
        XCTAssertEqual(launch.config["trust_xheaders"] as? Bool, false)
        XCTAssertNil(launch.config["kernel_providers"], "embedded server must not open a second provider socket")

        let tailscale = try XCTUnwrap(launch.config["tailscale"] as? [String: any Sendable])
        XCTAssertEqual(tailscale["allow"] as? [String], [], "tailnet allow activates only via mergeTailnet")
        XCTAssertEqual(tailscale["whois"] as? Bool, false, "whois requires a tailnet ip")
        XCTAssertEqual(tailscale["cli"] as? String, "/custom/tailscale", "tailscale cli is preserved")

        // Real ServerHost starts cleanly on 127.0.0.1 with a non-empty random token.
        var serverConfig = launch.config.mapValues { $0 as Any }
        serverConfig["port"] = 0
        let host = try ServerHost(config: serverConfig)
        defer { host.stop() }
        XCTAssertEqual(host.url.host, "127.0.0.1")
        let endpoint = try XCTUnwrap(ServerEndpoint(serverURL: host.url))
        XCTAssertFalse(endpoint.token.isEmpty)

        // Enabling embedded tailnet sharing via mergeTailnet re-enables allow & trust_xheaders while keeping cli.
        let withTailnet = SharedConfig.mergeTailnet(
            into: launch.config, dnsName: "mac.tailnet.ts.net", allow: ["alice@example.com"]
        )
        XCTAssertEqual(withTailnet["trust_xheaders"] as? Bool, true)
        let mergedTailscale = try XCTUnwrap(withTailnet["tailscale"] as? [String: any Sendable])
        XCTAssertEqual(mergedTailscale["allow"] as? [String], ["alice@example.com"])
        XCTAssertEqual(mergedTailscale["cli"] as? String, "/custom/tailscale")
    }
    #endif
}
