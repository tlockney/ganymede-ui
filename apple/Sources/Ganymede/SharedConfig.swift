import Foundation
import GanymedeFFI

/// Reading and updating `ganymede.toml` through ganymede-ffi's C ABI
/// (`ganymede_config_read` and `ganymede_config_set`, ganymede#995).
/// Swift never parses or writes TOML directly.
enum GanymedeConfig {
    struct ConfigError: LocalizedError, Equatable {
        let message: String
        var errorDescription: String? { message }
    }

    /// Secrets that the app must never write into `ganymede.toml` (#902):
    /// `token` and `mcp_token` stay out of the config file.
    static let forbiddenKeys: Set<String> = ["token", "mcp_token"]

    /// Reads `ganymede.toml` in `directory` (`nil`: Ganymede's default config
    /// dir, falling back to the legacy Jupyter config dir as `ganymede serve`
    /// does) and returns its keys as a JSON object (`[:]` when there is no
    /// file).
    static func read(in directory: String? = nil) throws -> [String: Any] {
        var error: UnsafeMutablePointer<CChar>?
        let raw: UnsafeMutablePointer<CChar>? = directory.map { dir in
            dir.withCString { ganymede_config_read($0, &error) }
        } ?? ganymede_config_read(nil, &error)
        guard let raw else {
            let message = error.map { String(cString: $0) } ?? "could not read ganymede.toml"
            ganymede_string_free(error)
            throw ConfigError(message: message)
        }
        let json = String(cString: raw)
        ganymede_string_free(raw)
        guard let object = try JSONSerialization.jsonObject(with: Data(json.utf8)) as? [String: Any] else {
            throw ConfigError(message: "ganymede_config_read did not return a JSON object")
        }
        return object
    }

    /// Applies `patch` to `ganymede.toml` in `directory` (`nil`: Ganymede's
    /// default config dir). Refuses to write `token` or `mcp_token`.
    /// Comments, key order and untouched keys are preserved by the C library;
    /// invalid edits and a legacy file in the Jupyter config dir return an
    /// error leaving the file untouched.
    static func set(_ patch: [String: Any], in directory: String? = nil) throws {
        try assertNoSecrets(in: patch)
        let data = try JSONSerialization.data(withJSONObject: patch)
        let json = String(decoding: data, as: UTF8.self)
        var error: UnsafeMutablePointer<CChar>?
        let status: Int32 = json.withCString { jsonPtr in
            if let directory {
                return directory.withCString { dirPtr in
                    ganymede_config_set(dirPtr, jsonPtr, &error)
                }
            }
            return ganymede_config_set(nil, jsonPtr, &error)
        }
        if status != 0 {
            let message = error.map { String(cString: $0) } ?? "could not write ganymede.toml"
            ganymede_string_free(error)
            throw ConfigError(message: message)
        }
    }

    /// Rejects any patch containing `token` or `mcp_token` at any nesting depth.
    static func assertNoSecrets(in patch: [String: Any]) throws {
        for (key, value) in patch {
            if forbiddenKeys.contains(key) {
                throw ConfigError(message: "Ganymede never writes \(key) to ganymede.toml.")
            }
            if let nested = value as? [String: Any] {
                try assertNoSecrets(in: nested)
            }
        }
    }

    /// Reads a JSON boolean strictly, without coercing numeric `0`/`1`.
    static func boolValue(_ value: Any?) -> Bool? {
        guard let number = value as? NSNumber,
              CFGetTypeID(number) == CFBooleanGetTypeID()
        else { return nil }
        return number.boolValue
    }

    /// Converts a JSON object from `JSONSerialization` into a strictly
    /// `Sendable` dictionary for passing to `ServerHost` off the main actor.
    static func sendableDictionary(_ dict: [String: Any]) -> [String: any Sendable] {
        var out: [String: any Sendable] = [:]
        out.reserveCapacity(dict.count)
        for (key, value) in dict {
            if let converted = sendableValue(value) {
                out[key] = converted
            }
        }
        return out
    }

