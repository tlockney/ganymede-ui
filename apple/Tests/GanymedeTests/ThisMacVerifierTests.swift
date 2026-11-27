#if os(macOS)
import XCTest

/// Whether a server info file is this Mac's own Ganymede (#883): every part
/// that must hold, with the system's lookups faked.
final class ThisMacVerifierTests: XCTestCase {
    private let team = "ABCDE12345"
    private let helper = "ganymede-UUID0123456789ABCDEF0123456789ABCDEF"
    private let port = 8888
    private let pid: Int32 = 4242

    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("this-mac-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let directory { try? FileManager.default.removeItem(at: directory) }
    }

    /// An info file's fields, the check's passing case.
    private func info(
        url: String? = nil, pid: Int32? = nil, version: String = "0.17.0", token: String = "a-token"
    ) -> ThisMacServer {
        ThisMacServer(
            pid: pid ?? self.pid,
            url: URL(string: url ?? "http://127.0.0.1:\(port)/")!,
            token: token, root: URL(fileURLWithPath: "/Users/me", isDirectory: true), version: version)
    }

    /// What the check asks: each answer a test sets, and the info files of a
    /// real folder.
    private struct Fake: ThisMacProbe {
        var teamIdentifier: String? = "ABCDE12345"
        var helperIdentifier: String? = "ganymede-UUID0123456789ABCDEF0123456789ABCDEF"
        var bundledVersion: String? = "0.17.0"
        var running: Set<Int32> = [4242]
        /// Why a pid's signature doesn't meet a requirement, if it doesn't.
        var signatures: [Int32: (team: String, identifier: String)] = [
            4242: ("ABCDE12345", "ganymede-UUID0123456789ABCDEF0123456789ABCDEF"),
        ]
        var ports: [Int32: Set<Int>] = [4242: [8888]]

        func infoFiles(in directory: URL) -> [URL] {
            let files =
                (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil))
                ?? []
            return files
                .filter { $0.lastPathComponent.hasPrefix("jpserver-") && $0.pathExtension == "json" }
                .sorted { $0.lastPathComponent < $1.lastPathComponent }
        }

        func isRunning(_ pid: Int32) -> Bool { running.contains(pid) }

        func hasSignature(pid: Int32, team: String, identifier: String) -> Bool {
            guard let signature = signatures[pid] else { return false }
            return signature.team == team && signature.identifier == identifier
        }

