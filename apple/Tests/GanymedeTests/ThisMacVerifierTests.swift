#if os(macOS)
import Darwin
import XCTest

/// Whether a server info file is this Mac's own Ganymede (#883): every part
/// that must hold, with the system's lookups faked — and the socket lookup
/// itself against listeners this process opens.
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
    /// real folder, filtered as the app filters them (`AppMCP.serverInfoFiles`).
    private struct Fake: ThisMacProbe {
        var teamIdentifier: String? = "ABCDE12345"
        var helperIdentifier: String? = "ganymede-UUID0123456789ABCDEF0123456789ABCDEF"
        var helperPath: String? = "/Applications/Ganymede.app/Contents/Helpers/ganymede"
        var bundledVersion: String? = "0.17.0"
        var running: Set<Int32> = [4242]
        var paths: [Int32: String] = [4242: "/Applications/Ganymede.app/Contents/Helpers/ganymede"]
        /// Why a pid's signature doesn't meet a requirement, if it doesn't.
        var signatures: [Int32: (team: String, identifier: String)] = [
            4242: ("ABCDE12345", "ganymede-UUID0123456789ABCDEF0123456789ABCDEF"),
        ]
        /// The addresses each pid listens on: the literal a socket bound,
        /// and its port.
        var listeners: [Int32: [(host: String, port: Int)]] = [4242: [("127.0.0.1", 8888)]]

        func infoFiles(in directory: URL) -> [URL] { AppMCP.serverInfoFiles(in: directory) }

        func isRunning(_ pid: Int32) -> Bool { running.contains(pid) }

        func executablePath(of pid: Int32) -> String? { paths[pid] }

        func hasSignature(pid: Int32, team: String, identifier: String) -> Bool {
            guard let signature = signatures[pid] else { return false }
            return signature.team == team && signature.identifier == identifier
        }

        func isListening(pid: Int32, port: Int, host: String) -> Bool {
            (listeners[pid] ?? []).contains { $0.port == port && $0.host == host }
        }

        func isListeningOnWildcard(pid: Int32, port: Int) -> Bool {
            (listeners[pid] ?? []).contains {
                $0.port == port && ThisMacServer.isWildcardAddress($0.host)
            }
        }
    }

    private func verifier(_ probe: Fake) -> ThisMacVerifier { ThisMacVerifier(probe: probe) }

    // MARK: the passing case

    func testAServerSignedAsTheAppsOwnHelperOnItsPortIsThisMacs() {
        XCTAssertTrue(verifier(Fake()).verify(info()))
        // Each address the info file may name, as its literal: the IPv4
        // loopback, and the IPv6 one on a socket that bound it.
        XCTAssertTrue(verifier(Fake()).verify(info(url: "http://127.0.0.1:8888/")))
        var six = Fake()
        six.listeners[pid] = [("::1", 8888)]
        XCTAssertTrue(verifier(six).verify(info(url: "http://[::1]:8888/")))
    }

    /// A name isn't an address (#883): what `localhost` resolves to is the
    /// system's to say, and the check looked at an address's socket.
    func testALocalhostAddressIsNoThisMac() {
        // The info file's `url` names it, and even a fake socket that bound
        // the name doesn't make it an address the check accepts.
        var localhost = Fake()
        localhost.listeners[pid] = [("localhost", 8888)]
        for url in ["http://localhost:8888/", "http://LOCALHOST:8888/"] {
            XCTAssertFalse(verifier(Fake()).verify(info(url: url)), url)
            XCTAssertFalse(verifier(localhost).verify(info(url: url)), url)
        }
        // The info file's literal is an address the socket isn't at.
        XCTAssertFalse(verifier(localhost).verify(info()))
    }

    /// A wildcard bind listens on every interface, and the app's token must
    /// not go there (#883): the socket lookup wants the literal address.
    func testAWildcardBindIsNoThisMac() {
        for address in ["0.0.0.0", "::"] {
            var wildcard = Fake()
            wildcard.listeners[pid] = [(address, 8888)]
            XCTAssertFalse(verifier(wildcard).verify(info()), address)
            XCTAssertFalse(verifier(wildcard).verify(info(url: "http://[::1]:8888/")), address)
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
        elsewhere.listeners = [pid: [("127.0.0.1", 9999)]]
        XCTAssertFalse(verifier(elsewhere).verify(info()))
        var nothing = Fake()
        nothing.listeners = [:]
        XCTAssertFalse(verifier(nothing).verify(info()))
    }

    func testAProcessAtAnotherPathIsNoThisMac() {
        var elsewhere = Fake()
        elsewhere.paths[pid] = "/Users/me/Downloads/Ganymede.app/Contents/Helpers/ganymede"
        XCTAssertFalse(verifier(elsewhere).verify(info()))
        var missing = Fake()
        missing.paths = [:]
        XCTAssertFalse(verifier(missing).verify(info()))
    }

    func testAServerOfAnotherVersionIsNoThisMac() {
        // The info file's version isn't the app's own bundled one.
        XCTAssertFalse(verifier(Fake()).verify(info(version: "0.16.0")))
        var older = Fake()
        older.bundledVersion = "0.16.0"
        XCTAssertFalse(verifier(older).verify(info()))
        // The app can't read its own bundled tool's version: nothing is
        // known to match, and the read isn't kept, so a later check tries
        // again and may verify (#883).
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
        notListening.listeners = [:]
        XCTAssertEqual(verifier(notListening).servers(in: directory), [])
        // The filter is the app's: another program's file, without the name
        // of a server info file, isn't one.
        _ = try write(pid: 5, fields: [:], name: "ganymede-mcp-5.json")
        let files = AppMCP.serverInfoFiles(in: directory).map(\.lastPathComponent)
        XCTAssertTrue(files.contains("jpserver-4242.json"))
        XCTAssertFalse(files.contains("ganymede-mcp-5.json"))
    }

    // MARK: what is read, and when

    /// A probe that counts the reads of the bundled tool's version: reading
    /// it runs the app's own helper, so a file that fails a cheaper check
    /// must never ask for it (#883).
    private final class CountingProbe: ThisMacProbe, @unchecked Sendable {
        var team: String? = "ABCDE12345"
        var helper: String? = "ganymede-UUID0123456789ABCDEF0123456789ABCDEF"
        var path: String? = "/Applications/Ganymede.app/Contents/Helpers/ganymede"
        var version: String? = "0.17.0"
        var versionReads = 0
        var running: Set<Int32> = [4242]
        var paths: [Int32: String] = [
            4242: "/Applications/Ganymede.app/Contents/Helpers/ganymede",
            4343: "/Applications/Ganymede.app/Contents/Helpers/ganymede",
        ]
        var signature = true
        var listeners: [Int32: [(host: String, port: Int)]] = [4242: [("127.0.0.1", 8888)]]

        func infoFiles(in directory: URL) -> [URL] { AppMCP.serverInfoFiles(in: directory) }

        var teamIdentifier: String? { team }
        var helperIdentifier: String? { helper }
        var helperPath: String? { path }
        var bundledVersion: String? {
            versionReads += 1
            return version
        }

        func isRunning(_ pid: Int32) -> Bool { running.contains(pid) }

        func executablePath(of pid: Int32) -> String? { paths[pid] }

        func hasSignature(pid: Int32, team: String, identifier: String) -> Bool { signature }

        func isListening(pid: Int32, port: Int, host: String) -> Bool {
            (listeners[pid] ?? []).contains { $0.port == port && $0.host == host }
        }

        func isListeningOnWildcard(pid: Int32, port: Int) -> Bool {
            (listeners[pid] ?? []).contains {
                $0.port == port && ThisMacServer.isWildcardAddress($0.host)
            }
        }
    }

    /// The bundled tool's version is read only once an info file has passed
    /// the cheaper checks — the loopback literal, the pid, its signature and
    /// its socket — so no `jpserver` file, and no unsigned build, runs the
    /// tool (#883).
    func testAFileThatFailsACheaperCheckRunsNoBundledTool() throws {
        let probe = CountingProbe()
        let verifier = ThisMacVerifier(probe: probe)
        _ = try write(pid: pid, fields: [:])
        // A build that can verify nothing runs nothing.
        probe.team = nil
        XCTAssertEqual(verifier.servers(in: directory), [])
        XCTAssertEqual(probe.versionReads, 0)
        probe.team = team
        // A name is no address, and a wildcard bind is no listener at one.
        _ = try write(pid: pid, fields: ["url": "http://localhost:8888/"])
        XCTAssertEqual(verifier.servers(in: directory), [])
        XCTAssertEqual(probe.versionReads, 0)
        _ = try write(pid: pid, fields: [ "url": "http://0.0.0.0:8888/"])
        XCTAssertEqual(verifier.servers(in: directory), [])
        XCTAssertEqual(probe.versionReads, 0)
        _ = try write(pid: pid, fields: [:])
        // A pid that is gone, code of no one the app asked about, and a pid
        // that doesn't hold the socket.
        probe.running = []
        XCTAssertEqual(verifier.servers(in: directory), [])
        probe.running = [pid]
        probe.signature = false
        XCTAssertEqual(verifier.servers(in: directory), [])
        probe.signature = true
        probe.listeners = [:]
        XCTAssertEqual(verifier.servers(in: directory), [])
        XCTAssertEqual(probe.versionReads, 0)
        // Every cheaper check passed: the version is read, once for them all.
        probe.listeners = [pid: [("127.0.0.1", 8888)]]
        XCTAssertEqual(verifier.servers(in: directory).map(\.pid), [pid])
        XCTAssertEqual(probe.versionReads, 1)
        // One read serves every file of a check: the second server's needs
        // no other.
        _ = try write(pid: 4343, fields: [:])
        probe.running = [pid, 4343]
        probe.listeners[4343] = [("127.0.0.1", 8888)]
        XCTAssertEqual(verifier.servers(in: directory).map(\.pid), [pid, 4343])
        XCTAssertEqual(probe.versionReads, 2)
    }

    /// The bundled tool's version is read once and kept, since the app's own
    /// tool doesn't change while it runs; a failed read isn't kept, and is
    /// tried again by the next check (#883).
    func testTheBundledVersionsReadIsKeptAndAFailureIsTriedAgain() {
        let kept = SystemThisMacProbe.VersionCache()
        var reads = 0
        var answer: String? = "0.17.0"
        let read: () -> String? = {
            reads += 1
            return answer
        }
        XCTAssertEqual(kept.version(read), "0.17.0")
        XCTAssertEqual(kept.version(read), "0.17.0")
        XCTAssertEqual(reads, 1)
        // A read that failed is tried again, and kept once it works.
        let retried = SystemThisMacProbe.VersionCache()
        answer = nil
        reads = 0
        XCTAssertNil(retried.version(read))
        XCTAssertEqual(reads, 1)
        XCTAssertNil(retried.version(read))
        XCTAssertEqual(reads, 2)
        answer = "0.18.0"
        XCTAssertEqual(retried.version(read), "0.18.0")
        XCTAssertEqual(retried.version(read), "0.18.0")
        XCTAssertEqual(reads, 3)
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
        // A name is no address, the info file's own included (#883): the
        // app's token must go to a literal the app checked.
        var named = info()
        named.url = URL(string: "http://localhost:8888/")!
        XCTAssertFalse(
            named.serves(Remote(name: "here", serverURL: "http://LOCALHOST:8888"), token: "a-token"))
        XCTAssertFalse(
            named.serves(Remote(name: "here", serverURL: "http://127.0.0.1:8888"), token: "a-token"))
    }

    // MARK: the system's socket lookup

    /// The system's own answer, about a socket this process opened: a
    /// listener at the bound literal is the pid's, and at no other address.
    func testTheSystemFindsAListenerAtTheAddressItBound() throws {
        let loopback = try openListener("127.0.0.1")
        defer { close(loopback.fd) }
        let probe = SystemThisMacProbe(bundledTool: nil)
        XCTAssertTrue(probe.isListening(pid: getpid(), port: loopback.port, host: "127.0.0.1"))
        XCTAssertFalse(probe.isListening(pid: getpid(), port: loopback.port, host: "::1"))
        XCTAssertFalse(probe.isListening(pid: getpid(), port: loopback.port, host: "0.0.0.0"))
        // Another port is another socket.
        XCTAssertFalse(probe.isListening(pid: getpid(), port: loopback.port + 1, host: "127.0.0.1"))
    }

    func testTheSystemFindsAnIPv6ListenerAtItsLiteral() throws {
        let loopback = try openListener("::1")
        defer { close(loopback.fd) }
        let probe = SystemThisMacProbe(bundledTool: nil)
        XCTAssertTrue(probe.isListening(pid: getpid(), port: loopback.port, host: "::1"))
        // The brackets a URL keeps on the literal are the same address.
        XCTAssertTrue(probe.isListening(pid: getpid(), port: loopback.port, host: "[::1]"))
        XCTAssertFalse(probe.isListening(pid: getpid(), port: loopback.port, host: "127.0.0.1"))
    }

    /// A wildcard listener answers on every interface, and the check refuses
    /// it (#883), and reports it as a wildcard bind (#887): the app's token
    /// must go to the loopback literal alone.
    func testTheSystemRefusesAWildcardListener() throws {
        let any4 = try openListener("0.0.0.0")
        defer { close(any4.fd) }
        let any6 = try openListener("::")
        defer { close(any6.fd) }
        let loopback4 = try openListener("127.0.0.1")
        defer { close(loopback4.fd) }
        let loopback6 = try openListener("::1")
        defer { close(loopback6.fd) }
        let probe = SystemThisMacProbe(bundledTool: nil)
        for host in ["127.0.0.1", "::1", "0.0.0.0"] {
            XCTAssertFalse(probe.isListening(pid: getpid(), port: any4.port, host: host), host)
        }
        XCTAssertTrue(probe.isListeningOnWildcard(pid: getpid(), port: any4.port))
        XCTAssertTrue(probe.isListeningOnWildcard(pid: getpid(), port: any6.port))
        XCTAssertFalse(probe.isListeningOnWildcard(pid: getpid(), port: loopback4.port))
        XCTAssertFalse(probe.isListeningOnWildcard(pid: getpid(), port: loopback6.port))
    }

    // MARK: diagnosing why a check failed (#887)

    func testDiagnoseReportsEachFailureReason() throws {
        // Passing case returns nil.
        XCTAssertNil(verifier(Fake()).diagnose(info()))

        // Unsigned app build (no team) and missing bundled helper.
        var noTeam = Fake()
        noTeam.teamIdentifier = nil
        XCTAssertEqual(verifier(noTeam).diagnose(info()), .unsignedApp)

        var noHelper = Fake()
        noHelper.helperIdentifier = nil
        XCTAssertEqual(verifier(noHelper).diagnose(info()), .missingBundledHelper)

        // Process not running.
        var gone = Fake()
        gone.running = []
        XCTAssertEqual(verifier(gone).diagnose(info()), .processNotRunning)

        // Wrong executable path (another copy of the binary, e.g. Homebrew or Downloads).
        var elsewhere = Fake()
        elsewhere.paths[pid] = "/Users/me/Downloads/Ganymede.app/Contents/Helpers/ganymede"
        XCTAssertEqual(verifier(elsewhere).diagnose(info()), .wrongExecutablePath)

        // Wrong code signature (another team, another identifier, or unsigned).
        var otherTeam = Fake()
        otherTeam.signatures[pid] = ("ZYXWV98765", helper)
        XCTAssertEqual(verifier(otherTeam).diagnose(info()), .wrongSignature)

        // Wildcard bind via hostname (`ganymede serve --ip 0.0.0.0` writes
        // `url: "http://localhost:8888/"` with `hostname: "0.0.0.0"`), via URL,
        // and via the listening socket itself.
        XCTAssertEqual(
            verifier(Fake()).diagnose(info(url: "http://localhost:8888/"), hostname: "0.0.0.0"),
            .wildcardBind)
        XCTAssertEqual(
            verifier(Fake()).diagnose(info(url: "http://localhost:8888/"), hostname: "::"),
            .wildcardBind)
        XCTAssertEqual(verifier(Fake()).diagnose(info(url: "http://0.0.0.0:8888/")), .wildcardBind)
        var wildcardSocket = Fake()
        wildcardSocket.listeners[pid] = [("0.0.0.0", 8888)]
        XCTAssertEqual(verifier(wildcardSocket).diagnose(info()), .wildcardBind)
        XCTAssertEqual(
            verifier(wildcardSocket).diagnose(info(url: "http://localhost:8888/")),
            .wildcardBind)

        // Info file uses localhost without a wildcard bind.
        XCTAssertEqual(
            verifier(Fake()).diagnose(info(url: "http://localhost:8888/"), hostname: "localhost"),
            .infoFileUsesLocalhost)

        // Info file names a non-loopback host.
        XCTAssertEqual(
            verifier(Fake()).diagnose(info(url: "http://192.168.1.5:8888/")),
            .nonLoopbackAddress)

        // Process isn't listening on the expected loopback socket.
        var notListening = Fake()
        notListening.listeners = [:]
        XCTAssertEqual(verifier(notListening).diagnose(info()), .notListening)

        // Missing token on info file.
        XCTAssertEqual(verifier(Fake()).diagnose(info(token: "")), .missingToken)

        // Bundled version unavailable.
        var noVersion = Fake()
        noVersion.bundledVersion = nil
        XCTAssertEqual(verifier(noVersion).diagnose(info()), .bundledVersionUnavailable)

        // Version mismatch names both versions.
        XCTAssertEqual(
            verifier(Fake()).diagnose(info(version: "0.16.0")),
            .versionMismatch(server: "0.16.0", app: "0.17.0"))
    }

    func testScanCapturesAppFailureWildcardAndIncompleteInfoFiles() throws {
        // Unsigned app: reports appFailure without running bundledVersion.
        let counting = CountingProbe()
        counting.team = nil
        _ = try write(pid: pid, fields: [:])
        let unsignedScan = ThisMacVerifier(probe: counting).scan(in: directory)
        XCTAssertEqual(unsignedScan.appFailure, .unsignedApp)
        XCTAssertTrue(unsignedScan.entries.isEmpty)
        XCTAssertEqual(counting.versionReads, 0)

        // `ganymede serve --ip 0.0.0.0` writes `url: localhost` and `hostname: 0.0.0.0`.
        counting.team = team
        _ = try write(pid: pid, fields: ["url": "http://localhost:8888/", "hostname": "0.0.0.0"])
        let wildcardScan = ThisMacVerifier(probe: counting).scan(in: directory)
        XCTAssertNil(wildcardScan.appFailure)
        XCTAssertEqual(wildcardScan.entries.map(\.failure), [.wildcardBind])
        XCTAssertEqual(counting.versionReads, 0)

        // Missing `ganymede_version` produces `.incompleteServerInfo` without running bundledVersion.
        _ = try write(pid: pid, fields: ["ganymede_version": ""])
        let incompleteScan = ThisMacVerifier(probe: counting).scan(in: directory)
        XCTAssertEqual(incompleteScan.entries.map(\.failure), [.incompleteServerInfo])
        XCTAssertEqual(counting.versionReads, 0)

        // Missing `token` produces `.missingToken` without running bundledVersion.
        _ = try write(pid: pid, fields: ["token": ""])
        let noTokenScan = ThisMacVerifier(probe: counting).scan(in: directory)
        XCTAssertEqual(noTokenScan.entries.map(\.failure), [.missingToken])
        XCTAssertEqual(counting.versionReads, 0)
    }

    // MARK: helpers

    /// A TCP listener this process opens on `address`, at a port the system
    /// picks: the socket lookup then answers about a real socket, this
    /// process's own.
    private func openListener(_ address: String) throws -> (fd: Int32, port: Int) {
        let six = address.contains(":")
        let fd = socket(six ? AF_INET6 : AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { throw socketError("socket") }
        var reuse: Int32 = 1
        _ = setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
        var storage = sockaddr_storage()
        let size = six ? MemoryLayout<sockaddr_in6>.size : MemoryLayout<sockaddr_in>.size
        if six {
            var address6 = sockaddr_in6()
            address6.sin6_len = UInt8(MemoryLayout<sockaddr_in6>.size)
            address6.sin6_family = sa_family_t(AF_INET6)
            guard inet_pton(AF_INET6, address, &address6.sin6_addr) == 1 else {
                close(fd)
                throw socketError("inet_pton \(address)")
            }
            withUnsafeMutableBytes(of: &storage) { destination in
                withUnsafeBytes(of: address6) { destination.copyBytes(from: $0) }
            }
        } else {
            var address4 = sockaddr_in()
            address4.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
            address4.sin_family = sa_family_t(AF_INET)
            guard inet_pton(AF_INET, address, &address4.sin_addr) == 1 else {
                close(fd)
                throw socketError("inet_pton \(address)")
            }
            withUnsafeMutableBytes(of: &storage) { destination in
                withUnsafeBytes(of: address4) { destination.copyBytes(from: $0) }
            }
        }
        let bound = withUnsafePointer(to: &storage) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(size))
            }
        }
        guard bound == 0, Darwin.listen(fd, 1) == 0 else {
            close(fd)
            throw socketError("bind/listen \(address)")
        }
        // The port the system gave it.
        var local = sockaddr_storage()
        var localSize = socklen_t(MemoryLayout<sockaddr_storage>.size)
        _ = withUnsafeMutablePointer(to: &local) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(fd, $0, &localSize)
            }
        }
        let port = withUnsafeBytes(of: local) { bytes in
            // `sin_port` and `sin6_port` sit at the same offset, in network
            // byte order.
            Int(UInt16(bigEndian: bytes.loadUnaligned(fromByteOffset: 2, as: UInt16.self)))
        }
        return (fd, port)
    }

    private struct SocketError: Error {
        var message: String
        var code: Int32
    }

    private func socketError(_ what: String) -> SocketError {
        SocketError(message: "\(what): \(String(cString: strerror(errno)))", code: errno)
    }

    /// A server info file in the test's folder, as `ganymede serve` writes
    /// it, with `fields` over the defaults.
    @discardableResult
    private func write(pid: Int32, fields: [String: Any], name: String? = nil) throws -> URL {
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
        let file = directory.appendingPathComponent(name ?? "jpserver-\(pid).json")
        try JSONSerialization.data(withJSONObject: info, options: [.sortedKeys]).write(to: file)
        return file
    }
}
#endif
