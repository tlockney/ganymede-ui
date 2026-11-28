import XCTest

/// MCP from the app's server (#304): the settings each mode gives the
/// server, the configs Settings shows, and the modes enforced by a real
/// server.
final class AppMCPTests: XCTestCase {
    func testServerConfig() {
        XCTAssertTrue(AppMCP.serverConfig(mode: .off, images: true, token: "t").isEmpty)
        XCTAssertTrue(AppMCP.serverConfig(mode: .full, images: false, token: "").isEmpty, "never without a token")
        let full = AppMCP.serverConfig(mode: .full, images: true, token: "t")
        XCTAssertEqual(full["mcp_token"] as? String, "t")
        XCTAssertNil(full["token"], "the server keeps its own token for the page")
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
            JSONSerialization.jsonObject(with: Data(AppMCP.desktopConfig(command: "/opt/bin/ganymede").utf8)) as? [String: Any]
        )
        let entry = try XCTUnwrap((desktop["mcpServers"] as? [String: Any])?["ganymede"] as? [String: Any])
        XCTAssertEqual(entry["command"] as? String, "/opt/bin/ganymede")
        XCTAssertEqual(entry["args"] as? [String], ["mcp"])
    }

    #if os(macOS)
    /// The file `ganymede mcp` finds the app's server by: its URL, token
    /// and root, readable by this user only.
    func testServerInfoFile() throws {
        XCTAssertEqual(
            AppMCP.runtimeDirectory(environment: ["JUPYTER_RUNTIME_DIR": "/tmp/rt"]).path, "/tmp/rt"
        )
        XCTAssertEqual(
            AppMCP.runtimeDirectory(environment: ["JUPYTER_DATA_DIR": "/tmp/data"]).path, "/tmp/data/runtime"
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

    /// The file is written whenever the Mac app's server runs (#934): holds
    /// `mcp_token` only while MCP is on, empty `""` when MCP is off, and
    /// never the server's own full page/session token (#583).
    func testServerInfoHoldsTheMCPTokenOnlyWhenMCPIsOn() throws {
        let url = try XCTUnwrap(URL(string: "http://127.0.0.1:52011/?token=serverown"))
        let onSettings = AppMCP.serverConfig(mode: .readOnly, images: false, token: "agent")
            .merging(["root_dir": "/"]) { $1 }
        let onInfo = try XCTUnwrap(
            AppMCP.serverInfo(serverURL: url, settings: onSettings, pid: 42, version: "0.17.0")
        )
        XCTAssertEqual(onInfo["token"] as? String, "agent")
        XCTAssertEqual(onInfo["url"] as? String, "http://127.0.0.1:52011/")
        XCTAssertEqual(onInfo["root_dir"] as? String, "/")
        XCTAssertEqual(onInfo["password"] as? Bool, false)
        XCTAssertEqual(onInfo["pid"] as? Int, 42)
        XCTAssertEqual(onInfo["ganymede_version"] as? String, "0.17.0")
        XCTAssertEqual(onInfo[AppMCP.appMarker] as? Bool, true)

        // MCP off: info file is still built, with empty token and never the
        // server's own page/session token.
        let offSettings = AppMCP.serverConfig(mode: .off, images: false, token: "agent")
            .merging(["root_dir": "/"]) { $1 }
        let offInfo = try XCTUnwrap(
            AppMCP.serverInfo(serverURL: url, settings: offSettings, pid: 42, version: "0.17.0")
        )
        XCTAssertEqual(offInfo["token"] as? String, "")
        XCTAssertNotEqual(offInfo["token"] as? String, "serverown")
        XCTAssertEqual(offInfo["url"] as? String, "http://127.0.0.1:52011/")
        XCTAssertEqual(offInfo["root_dir"] as? String, "/")
        XCTAssertEqual(offInfo["password"] as? Bool, false)
        XCTAssertEqual(offInfo["pid"] as? Int, 42)
        XCTAssertEqual(offInfo["ganymede_version"] as? String, "0.17.0")
        XCTAssertEqual(offInfo[AppMCP.appMarker] as? Bool, true)
    }

    /// Toggling MCP on -> off atomically updates `jpserver-<pid>.json` at
    /// mode 0600, clearing the token back to `""` without leaking the app's
    /// session token or leaving temporary files behind (#934).
    func testServerInfoToggleOnToOffUpdatesAtomicallyAt0600() throws {
        let runtime = dir.appendingPathComponent("runtime")
        let url = try XCTUnwrap(URL(string: "http://127.0.0.1:52011/?token=full-session-secret"))

        let onSettings = AppMCP.serverConfig(mode: .full, images: false, token: "mcp-only-token")
            .merging(["root_dir": "/"]) { $1 }
        let onInfo = try XCTUnwrap(
            AppMCP.serverInfo(serverURL: url, settings: onSettings, pid: 42, version: "0.17.0")
        )
        let file = try XCTUnwrap(AppMCP.writeServerInfo(onInfo, in: runtime, pid: 42))
        var raw = try String(contentsOf: file, encoding: .utf8)
        XCTAssertTrue(raw.contains("mcp-only-token"))
        XCTAssertFalse(raw.contains("full-session-secret"))
        XCTAssertEqual(
            try FileManager.default.attributesOfItem(atPath: file.path)[.posixPermissions] as? Int,
            0o600
        )

        // Toggle MCP off: rewrites the same path with token cleared to "".
        let offSettings: [String: any Sendable] = ["root_dir": "/"]
        let offInfo = try XCTUnwrap(
            AppMCP.serverInfo(serverURL: url, settings: offSettings, pid: 42, version: "0.17.0")
        )
        let updated = try XCTUnwrap(AppMCP.writeServerInfo(offInfo, in: runtime, pid: 42))
        XCTAssertEqual(updated, file)
        raw = try String(contentsOf: updated, encoding: .utf8)
        XCTAssertFalse(raw.contains("mcp-only-token"))
        XCTAssertFalse(raw.contains("full-session-secret"))
        let parsed = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: updated)) as? [String: Any]
        )
        XCTAssertEqual(parsed["token"] as? String, "")
        XCTAssertEqual(parsed["password"] as? Bool, false)
        XCTAssertEqual(
            try FileManager.default.attributesOfItem(atPath: updated.path)[.posixPermissions] as? Int,
            0o600
        )
        let names = try FileManager.default.contentsOfDirectory(atPath: runtime.path)
        XCTAssertEqual(names, ["jpserver-42.json"])
    }

    /// A crashed run's file goes; a live one, and other servers', stay.
    func testStaleServerInfoIsRemoved() throws {
        let runtime = dir.appendingPathComponent("runtime")
        let base = try XCTUnwrap(URL(string: "http://127.0.0.1:52011/"))
        let gone = try XCTUnwrap(AppMCP.writeServerInfo(
            AppMCP.serverInfo(base: base, token: "a", root: "/", pid: 7), in: runtime, pid: 7
        ))
        let live = try XCTUnwrap(AppMCP.writeServerInfo(
            AppMCP.serverInfo(base: base, token: "b", root: "/", pid: 8), in: runtime, pid: 8
        ))
        let other = runtime.appendingPathComponent("jpserver-9.json")
        try Data(#"{"pid": 9, "url": "http://localhost:8888/"}"#.utf8).write(to: other)
        // A pid no process can have is skipped, not a crash.
        let odd = runtime.appendingPathComponent("jpserver-10.json")
        try Data(#"{"pid": 99999999999, "ganymede_app": true}"#.utf8).write(to: odd)
        AppMCP.removeStaleServerInfo(in: runtime) { $0 == 8 }
        XCTAssertFalse(FileManager.default.fileExists(atPath: gone.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: live.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: other.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: odd.path))
        // Written by rename: no hidden temporary file is left.
        let names = try FileManager.default.contentsOfDirectory(atPath: runtime.path)
        XCTAssertFalse(names.contains { $0.hasPrefix(".") }, "\(names)")
    }

    /// A write in the runtime directory is compared against the
    /// `jpserver-*.json` files and their dates (#883): a server that starts
    /// or stops is one, and a kernel's own `kernel-*.json` write is none.
    func testTheServerInfoFilesAreTheOnesAWriteIsComparedAgainst() throws {
        let runtime = dir.appendingPathComponent("runtime")
        try FileManager.default.createDirectory(at: runtime, withIntermediateDirectories: true)
        let base = try XCTUnwrap(URL(string: "http://127.0.0.1:52011/"))
        let file = try XCTUnwrap(AppMCP.writeServerInfo(
            AppMCP.serverInfo(base: base, token: "a", root: "/", pid: 42), in: runtime, pid: 42
        ))
        let date = try XCTUnwrap(AppMCP.infoFileDates(in: runtime)["jpserver-42.json"])
        // A kernel's own file is no server info file: it changes nothing.
        try Data("{}".utf8).write(to: runtime.appendingPathComponent("kernel-abc.json"))
        XCTAssertEqual(AppMCP.infoFileDates(in: runtime), ["jpserver-42.json": date])
        // Another server's is another change.
        _ = try XCTUnwrap(AppMCP.writeServerInfo(
            AppMCP.serverInfo(base: base, token: "b", root: "/", pid: 43), in: runtime, pid: 43
        ))
        XCTAssertEqual(AppMCP.infoFileDates(in: runtime).keys.sorted(), ["jpserver-42.json", "jpserver-43.json"])
        // A server that stopped takes its file with it.
        try FileManager.default.removeItem(at: file)
        XCTAssertEqual(AppMCP.infoFileDates(in: runtime).keys.sorted(), ["jpserver-43.json"])
    }

    func testGanymedeCommandIsFoundOnPath() throws {
        let bin = dir.appendingPathComponent("bin")
        try FileManager.default.createDirectory(at: bin, withIntermediateDirectories: true)
        let tool = bin.appendingPathComponent("ganymede")
        FileManager.default.createFile(atPath: tool.path, contents: Data(), attributes: [.posixPermissions: 0o755])
        XCTAssertEqual(AppMCP.ganymedeCommand(path: "/nonexistent:\(bin.path)"), tool.path)
        XCTAssertNil(AppMCP.ganymedeCommand(path: "/nonexistent"))
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
        XCTAssertFalse(host.url.absoluteString.contains("token=secret"), "the server keeps its own token")
        let (status, _, _) = try await post(host, ["jsonrpc": "2.0", "id": 1, "method": "ping"], token: nil)
        XCTAssertEqual(status, 403)
    }

    /// The app's MCP token opens `/mcp` and no other route (#583): with
    /// MCP read only, it is refused on `/api/contents`, while the
    /// server's own token, the page's, still works there.
    func testMCPTokenOpensOnlyMCP() async throws {
        let host = try server(.readOnly)
        defer { host.stop() }
        let (status, _, _) = try await post(host, [
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": ["protocolVersion": "2025-06-18", "capabilities": [:] as [String: Any],
                       "clientInfo": ["name": "AppMCPTests", "version": "1"]],
        ])
        XCTAssertEqual(status, 200, "the MCP token opens /mcp")
        let page = try XCTUnwrap(ServerEndpoint(serverURL: host.url))
        XCTAssertNotEqual(page.token, "secret")
        func contents(_ token: String) async throws -> Int {
            let request = ServerEndpoint(base: page.base, token: token).request("api/contents")
            let (_, response) = try await URLSession.shared.data(for: request)
            return try XCTUnwrap(response as? HTTPURLResponse).statusCode
        }
        let refused = try await contents("secret")
        XCTAssertEqual(refused, 403)
        let own = try await contents(page.token)
        XCTAssertEqual(own, 200)
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
