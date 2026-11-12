import XCTest

/// MCP from the app's server (#304): the settings each mode gives the
/// server, the configs Settings shows, and the modes enforced by a real
/// server.
final class AppMCPTests: XCTestCase {
    func testServerConfig() {
        XCTAssertTrue(AppMCP.serverConfig(mode: .off, images: true, token: "t").isEmpty)
        XCTAssertTrue(AppMCP.serverConfig(mode: .full, images: false, token: "").isEmpty, "never without a token")
        let full = AppMCP.serverConfig(mode: .full, images: true, token: "t")
        XCTAssertEqual(full["token"] as? String, "t")
        XCTAssertEqual(full["mcp_enabled"] as? Bool, true)
        XCTAssertEqual(full["mcp_read_only"] as? Bool, false)
        XCTAssertEqual(full["mcp_no_execute"] as? Bool, false)
        XCTAssertEqual(full["mcp_images"] as? Bool, true)
        XCTAssertEqual(AppMCP.serverConfig(mode: .readOnly, images: false, token: "t")["mcp_read_only"] as? Bool, true)
        let edit = AppMCP.serverConfig(mode: .editOnly, images: false, token: "t")
        XCTAssertEqual(edit["mcp_no_execute"] as? Bool, true)
        XCTAssertEqual(edit["mcp_read_only"] as? Bool, false)
    }

    func testToken() {
        let a = AppMCP.newToken(), b = AppMCP.newToken()
        XCTAssertEqual(a.count, 32)
        XCTAssertNotEqual(a, b)
        XCTAssertTrue(a.allSatisfy(\.isHexDigit))
    }