    private static func sendableValue(_ value: Any) -> (any Sendable)? {
        if let string = value as? String { return string }
        if let number = value as? NSNumber {
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue
            }
            if CFNumberIsFloatType(number) {
                return number.doubleValue
            }
            return number.int64Value
        }
        if let dict = value as? [String: Any] {
            return sendableDictionary(dict)
        }
        if let array = value as? [Any] {
            return array.compactMap(sendableValue)
        }
        return nil
    }
}

/// Backing store for `ganymede.toml`, behind a protocol so unit tests can use
/// a temporary directory or inject errors without touching `~/.config/ganymede`.
protocol GanymedeConfigStore: Sendable {
    func read() throws -> [String: Any]
    func set(_ patch: [String: Any]) throws
}

/// Real store backed by `ganymede_config_read` and `ganymede_config_set`.
struct SystemGanymedeConfigStore: GanymedeConfigStore {
    let directory: String?

    init(directory: String? = nil) {
        self.directory = directory
    }

    func read() throws -> [String: Any] {
        try GanymedeConfig.read(in: directory)
    }

    func set(_ patch: [String: Any]) throws {
        try GanymedeConfig.set(patch, in: directory)
    }
}

#if os(macOS)
/// Mac app settings stored in `ganymede.toml` so the embedded server and
/// `ganymede serve` share one config file (#902):
/// - `mcp_enabled`, `mcp_read_only`, `mcp_no_execute`, `mcp_images`
/// - `[tailscale] allow`
/// - `[host]` defaults (`read` from Settings › Spotlight, plus any other
///   `[host]` keys in the file)
///
/// Secrets (`token`, `mcp_token`) are never written to the file.
enum SharedConfig {
    /// UserDefaults flag recording that legacy settings were migrated once
    /// into `ganymede.toml` and removed from UserDefaults.
    static let migratedKey = "sharedConfigMigrated"

    /// The Mac app's shared settings read from `ganymede.toml`.
    struct Settings: Equatable {
        var mcpMode: MCPMode = .off
        var mcpImages: Bool = false
        var tailnetAllow: [String] = []
        var hostFolders: [URL] = []
    }

    /// Loaded settings plus any read or migration error to show in Settings.
    struct LoadResult: Equatable {
        var settings: Settings
        var error: String?
    }

    /// Derives `MCPMode` from `ganymede.toml`'s MCP keys.
    static func mcpMode(from config: [String: Any]) -> MCPMode {
        guard GanymedeConfig.boolValue(config["mcp_enabled"]) == true else { return .off }
        if GanymedeConfig.boolValue(config["mcp_read_only"]) == true { return .readOnly }
        if GanymedeConfig.boolValue(config["mcp_no_execute"]) == true { return .editOnly }
        return .full
    }

    /// JSON patch for MCP settings in `ganymede.toml`. Never contains `mcp_token`.
    static func mcpPatch(mode: MCPMode, images: Bool) -> [String: Any] {
        [
            "mcp_enabled": mode != .off,
            "mcp_read_only": mode == .readOnly,
            "mcp_no_execute": mode == .editOnly,
            "mcp_images": images,
        ]
    }

    /// JSON patch for `[tailscale] allow` in `ganymede.toml`.
    static func tailnetPatch(allow: [String]) -> [String: Any] {
        ["tailscale": ["allow": allow]]
    }

    /// JSON patch for `[host] read` in `ganymede.toml`.
    static func hostReadPatch(folders: [URL]) -> [String: Any] {
        ["host": HostDefaults.serverConfig(folders: folders)]
    }

    /// Reads the Mac app's shared settings from a decoded `ganymede.toml` object.
    static func settings(from config: [String: Any]) -> Settings {
        let tailscale = config["tailscale"] as? [String: Any]
        let allow = (tailscale?["allow"] as? [String]) ?? []
        let host = config["host"] as? [String: Any]
        let readPaths = (host?["read"] as? [String]) ?? []
        return Settings(
            mcpMode: mcpMode(from: config),
            mcpImages: GanymedeConfig.boolValue(config["mcp_images"]) ?? false,
            tailnetAllow: allow,
            hostFolders: HostDefaults.folders(fromRead: readPaths)
        )
    }