        func isListening(pid: Int32, port: Int) -> Bool { ports[pid]?.contains(port) ?? false }
    }

    private func verifier(_ probe: Fake) -> ThisMacVerifier { ThisMacVerifier(probe: probe) }

    // MARK: the passing case

    func testAServerSignedAsTheAppsOwnHelperOnItsPortIsThisMacs() {
        XCTAssertTrue(verifier(Fake()).verify(info()))
        // Each loopback address the info file may name.
        for url in ["http://127.0.0.1:8888/", "http://localhost:8888/", "http://[::1]:8888/"] {
            XCTAssertTrue(verifier(Fake()).verify(info(url: url)), url)
        }
    }

    func testTheInfoFileIsReadAsTheServerItNames() throws {
        let file = try write(pid: pid, fields: [:])
        let read = try XCTUnwrap(ThisMacVerifier.read(file))
        XCTAssertEqual(read.pid, pid)
        XCTAssertEqual(read.url, URL(string: "http://127.0.0.1:8888/"))
        XCTAssertEqual(read.port, 8888)
        XCTAssertEqual(read.token, "a-token")
        XCTAssertEqual(read.root.path, "/Users/me")
        XCTAssertEqual(read.version, "0.17.0")
        XCTAssertEqual(verifier(Fake()).servers(in: directory), [read])
    }

    // MARK: each part that must hold

    func testANonLoopbackAddressIsNoThisMac() {
        for url in ["http://192.168.1.5:8888/", "http://127.0.0.1.nip.io:8888/", "http://mac-mini:8888/"] {
            XCTAssertFalse(verifier(Fake()).verify(info(url: url)), url)
        }
    }

    func testADebugBuildTrustsNothing() {
        // An unsigned or ad-hoc-signed app can name no team, and an app with
        // no bundled tool no identifier: nothing verifies (#883).
        var noTeam = Fake()
        noTeam.teamIdentifier = nil
        XCTAssertFalse(verifier(noTeam).verify(info()))
        var noHelper = Fake()
        noHelper.helperIdentifier = nil
        XCTAssertFalse(verifier(noHelper).verify(info()))
    }

    func testAProcessOfAnotherTeamIsNoThisMac() {
        var other = Fake()
        other.signatures[pid] = ("ZYXWV98765", helper)
        XCTAssertFalse(verifier(other).verify(info()))
        // Another program of this team, signed with another identifier, is
        // no this Mac either: only the bundled helper is.
        var otherTool = Fake()
        otherTool.signatures[pid] = (team, "ganymede-of-my-own-build")
        XCTAssertFalse(verifier(otherTool).verify(info()))
        // A process signed by no one the app can ask about.
        var unsigned = Fake()
        unsigned.signatures = [:]
        XCTAssertFalse(verifier(unsigned).verify(info()))
    }

    func testAServerWhoseProcessIsGoneIsNoThisMac() {
        var gone = Fake()
        gone.running = []
        XCTAssertFalse(verifier(gone).verify(info()))
    }

    func testAServerWhosePidIsNotTheOneListeningIsNoThisMac() {
        // Another process holds the port, or none does: the info file names
        // a pid that isn't the listener.
        var elsewhere = Fake()
        elsewhere.ports = [pid: [9999]]
        XCTAssertFalse(verifier(elsewhere).verify(info()))
        var nothing = Fake()
        nothing.ports = [:]
        XCTAssertFalse(verifier(nothing).verify(info()))
    }

    func testAServerOfAnotherVersionIsNoThisMac() {
        var older = Fake()
        older.bundledVersion = "0.16.0"
        XCTAssertFalse(verifier(older).verify(info()))
        // An info file that doesn't say its version at all: an older server.
        var silent = Fake()
        silent.bundledVersion = nil
        XCTAssertFalse(verifier(silent).verify(info()))
    }

    // MARK: the files

    func testAnInfoFileThatIsGoneOrIncompleteVerifiesNothing() throws {
        // The folder holds no info file.
        XCTAssertEqual(verifier(Fake()).servers(in: directory), [])
        // A file the app can't read, and one that isn't a server's.
        let broken = directory.appendingPathComponent("jpserver-1.json")
        try Data("not json".utf8).write(to: broken)
        XCTAssertNil(ThisMacVerifier.read(broken))
        XCTAssertEqual(verifier(Fake()).servers(in: directory), [])
        // An info file without `ganymede_version` (an older server), or
        // without `root_dir`, isn't one the check can accept.
        XCTAssertNil(ThisMacVerifier.read(try write(pid: 2, fields: ["ganymede_version": ""])))
        XCTAssertNil(ThisMacVerifier.read(try write(pid: 3, fields: ["root_dir": ""])))
        XCTAssertNil(ThisMacVerifier.read(try write(pid: 4, fields: ["url": "http://127.0.0.1:8888/", "token": ""])))
        // One that doesn't verify is left out, beside one that does.
        _ = try write(pid: pid, fields: [:])
        var notListening = Fake()
        notListening.ports = [:]
        XCTAssertEqual(verifier(notListening).servers(in: directory), [])
    }

    // MARK: what a remote must be

    func testARemoteNamesTheServerOnItsPortWithItsToken() {
        let server = info()
        var loopback = Remote(name: "here", serverURL: "http://127.0.0.1:8888")
        XCTAssertTrue(server.serves(loopback, token: "a-token"))
        // Another port, another token, or no token at all.
        loopback.serverURL = "http://127.0.0.1:9999"
        XCTAssertFalse(server.serves(loopback, token: "a-token"))
        loopback.serverURL = "http://127.0.0.1:8888"
        XCTAssertFalse(server.serves(loopback, token: "another"))
        XCTAssertFalse(server.serves(loopback, token: nil))
        XCTAssertFalse(server.serves(loopback, token: ""))
    }

    /// The remote must reach the address the verified process listens on:
    /// another loopback address on the same port is another server, and the
    /// app's token would go to it (#883).
    func testARemoteOnAnotherLoopbackAddressIsNoThisMac() {
        let server = info()  // http://127.0.0.1:8888/
        for address in ["localhost", "::1", "[::1]", "127.0.0.2"] {
            let remote = Remote(name: "here", serverURL: "http://\(address):8888")
            XCTAssertFalse(server.serves(remote, token: "a-token"), address)
        }
        // A name that isn't loopback is no this Mac either.
        XCTAssertFalse(
            server.serves(Remote(name: "mini", serverURL: "http://mini:8888"), token: "a-token"))
        // The same address written another way is the same address: an IPv6
        // literal's brackets, and a host's case.
        var six = info()
        six.url = URL(string: "http://[::1]:8888/")!
        XCTAssertTrue(
            six.serves(Remote(name: "here", serverURL: "http://[::1]:8888"), token: "a-token"))
        var named = info()
        named.url = URL(string: "http://localhost:8888/")!
        XCTAssertTrue(
            named.serves(Remote(name: "here", serverURL: "http://LOCALHOST:8888"), token: "a-token"))
    }

    // MARK: helpers

    /// A server info file in the test's folder, as `ganymede serve` writes
    /// it, with `fields` over the defaults.
    @discardableResult
    private func write(pid: Int32, fields: [String: Any]) throws -> URL {
        var info: [String: Any] = [
            "url": "http://127.0.0.1:8888/",
            "hostname": "127.0.0.1",
            "port": 8888,
            "sock": "",
            "secure": false,
            "base_url": "/",
            "token": "a-token",
            "root_dir": "/Users/me",
            "password": false,
            "pid": Int(pid),
            "version": "2.21.1",
            "ganymede_version": "0.17.0",
        ]
        for (key, value) in fields { info[key] = value }
        let file = directory.appendingPathComponent("jpserver-\(pid).json")
        try JSONSerialization.data(withJSONObject: info, options: [.sortedKeys]).write(to: file)
        return file
    }
}
#endif
