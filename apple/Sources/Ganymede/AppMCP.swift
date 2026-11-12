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
/// Clients find the server by the config Settings shows: its URL and a
/// token. The embedded server writes no `jpserver-<pid>.json`, so
/// `ganymede mcp` can't find it by itself; instead, while MCP is on, the
/// server's token is one the app keeps in the keychain, and its port is
/// the one it had last time (`AppModel`), so the config stays good across
/// launches.
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

    /// Adds the server to Claude Code, over streamable HTTP.
    static func claudeCodeCommand(base: URL, token: String) -> String {
        "claude mcp add --transport http ganymede \(endpoint(base).absoluteString) "
            + "--header \"Authorization: token \(token)\""
    }

    /// Claude Desktop's `mcpServers` entry: `ganymede mcp` forwards stdio
    /// to the app's server, so there is one server and one room per
    /// notebook. Needs the `ganymede` command on the PATH Claude Desktop
    /// gives it.
    static func desktopConfig(base: URL, token: String) -> String {
        let entry: [String: Any] = [
            "mcpServers": [
                "ganymede": [
                    "command": "ganymede",
                    "args": ["mcp", "--server", base.absoluteString, "--token", token],
                ],
            ],
        ]
        let data = (try? JSONSerialization.data(
            withJSONObject: entry, options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        )) ?? Data()
        return String(decoding: data, as: UTF8.self)
    }
}
