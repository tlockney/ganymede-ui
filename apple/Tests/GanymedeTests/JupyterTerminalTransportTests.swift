import XCTest

// iOS apps cannot start processes, so the server there has no terminals.
#if os(macOS)
/// JupyterTerminalTransport against the app's own server: a shell over
/// `/api/terminals`, then gone when the transport closes.
@MainActor
final class JupyterTerminalTransportTests: XCTestCase {
    private var dir: URL!
    private var host: ServerHost!

    override func setUp() async throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        host = try ServerHost(config: [
            "root_dir": dir.path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
            "terminal_shell": ["/bin/sh"],
        ])
    }

    override func tearDown() async throws {
        host?.stop()
        try? FileManager.default.removeItem(at: dir)
    }

    private func terminals(_ endpoint: ServerEndpoint) async throws -> [[String: Any]] {
        let (data, _) = try await URLSession.shared.data(for: endpoint.request("api/terminals"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [[String: Any]])
    }

    private func waitFor(_ what: String, _ condition: () async throws -> Bool) async throws {
        for _ in 0..<100 {
            if try await condition() { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail("timed out waiting for \(what)")
    }

    func testEndpointFromTheServerURL() throws {
        let endpoint = try XCTUnwrap(ServerEndpoint(serverURL: host.url))
        XCTAssertEqual(endpoint.base.path, "/")
        XCTAssertNil(endpoint.base.query)
        XCTAssertFalse(endpoint.token.isEmpty)
        let typed = try XCTUnwrap(ServerEndpoint(string: "https://example.org/jupyter", token: "t"))
        XCTAssertEqual(typed.url("api/terminals").absoluteString, "https://example.org/jupyter/api/terminals")
        XCTAssertNil(ServerEndpoint(string: "", token: "t"))
    }

    func testSplitUTF8HoldsBackAnIncompleteCharacter() {
        let euro: [UInt8] = Array("€".utf8)  // E2 82 AC
        let split = JupyterTerminalTransport.splitUTF8(Array("a".utf8) + euro.prefix(2))
        XCTAssertEqual(split.complete, Array("a".utf8))
        XCTAssertEqual(split.rest, Array(euro.prefix(2)))
        let joined = JupyterTerminalTransport.splitUTF8(split.rest + euro.suffix(1))
        XCTAssertEqual(joined.complete, euro)
        XCTAssertEqual(joined.rest, [])
        XCTAssertEqual(JupyterTerminalTransport.splitUTF8(Array("ab€".utf8)).rest, [])
        // A stray continuation byte is not held back.
        XCTAssertEqual(JupyterTerminalTransport.splitUTF8([0x61, 0x80]).rest, [])
    }

    func testShellRoundTripAndClose() async throws {
        let endpoint = try XCTUnwrap(ServerEndpoint(serverURL: host.url))
        let transport = JupyterTerminalTransport(endpoint: endpoint)
        var output = ""
        var closed: [String?] = []
        transport.onOutput = { output += String(decoding: $0, as: UTF8.self) }
        transport.onClose = { closed.append($0) }
        transport.start()
        transport.resize(cols: 101, rows: 33)
        try await waitFor("the terminal") { transport.name != nil }
        transport.send(Array("stty size; echo ganymede-$((6*7))\r".utf8)[...])
        try await waitFor("the echo") { output.contains("ganymede-42") }
        XCTAssertTrue(output.contains("33 101"), output)
        let listed = try await terminals(endpoint)
        XCTAssertEqual(listed.compactMap { $0["name"] as? String }, [transport.name!])

        transport.close()
        try await waitFor("the delete") { try await self.terminals(endpoint).isEmpty }
        XCTAssertTrue(closed.isEmpty, "closing from here reports no end")
    }

    func testTheShellStartsInTheFolderAskedFor() async throws {
        let folder = dir.appendingPathComponent("sub folder", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let endpoint = try XCTUnwrap(ServerEndpoint(serverURL: host.url))
        let transport = JupyterTerminalTransport(endpoint: endpoint, cwd: folder.path)
        var output = ""
        transport.onOutput = { output += String(decoding: $0, as: UTF8.self) }
        transport.start()
        try await waitFor("the terminal") { transport.name != nil }
        transport.send(Array("echo \"cwd=$(basename \"$PWD\")\"\r".utf8)[...])
        try await waitFor("the echo") { output.contains("cwd=sub folder") }
        transport.close()
    }

    func testShellExitEndsTheSession() async throws {
        let endpoint = try XCTUnwrap(ServerEndpoint(serverURL: host.url))
        let transport = JupyterTerminalTransport(endpoint: endpoint)
        var closed: [String?] = []
        transport.onClose = { closed.append($0) }
        transport.start()
        try await waitFor("the terminal") { transport.name != nil }
        transport.send(Array("exit\r".utf8)[...])
        try await waitFor("the end") { !closed.isEmpty }
        XCTAssertEqual(closed.count, 1)
        XCTAssertNil(closed[0] ?? nil, "a shell that exits ends normally")
    }

    func testServerWithoutTerminalsSaysSo() async throws {
        host.stop()
        host = try ServerHost(config: [
            "root_dir": dir.path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
            "terminals_enabled": false,
        ])
        let transport = JupyterTerminalTransport(endpoint: try XCTUnwrap(ServerEndpoint(serverURL: host.url)))
        var closed: [String?] = []
        transport.onClose = { closed.append($0) }
        transport.start()
        try await waitFor("the refusal") { !closed.isEmpty }
        XCTAssertEqual(closed.first ?? nil, "This server has no terminals.")
    }
}
#endif
