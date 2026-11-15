#if os(macOS)
import XCTest

/// Sharing the app's server on the tailnet (ganymede#816): reading
/// Tailscale's answers, the server settings, and a real server letting a
/// listed login in without the token.
final class AppTailnetTests: XCTestCase {
    func testAllowList() {
        XCTAssertEqual(AppTailnet.allowList(""), [])
        XCTAssertEqual(
            AppTailnet.allowList(" me@example.com,you@example.com\n tag:agent  me@example.com,, "),
            ["me@example.com", "you@example.com", "tag:agent"]
        )
    }

    func testDNSName() {
        let status = Data(#"{"Self":{"DNSName":"box.tail1234.ts.net.","HostName":"box"}}"#.utf8)
        XCTAssertEqual(AppTailnet.dnsName(status: status), "box.tail1234.ts.net")
        XCTAssertNil(AppTailnet.dnsName(status: Data(#"{"Self":{"DNSName":""}}"#.utf8)))
        XCTAssertNil(AppTailnet.dnsName(status: Data("not json".utf8)))
    }

    func testServedTarget() {
        let status = Data(#"""
        {"TCP":{"443":{"HTTPS":true}},
         "Web":{"box.tail1234.ts.net:443":{"Handlers":{"/":{"Proxy":"http://127.0.0.1:8888"}}}}}
        """#.utf8)
        XCTAssertEqual(AppTailnet.servedTarget(status: status, dnsName: "box.tail1234.ts.net"), "http://127.0.0.1:8888")
        XCTAssertNil(AppTailnet.servedTarget(status: status, dnsName: "other.tail1234.ts.net"))
        XCTAssertNil(AppTailnet.servedTarget(status: Data("{}".utf8), dnsName: "box.tail1234.ts.net"))
        XCTAssertEqual(AppTailnet.target(port: 8888), "http://127.0.0.1:8888")
        XCTAssertEqual(AppTailnet.url(dnsName: "box.tail1234.ts.net")?.absoluteString, "https://box.tail1234.ts.net/")
    }

    func testOwnLogin() {
        let status = Data(#"""
        {"Self":{"DNSName":"box.tail1234.ts.net.","UserID":1234567890123},
         "User":{"1234567890123":{"ID":1234567890123,"LoginName":"me@example.com"},
                 "42":{"ID":42,"LoginName":"other@example.com"}}}
        """#.utf8)
        XCTAssertEqual(AppTailnet.ownLogin(status: status), "me@example.com")
        // No Self, or no UserID in it.
        XCTAssertNil(AppTailnet.ownLogin(status: Data(#"{"User":{"42":{"LoginName":"o@example.com"}}}"#.utf8)))
        XCTAssertNil(AppTailnet.ownLogin(status: Data(#"{"Self":{"DNSName":"box."},"User":{"42":{"LoginName":"o@example.com"}}}"#.utf8)))
        // No User map.
        XCTAssertNil(AppTailnet.ownLogin(status: Data(#"{"Self":{"UserID":42}}"#.utf8)))
        // UserID not in User.
        XCTAssertNil(AppTailnet.ownLogin(status: Data(#"{"Self":{"UserID":7},"User":{"42":{"LoginName":"o@example.com"}}}"#.utf8)))
        // Empty or missing LoginName.
        XCTAssertNil(AppTailnet.ownLogin(status: Data(#"{"Self":{"UserID":42},"User":{"42":{"LoginName":""}}}"#.utf8)))
        XCTAssertNil(AppTailnet.ownLogin(status: Data(#"{"Self":{"UserID":42},"User":{"42":{}}}"#.utf8)))
        XCTAssertNil(AppTailnet.ownLogin(status: Data("not json".utf8)))
        // A tagged Mac: its user is Tailscale's tagged-devices, no person.
        XCTAssertNil(AppTailnet.ownLogin(status: Data(#"{"Self":{"UserID":42,"Tags":["tag:server"]},"User":{"42":{"LoginName":"o@example.com"}}}"#.utf8)))
        XCTAssertNil(AppTailnet.ownLogin(status: Data(#"{"Self":{"UserID":42},"User":{"42":{"LoginName":"tagged-devices"}}}"#.utf8)))
    }

    /// Started from an app, the Tailscale app's binary acts as the CLI
    /// only with `TAILSCALE_BE_CLI` set (#632).
    func testEnvironmentMakesTailscaleACLI() {
        let environment = AppTailnet.environment(["HOME": "/Users/me", "PATH": "/usr/bin:/bin"])
        XCTAssertEqual(environment["TAILSCALE_BE_CLI"], "1")
        XCTAssertEqual(environment["HOME"], "/Users/me")
        XCTAssertEqual(environment["PATH"], "/usr/bin:/bin")
    }

    /// `run` passes that environment to the process it starts.
    func testRunSetsTailscaleBeCLI() {
        let result = AppTailnet.run("/bin/sh", ["-c", #"printf '%s|%s' "$TAILSCALE_BE_CLI" "$HOME""#])
        XCTAssertEqual(result.code, 0)
        XCTAssertEqual(
            String(decoding: result.output, as: UTF8.self),
            "1|" + (ProcessInfo.processInfo.environment["HOME"] ?? "")
        )
    }

    /// A `tailscale` that prints the GUI's error and exits 0, as the
    /// Tailscale app's binary did when started without `TAILSCALE_BE_CLI`:
    /// the failure says what it printed.
    func testPrepareShowsWhatTailscaleSaid() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let cli = dir.appendingPathComponent("tailscale").path
        try Data("#!/bin/sh\necho 'The Tailscale GUI failed to start: (Tailscale.CLIError error 3.)'\n".utf8)
            .write(to: URL(fileURLWithPath: cli))
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: cli)
        // Off the main thread, as prepare requires.
        let result = await Task.detached { AppTailnet.prepare(allow: ["me@example.com"], cli: cli) }.value
        guard case .failure(let failure) = result else { return XCTFail("prepare succeeded") }
        XCTAssertEqual(
            failure.message,
            "Tailscale isn’t connected, or has no name for this Mac. Connect it, then turn this on again. Tailscale said: The Tailscale GUI failed to start: (Tailscale.CLIError error 3.)"
        )
    }

    func testSaid() {
        let gui = Data("The Tailscale GUI failed to start: The operation couldn’t be completed. (Tailscale.CLIError error 3.)\n".utf8)
        XCTAssertEqual(
            AppTailnet.said(gui, Data()),
            " Tailscale said: The Tailscale GUI failed to start: The operation couldn’t be completed. (Tailscale.CLIError error 3.)"
        )
        XCTAssertEqual(AppTailnet.said(Data(#"{"Self":{}}"#.utf8), Data()), "")
        XCTAssertEqual(AppTailnet.said(Data(), Data()), "")
        XCTAssertEqual(AppTailnet.said(Data(), Data("line one\nline two\n".utf8)), " Tailscale said: line one line two")
        let long = AppTailnet.said(Data(String(repeating: "x", count: 300).utf8), Data())
        XCTAssertEqual(long, " Tailscale said: " + String(repeating: "x", count: 200) + "…")
    }

    func testPeers() {
        let status = Data(#"""
        {"Self":{"DNSName":"mac.tail1234.ts.net."},
         "Peer":{
          "nodekey:1":{"HostName":"zeta","DNSName":"zeta.tail1234.ts.net.","Online":false},
          "nodekey:2":{"HostName":"box","DNSName":"box.tail1234.ts.net.","Online":true},
          "nodekey:3":{"HostName":"localhost","DNSName":"agent.tail1234.ts.net.","Online":true},
          "nodekey:4":{"HostName":"nodns","DNSName":"","Online":true},
          "nodekey:5":{"HostName":"se-sto-wg-001","DNSName":"se-sto-wg-001.mullvad.ts.net.","Online":true}}}
        """#.utf8)
        let peers = AppTailnet.peers(status: status)
        XCTAssertEqual(peers.map(\.name), ["agent", "box", "zeta"])
        XCTAssertEqual(peers.map(\.online), [true, true, false])
        XCTAssertEqual(peers[1].serverURL, "https://box.tail1234.ts.net/")
        XCTAssertEqual(AppTailnet.peers(status: Data("{}".utf8)), [])
    }

    func testCommand() {
        XCTAssertEqual(
            AppTailnet.command(isExecutable: { $0 == "/opt/homebrew/bin/tailscale" }),
            "/opt/homebrew/bin/tailscale"
        )
        XCTAssertEqual(
            AppTailnet.command(isExecutable: { _ in true }),
            "/Applications/Tailscale.app/Contents/MacOS/Tailscale"
        )
        XCTAssertNil(AppTailnet.command(isExecutable: { _ in false }))
    }

    func testServerConfig() {
        let config = AppTailnet.serverConfig(dnsName: "box.tail1234.ts.net", allow: ["me@example.com"])
        XCTAssertEqual(config["local_hostnames"] as? [String], ["localhost", "box.tail1234.ts.net"])
        XCTAssertEqual(config["trust_xheaders"] as? Bool, true)
        XCTAssertEqual((config["tailscale"] as? [String: [String]])?["allow"], ["me@example.com"])
    }

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

    /// GETs `/api/me` on `host` without the token, as `tailscale serve`
    /// forwards a request from a page of the server's own: the status and
    /// the user name the server gives.
    private func me(_ host: ServerHost, login: String?) async throws -> (Int, String?) {
        var parts = try XCTUnwrap(URLComponents(url: host.url, resolvingAgainstBaseURL: false))
        parts.query = nil
        parts.path = "/api/me"
        var request = URLRequest(url: try XCTUnwrap(parts.url))
        request.setValue("same-origin", forHTTPHeaderField: "Sec-Fetch-Site")
        if let login { request.setValue(login, forHTTPHeaderField: "Tailscale-User-Login") }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = try XCTUnwrap(response as? HTTPURLResponse).statusCode
        let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        return (status, (json?["identity"] as? [String: Any])?["username"] as? String)
    }

    func testListedLoginGetsInWithoutTheToken() async throws {
        let config: [String: Any] = [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ].merging(
            AppTailnet.serverConfig(dnsName: "box.tail1234.ts.net", allow: ["me@example.com"])
                .mapValues { $0 as Any }
        ) { $1 }
        let host = try ServerHost(config: config)
        defer { host.stop() }
        let listed = try await me(host, login: "me@example.com")
        XCTAssertEqual(listed.0, 200)
        XCTAssertEqual(listed.1, "me@example.com")
        let other = try await me(host, login: "you@example.com")
        XCTAssertEqual(other.0, 403)
        let none = try await me(host, login: nil)
        XCTAssertEqual(none.0, 403)
    }
}
#endif
