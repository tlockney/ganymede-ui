import Foundation

/// What agents outside the app may do through `/mcp` on the app's server
/// (#304): Claude Code, Claude Desktop and other MCP clients edit and run
/// the notebooks open in the app, and each change shows in the window as
/// it lands, through the notebook's room. Off by default.
enum MCPMode: String, CaseIterable, Identifiable {
    case off
    /// Reads notebooks; no edits, no runs (`mcp_read_only`).
    case readOnly
    /// Reads and edits notebooks; runs no code (`mcp_no_execute`).
    case editOnly
    /// Reads, edits and runs.
    case full

    var id: String { rawValue }

    var title: String {
        switch self {
        case .off: "Off"
        case .readOnly: "Read only"
        case .editOnly: "Edit, don’t run"
        case .full: "Edit and run"
        }
    }
}

/// The server settings and client configs for the app's MCP (#304).
///
/// Agents configured with `ganymede mcp` find the app's server by the
/// server info file the app writes while MCP is on (the embedded server
/// writes none), and use a server of their own when the app isn't
/// running. Clients that connect over HTTP take the URL and token
/// Settings shows: while MCP is on the token is one the app keeps in the
/// keychain, and the port the one it had last time (`AppModel`), so that
/// config stays good across launches too.
enum AppMCP {
    static let modeKey = "mcpMode"
    static let imagesKey = "mcpImages"
    /// The keychain item holding the token while MCP is on.
    static let tokenKey = "mcp.token"

    /// The `ganymede.toml` keys for `mode`, over the app's own server
    /// config; none when off, so the server serves no `/mcp`.
    static func serverConfig(mode: MCPMode, images: Bool, token: String) -> [String: any Sendable] {
        guard mode != .off, !token.isEmpty else { return [:] }
        return [
            "token": token,
            "mcp_enabled": true,
            "mcp_read_only": mode == .readOnly,
            "mcp_no_execute": mode == .editOnly,
            "mcp_images": images,
        ]
    }

    /// A new token: 32 random hex digits, as `ganymede mcp` makes its own.
    static func newToken() -> String {
        UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
    }

    /// `/mcp` on the server whose base is `base` (`http://127.0.0.1:PORT/`).
    static func endpoint(_ base: URL) -> URL {
        base.appendingPathComponent("mcp")
    }

    /// Adds `ganymede mcp` to Claude Code for every project: it uses the
    /// app's server while the app runs, and its own otherwise.
    static let claudeCodeCommand = "claude mcp add --scope user ganymede -- ganymede mcp"

    /// Adds the app's server to Claude Code over streamable HTTP, for
    /// those without the `ganymede` command.
    static func claudeCodeHTTPCommand(base: URL, token: String) -> String {
        "claude mcp add --scope user --transport http ganymede \(endpoint(base).absoluteString) "
            + "--header \"Authorization: token \(token)\""
    }

    /// Claude Desktop's `mcpServers` entry: `ganymede mcp`, as for Claude
    /// Code. Needs the `ganymede` command on the PATH Claude Desktop gives
    /// it.
    static var desktopConfig: String {
        let entry: [String: Any] = [
            "mcpServers": [
                "ganymede": ["command": "ganymede", "args": ["mcp"]],
            ],
        ]
        let data = (try? JSONSerialization.data(
            withJSONObject: entry, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        )) ?? Data()
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: The server info file

    #if os(macOS)

    /// Where Jupyter tools look for running servers: `JUPYTER_RUNTIME_DIR`,
    /// else `~/Library/Jupyter/runtime`, as `ganymede` itself does on macOS.
    static func runtimeDirectory(
        environment: [String: String] = ProcessInfo.processInfo.environment
    ) -> URL {
        if let dir = environment["JUPYTER_RUNTIME_DIR"], !dir.isEmpty {
            return URL(fileURLWithPath: dir, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Jupyter/runtime", isDirectory: true)
    }

    /// `jpserver-<pid>.json` for the server at `base`, in the format
    /// `jupyter_server` and `ganymede serve` write: `ganymede mcp` reads
    /// `url`, `token` and `root_dir`.
    static func serverInfo(base: URL, token: String, root: String, pid: Int32) -> [String: Any] {
        [
            "url": base.absoluteString,
            "hostname": base.host ?? "127.0.0.1",
            "port": base.port ?? 0,
            "sock": "",
            "secure": false,
            "base_url": base.path.isEmpty ? "/" : base.path,
            "token": token,
            "root_dir": root,
            "password": false,
            "pid": Int(pid),
        ]
    }

    /// Writes the server info file in `dir`, readable by this user only
    /// (it holds the token); its URL, or nil when it can't be written.
    static func writeServerInfo(_ info: [String: Any], in dir: URL, pid: Int32) -> URL? {
        let file = dir.appendingPathComponent("jpserver-\(pid).json")
        do {
            try FileManager.default.createDirectory(
                at: dir, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700]
            )
            let data = try JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted, .sortedKeys])
            // Created empty with its permissions first, so the token is
            // never in a file others can read.
            guard FileManager.default.createFile(
                atPath: file.path, contents: nil, attributes: [.posixPermissions: 0o600]
            ) else { return nil }
            try data.write(to: file)
            return file
        } catch {
            return nil
        }
    }
    #endif
}