    /// One-time migration of legacy `UserDefaults` values into `ganymede.toml`,
    /// removing them from `UserDefaults` once written. Keys already set in
    /// `ganymede.toml` are kept as-is. Returns an error string if reading or
    /// writing fails, leaving `UserDefaults` intact so migration retries once
    /// the problem is fixed.
    @discardableResult
    static func migrateIfNeeded(
        defaults: UserDefaults = .standard,
        store: any GanymedeConfigStore = SystemGanymedeConfigStore()
    ) -> String? {
        guard !defaults.bool(forKey: migratedKey) else { return nil }

        let hasMCPMode = defaults.object(forKey: AppMCP.modeKey) != nil
        let hasMCPImages = defaults.object(forKey: AppMCP.imagesKey) != nil
        let hasTailnetAllow = defaults.object(forKey: AppTailnet.allowKey) != nil
        let hasHostFolders = defaults.object(forKey: SpotlightKeys.folders) != nil

        guard hasMCPMode || hasMCPImages || hasTailnetAllow || hasHostFolders else {
            defaults.set(true, forKey: migratedKey)
            return nil
        }

        let existing: [String: Any]
        do {
            existing = try store.read()
        } catch {
            return error.localizedDescription
        }

        var patch: [String: Any] = [:]
        if hasMCPMode,
           existing["mcp_enabled"] == nil,
           existing["mcp_read_only"] == nil,
           existing["mcp_no_execute"] == nil {
            let mode = defaults.string(forKey: AppMCP.modeKey).flatMap(MCPMode.init(rawValue:)) ?? .off
            patch["mcp_enabled"] = mode != .off
            patch["mcp_read_only"] = mode == .readOnly
            patch["mcp_no_execute"] = mode == .editOnly
        }
        if hasMCPImages, existing["mcp_images"] == nil {
            patch["mcp_images"] = defaults.bool(forKey: AppMCP.imagesKey)
        }
        if hasTailnetAllow, (existing["tailscale"] as? [String: Any])?["allow"] == nil {
            let allow = defaults.stringArray(forKey: AppTailnet.allowKey) ?? []
            patch["tailscale"] = ["allow": allow]
        }
        if hasHostFolders, (existing["host"] as? [String: Any])?["read"] == nil {
            let folders = (defaults.stringArray(forKey: SpotlightKeys.folders) ?? [])
                .map { URL(fileURLWithPath: $0, isDirectory: true) }
            patch["host"] = HostDefaults.serverConfig(folders: folders)
        }

        if !patch.isEmpty {
            do {
                try store.set(patch)
            } catch {
                return error.localizedDescription
            }
        }

        defaults.removeObject(forKey: AppMCP.modeKey)
        defaults.removeObject(forKey: AppMCP.imagesKey)
        defaults.removeObject(forKey: AppTailnet.allowKey)
        defaults.removeObject(forKey: SpotlightKeys.folders)
        defaults.set(true, forKey: migratedKey)
        return nil
    }

    /// Migrates once if needed, then loads settings from `ganymede.toml`.
    /// When reading or migration fails, returns the error (for Settings to
    /// display) and falls back to any unmigrated `UserDefaults` values so the
    /// app can still open Settings.
    static func load(
        defaults: UserDefaults = .standard,
        store: any GanymedeConfigStore = SystemGanymedeConfigStore()
    ) -> LoadResult {
        let migrationError = migrateIfNeeded(defaults: defaults, store: store)
        do {
            let file = try store.read()
            var loaded = settings(from: file)
            if migrationError != nil {
                applyUnmigratedFallbacks(to: &loaded, file: file, defaults: defaults)
            }
            return LoadResult(settings: loaded, error: migrationError)
        } catch {
            var fallback = Settings()
            applyUnmigratedFallbacks(to: &fallback, file: [:], defaults: defaults)
            return LoadResult(settings: fallback, error: migrationError ?? error.localizedDescription)
        }
    }