    func testConfigs() throws {
        XCTAssertEqual(AppMCP.claudeCodeCommand, "claude mcp add --scope user ganymede -- ganymede mcp")
        let base = try XCTUnwrap(URL(string: "http://127.0.0.1:52011/"))
        XCTAssertEqual(
            AppMCP.claudeCodeHTTPCommand(base: base, token: "abc"),
            #"claude mcp add --scope user --transport http ganymede http://127.0.0.1:52011/mcp --header "Authorization: token abc""#
        )
        let desktop = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(AppMCP.desktopConfig.utf8)) as? [String: Any]
        )
        let entry = try XCTUnwrap((desktop["mcpServers"] as? [String: Any])?["ganymede"] as? [String: Any])
        XCTAssertEqual(entry["command"] as? String, "ganymede")
        XCTAssertEqual(entry["args"] as? [String], ["mcp"])
    }

    #if os(macOS)
    /// The file `ganymede mcp` finds the app's server by: its URL, token
    /// and root, readable by this user only.
    func testServerInfoFile() throws {
        XCTAssertEqual(
            AppMCP.runtimeDirectory(environment: ["JUPYTER_RUNTIME_DIR": "/tmp/rt"]).path, "/tmp/rt"
        )
        XCTAssertTrue(AppMCP.runtimeDirectory(environment: [:]).path.hasSuffix("/Library/Jupyter/runtime"))
        let base = try XCTUnwrap(URL(string: "http://127.0.0.1:52011/"))
        let info = AppMCP.serverInfo(base: base, token: "abc", root: "/", pid: 42)
        let runtime = dir.appendingPathComponent("runtime")
        let file = try XCTUnwrap(AppMCP.writeServerInfo(info, in: runtime, pid: 42))
        XCTAssertEqual(file.lastPathComponent, "jpserver-42.json")
        let read = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: file)) as? [String: Any])
        XCTAssertEqual(read["url"] as? String, "http://127.0.0.1:52011/")
        XCTAssertEqual(read["token"] as? String, "abc")
        XCTAssertEqual(read["root_dir"] as? String, "/")
        XCTAssertEqual(read["port"] as? Int, 52011)
        XCTAssertEqual(read["pid"] as? Int, 42)
        let mode = try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? Int
        XCTAssertEqual(mode, 0o600)
    }
    #endif

    // MARK: A real server

    private var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let web = dir.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try "<!doctype html>".write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    private func server(_ mode: MCPMode) throws -> ServerHost {
        let config: [String: Any] = [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ].merging(AppMCP.serverConfig(mode: mode, images: false, token: "secret").mapValues { $0 as Any }) { $1 }
        return try ServerHost(config: config)
    }

    /// POSTs a JSON-RPC message to `/mcp`; the status, the session id and
    /// the body (streamable HTTP answers as server-sent events).
    private func post(
        _ host: ServerHost, _ message: [String: Any], session: String? = nil, token: String? = "secret"
    ) async throws -> (Int, String?, String) {
        var base = try XCTUnwrap(URLComponents(url: host.url, resolvingAgainstBaseURL: false))
        base.query = nil
        base.path = "/"
        var request = URLRequest(url: AppMCP.endpoint(try XCTUnwrap(base.url)))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json, text/event-stream", forHTTPHeaderField: "Accept")
        if let token { request.setValue("token \(token)", forHTTPHeaderField: "Authorization") }
        if let session { request.setValue(session, forHTTPHeaderField: "Mcp-Session-Id") }
        request.httpBody = try JSONSerialization.data(withJSONObject: message)
        let (data, response) = try await URLSession.shared.data(for: request)
        let http = try XCTUnwrap(response as? HTTPURLResponse)
        return (http.statusCode, http.value(forHTTPHeaderField: "Mcp-Session-Id"), String(decoding: data, as: UTF8.self))
    }

    /// Starts an MCP session and calls `tool`; the answer's text.
    private func call(_ host: ServerHost, _ tool: String, _ arguments: [String: Any]) async throws -> String {
        let (status, session, _) = try await post(host, [
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": ["protocolVersion": "2025-06-18", "capabilities": [:] as [String: Any],
                       "clientInfo": ["name": "AppMCPTests", "version": "1"]],
        ])
        XCTAssertEqual(status, 200)
        _ = try await post(host, ["jsonrpc": "2.0", "method": "notifications/initialized"], session: session)
        return try await post(host, [
            "jsonrpc": "2.0", "id": 2, "method": "tools/call",
            "params": ["name": tool, "arguments": arguments],
        ], session: session).2
    }

    func testOffServesNoMCP() async throws {
        let host = try server(.off)
        defer { host.stop() }
        // Not served at all, even with the server's own token.
        let own = URLComponents(url: host.url, resolvingAgainstBaseURL: false)?
            .queryItems?.first { $0.name == "token" }?.value
        XCTAssertNotNil(own)
        XCTAssertNotEqual(own, "secret")
        let (status, _, _) = try await post(host, ["jsonrpc": "2.0", "id": 1, "method": "ping"], token: own)
        // Unrouted, the POST reaches the static files, which take GET only.
        XCTAssertTrue([404, 405].contains(status), "\(status)")
    }

    func testTokenIsRequired() async throws {
        let host = try server(.full)
        defer { host.stop() }
        XCTAssertTrue(host.url.absoluteString.contains("token=secret"), "the app's MCP token is the server's")
        let (status, _, _) = try await post(host, ["jsonrpc": "2.0", "id": 1, "method": "ping"], token: nil)
        XCTAssertEqual(status, 403)
    }

    func testReadOnlyRefusesEdits() async throws {
        let host = try server(.readOnly)
        defer { host.stop() }
        let answer = try await call(host, "cell_add", ["source": "1", "path": "a.ipynb"])
        XCTAssertTrue(answer.contains("read-only"), answer)
    }

    func testEditOnlyRefusesRuns() async throws {
        let host = try server(.editOnly)
        defer { host.stop() }
        let answer = try await call(host, "cell_run", ["source": "1", "path": "a.ipynb"])
        XCTAssertTrue(answer.contains("execution is turned off"), answer)
    }
}