    private static func applyUnmigratedFallbacks(
        to result: inout Settings,
        file: [String: Any],
        defaults: UserDefaults
    ) {
        if file["mcp_enabled"] == nil,
           file["mcp_read_only"] == nil,
           file["mcp_no_execute"] == nil,
           let raw = defaults.string(forKey: AppMCP.modeKey),
           let mode = MCPMode(rawValue: raw) {
            result.mcpMode = mode
        }
        if file["mcp_images"] == nil, defaults.object(forKey: AppMCP.imagesKey) != nil {
            result.mcpImages = defaults.bool(forKey: AppMCP.imagesKey)
        }
        if (file["tailscale"] as? [String: Any])?["allow"] == nil,
           let allow = defaults.stringArray(forKey: AppTailnet.allowKey) {
            result.tailnetAllow = allow
        }
        if (file["host"] as? [String: Any])?["read"] == nil,
           let paths = defaults.stringArray(forKey: SpotlightKeys.folders) {
            result.hostFolders = paths.map { URL(fileURLWithPath: $0, isDirectory: true) }
        }
    }

    /// Reads `ganymede.toml` and merges the Mac app's launch-only keys
    /// (`root_dir`, `static_dir`, `quiet`, optional `cookie_secret_file`,
    /// gateway remote, and in-memory keychain `mcp_token`) for
    /// `ganymede_server_start`. Never writes to `ganymede.toml`.
    static func launchConfig(
        store: any GanymedeConfigStore = SystemGanymedeConfigStore(),
        rootDir: String,
        staticDir: String,
        cookieSecretFile: String? = nil,
        gatewayURL: String? = nil,
        gatewayToken: String? = nil,
        mcpMode: MCPMode,
        mcpImages: Bool,
        mcpToken: String?,
        fallbackHostFolders: [URL]
    ) -> (config: [String: any Sendable], error: String?) {
        var config: [String: any Sendable]
        var readError: String?
        do {
            config = GanymedeConfig.sendableDictionary(try store.read())
        } catch {
            config = [:]
            readError = error.localizedDescription
        }

        // Launch-only keys for the embedded server.
        config["root_dir"] = rootDir
        config["static_dir"] = staticDir
        config["quiet"] = true
        if let cookieSecretFile {
            config["cookie_secret_file"] = cookieSecretFile
        }

        if let gatewayURL {
            config["gateway_url"] = gatewayURL
            if let gatewayToken {
                config["gateway_token"] = gatewayToken
            }
        }

        if mcpMode != .off, let mcpToken, !mcpToken.isEmpty {
            config.merge(AppMCP.serverConfig(mode: mcpMode, images: mcpImages, token: mcpToken)) { $1 }
        } else {
            config["mcp_enabled"] = false
            config.removeValue(forKey: "mcp_token")
        }

        // The Mac embedded server is rooted at `/`: if `ganymede.toml` does not
        // set `[host] read`, default it to `[]` (or fallback folders on read
        // error) rather than letting Ganymede's `[""]` default expose the whole
        // disk, while keeping any `[host] edit_self` / `[host] run` from the file.
        var host = (config["host"] as? [String: any Sendable]) ?? [:]
        if host["read"] == nil {
            host["read"] = readError != nil
                ? fallbackHostFolders.map { FolderEntry.serverPath($0) }
                : [String]()
        }
        config["host"] = host

        return (config, readError)
    }

    /// Merges active `tailscale serve` launch settings (`local_hostnames`,
    /// `trust_xheaders`, `[tailscale] allow`) into a launch config while
    /// preserving any other `local_hostnames` or `[tailscale]` keys from
    /// `ganymede.toml`.
    static func mergeTailnet(
        into config: [String: any Sendable],
        dnsName: String,
        allow: [String]
    ) -> [String: any Sendable] {
        var merged = config
        var hostnames = (merged["local_hostnames"] as? [any Sendable])?.compactMap { $0 as? String }
            ?? (merged["local_hostnames"] as? [String])
            ?? ["localhost"]
        if !hostnames.contains("localhost") { hostnames.insert("localhost", at: 0) }
        if !hostnames.contains(dnsName) { hostnames.append(dnsName) }
        merged["local_hostnames"] = hostnames
        merged["trust_xheaders"] = true
        var tailscale = (merged["tailscale"] as? [String: any Sendable]) ?? [:]
        tailscale["allow"] = allow
        merged["tailscale"] = tailscale
        return merged
    }
}
#endif
