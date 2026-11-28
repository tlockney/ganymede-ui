#if os(macOS)
import Foundation
import XCTest

/// Integration tests for `ThisMacVerifier`, `SystemThisMacProbe`, `ThisMacServers`,
/// `Place(remote:verified:)`, and `Place.allows` against real `ganymede serve` processes (#883).
final class ThisMacVerifierIntegrationTests: XCTestCase {
    private var root: URL!

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("ThisMacVerifierIntegration-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let root { try? FileManager.default.removeItem(at: root) }
    }

    /// Finds an executable `ganymede` CLI binary in the bundled app, `PATH`, or `~/.local/bin`.
    private func findGanymedeBinary() throws -> URL {
        let fm = FileManager.default
        var candidates: [URL] = []
        if let bundled = CommandLineTool.bundledTool() {
            candidates.append(bundled)
        }
        let productsDir = Bundle(for: Self.self).bundleURL.deletingLastPathComponent()
        candidates.append(productsDir.appendingPathComponent("Ganymede.app/Contents/Helpers/ganymede"))
        if let onPath = AppMCP.ganymedeCommand() {
            candidates.append(URL(fileURLWithPath: onPath))
        }
        candidates.append(CommandLineTool.defaultLink())
        candidates.append(URL(fileURLWithPath: "/Users/tlockney/.local/bin/ganymede"))
        for candidate in candidates where fm.isExecutableFile(atPath: candidate.path) {
            return candidate
        }
        throw XCTSkip("No ganymede CLI binary found in bundled app, PATH, or ~/.local/bin.")
    }

    private struct RunningServer {
        let process: Process
        let runtimeDir: URL
        let infoFile: URL
        let info: ThisMacServer

        func stop() {
            if process.isRunning {
                process.terminate()
                process.waitUntilExit()
            }
        }
    }

    /// Spawns `ganymede serve` bound to `ip` with an isolated runtime/data dir and
    /// waits until its `jpserver-<pid>.json` info file is written.
    private func spawnServer(
        binary: URL,
        ip: String,
        token: String = "integration-token",
        label: String
    ) throws -> RunningServer {
        let fm = FileManager.default
        let base = root.appendingPathComponent(label, isDirectory: true)
        let serveRoot = base.appendingPathComponent("notebooks", isDirectory: true)
        let runtimeDir = base.appendingPathComponent("runtime", isDirectory: true)
        let dataDir = base.appendingPathComponent("data", isDirectory: true)
        for dir in [serveRoot, runtimeDir, dataDir] {
            try fm.createDirectory(at: dir, withIntermediateDirectories: true)
        }

        let process = Process()
        process.executableURL = binary
        process.arguments = [
            "serve",
            "--ip", ip,
            "--port", "0",
            "--root-dir", serveRoot.path,
            "--token", token,
            "--notary-dir", dataDir.appendingPathComponent("notary").path,
            "--quiet",
        ]
        var env = ProcessInfo.processInfo.environment
        env["JUPYTER_RUNTIME_DIR"] = runtimeDir.path
        env["JUPYTER_DATA_DIR"] = dataDir.path
        env["GANYMEDE_DATA_DIR"] = dataDir.path
        process.environment = env
        process.standardOutput = Pipe()
        process.standardError = Pipe()
        process.standardInput = FileHandle.nullDevice
        try process.run()

        let pid = process.processIdentifier
        let expectedFile = runtimeDir.appendingPathComponent("jpserver-\(pid).json")
        let deadline = Date().addingTimeInterval(15)
        while Date() < deadline {
            if let info = ThisMacVerifier.read(expectedFile) {
                return RunningServer(process: process, runtimeDir: runtimeDir, infoFile: expectedFile, info: info)
            }
            if !process.isRunning {
                XCTFail("ganymede serve --ip \(ip) exited early with status \(process.terminationStatus)")
                break
            }
            Thread.sleep(forTimeInterval: 0.05)
        }
        if process.isRunning {
            process.terminate()
            process.waitUntilExit()
        }
        throw XCTSkip("Timed out waiting for \(expectedFile.lastPathComponent)")
    }

    /// Probe delegating filesystem, liveness, executable path, and socket checks to
    /// `SystemThisMacProbe`, with configurable helper identity/signature behavior to test
    /// real `ganymede serve` sockets and real code-signature rejection independently of
    /// the ad-hoc test runner identity.
    private struct RealSocketProbe: ThisMacProbe {
        let system: SystemThisMacProbe
        var teamIdentifier: String? = "ABCDE12345"
        var helperIdentifier: String? = "com.ganymede-server.Ganymede.helper"
        var bundledVersion: String?
        var useRealSignature = false

        init(bundledTool: URL? = nil, bundledVersion: String? = nil, useRealSignature: Bool = false) {
            system = SystemThisMacProbe(bundledTool: bundledTool)
            self.bundledVersion = bundledVersion
            self.useRealSignature = useRealSignature
        }

        var helperPath: String? { system.helperPath }
        func infoFiles(in directory: URL) -> [URL] { system.infoFiles(in: directory) }
        func isRunning(_ pid: Int32) -> Bool { system.isRunning(pid) }
        func executablePath(of pid: Int32) -> String? { system.executablePath(of: pid) }
        func hasSignature(pid: Int32, team: String, identifier: String) -> Bool {
            useRealSignature ? system.hasSignature(pid: pid, team: team, identifier: identifier) : true
        }
        func isListening(pid: Int32, port: Int, host: String) -> Bool {
            system.isListening(pid: pid, port: port, host: host)
        }
        func isListeningOnWildcard(pid: Int32, port: Int) -> Bool {
            system.isListeningOnWildcard(pid: pid, port: port)
        }
    }

    private func assertPlaceCapabilities(for place: Place, expectedIsThisMac: Bool) {
        if expectedIsThisMac {
            XCTAssertTrue(place.isThisMac)
            XCTAssertTrue(place.allows(.deviceLedger))
            XCTAssertTrue(place.allows(.deviceRemote))
            XCTAssertTrue(place.allows(.appLinks))
            XCTAssertTrue(place.allows(.personName))
            XCTAssertFalse(place.allows(.kernelLocation))
        } else {
            XCTAssertFalse(place.isThisMac)
            XCTAssertFalse(place.allows(.deviceLedger))
            XCTAssertFalse(place.allows(.deviceRemote))
            XCTAssertFalse(place.allows(.appLinks))
            XCTAssertFalse(place.allows(.personName))
            XCTAssertFalse(place.allows(.kernelLocation))
        }
        for capability in [Place.Capability.settings, .nativeChrome, .agentKeys, .openFile] {
            XCTAssertTrue(place.allows(capability), "\(place) should allow \(capability)")
        }
        for capability in Place.Capability.allCases {
            XCTAssertTrue(Place.thisDevice.allows(capability), ".thisDevice should allow \(capability)")
        }
    }

    /// Real `ganymede serve --ip 127.0.0.1` binds literal `127.0.0.1` (verified), whereas
    /// an info file or remote claiming `localhost` is rejected and remains `.machine`.
    func testRealServerBoundToLoopbackVerifiesAndRejectsLocalhost() throws {
        let binary = try findGanymedeBinary()
        let token = "loopback-secret"
        let server = try spawnServer(binary: binary, ip: "127.0.0.1", token: token, label: "loopback")
        defer { server.stop() }

        let port = try XCTUnwrap(server.info.port)
        XCTAssertEqual(server.info.url.host, "127.0.0.1")

        let system = SystemThisMacProbe(bundledTool: binary)
        XCTAssertTrue(system.isRunning(server.info.pid))
        XCTAssertEqual(system.executablePath(of: server.info.pid), system.helperPath)
        XCTAssertTrue(system.isListening(pid: server.info.pid, port: port, host: "127.0.0.1"))
        XCTAssertFalse(system.isListening(pid: server.info.pid, port: port, host: "localhost"))
        XCTAssertFalse(system.isListening(pid: server.info.pid, port: port, host: "::1"))
        XCTAssertFalse(system.isListeningOnWildcard(pid: server.info.pid, port: port))

        let probe = RealSocketProbe(bundledTool: binary, bundledVersion: server.info.version, useRealSignature: false)
        let verifiedList = ThisMacVerifier(probe: probe).servers(in: server.runtimeDir)
        XCTAssertEqual(verifiedList, [server.info])

        let loopbackRemote = Remote(name: "Literal", serverURL: "http://127.0.0.1:\(port)")
        let localhostRemote = Remote(name: "Named", serverURL: "http://localhost:\(port)")
        let matched = ThisMacServers(
            verifiedList,
            remotes: [loopbackRemote, localhostRemote],
            token: { _ in token }
        )
        XCTAssertEqual(matched.ids, [loopbackRemote.id.uuidString])

        let loopbackPlace = try XCTUnwrap(Place(remote: loopbackRemote, verified: matched.ids))
        XCTAssertEqual(loopbackPlace, .thisMac(loopbackRemote.id.uuidString))
        assertPlaceCapabilities(for: loopbackPlace, expectedIsThisMac: true)

        let localhostPlace = try XCTUnwrap(Place(remote: localhostRemote, verified: matched.ids))
        XCTAssertEqual(localhostPlace, .machine(localhostRemote.id.uuidString))
        assertPlaceCapabilities(for: localhostPlace, expectedIsThisMac: false)

        // Even if an info file names `localhost` for the same real pid/port, the verifier refuses it.
        let localhostRuntime = root.appendingPathComponent("localhost-info", isDirectory: true)
        try FileManager.default.createDirectory(at: localhostRuntime, withIntermediateDirectories: true)
        var spoofed = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: server.infoFile)) as? [String: Any]
        )
        spoofed["url"] = "http://localhost:\(port)/"
        spoofed["hostname"] = "localhost"
        try JSONSerialization.data(withJSONObject: spoofed)
            .write(to: localhostRuntime.appendingPathComponent(server.infoFile.lastPathComponent))
        XCTAssertEqual(ThisMacVerifier(probe: probe).servers(in: localhostRuntime), [])
    }

    /// Real `ganymede serve --ip 0.0.0.0` is refused by `SystemThisMacProbe.isListening`,
    /// even if an info file claims `127.0.0.1`, so its remote stays `.machine`.
    func testRealServerBoundToWildcardIsRefusedBySystemProbe() throws {
        let binary = try findGanymedeBinary()
        let token = "wildcard-secret"
        let server = try spawnServer(binary: binary, ip: "0.0.0.0", token: token, label: "wildcard")
        defer { server.stop() }

        let port = try XCTUnwrap(server.info.port)
        // `ganymede serve --ip 0.0.0.0` writes `http://localhost:<port>/` into jpserver-<pid>.json.
        XCTAssertEqual(server.info.url.host, "localhost")

        let system = SystemThisMacProbe(bundledTool: binary)
        XCTAssertTrue(system.isRunning(server.info.pid))
        for host in ["127.0.0.1", "0.0.0.0", "::1", "localhost"] {
            XCTAssertFalse(system.isListening(pid: server.info.pid, port: port, host: host), host)
        }
        XCTAssertTrue(system.isListeningOnWildcard(pid: server.info.pid, port: port))

        // Write a loopback-claiming info file pointing at the real 0.0.0.0 pid.
        let forgedRuntime = root.appendingPathComponent("forged-wildcard-info", isDirectory: true)
        try FileManager.default.createDirectory(at: forgedRuntime, withIntermediateDirectories: true)
        var forged = try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: server.infoFile)) as? [String: Any]
        )
        forged["url"] = "http://127.0.0.1:\(port)/"
        forged["hostname"] = "127.0.0.1"
        try JSONSerialization.data(withJSONObject: forged)
            .write(to: forgedRuntime.appendingPathComponent(server.infoFile.lastPathComponent))

        let probe = RealSocketProbe(bundledTool: binary, bundledVersion: server.info.version, useRealSignature: false)
        let verifiedList = ThisMacVerifier(probe: probe).servers(in: forgedRuntime)
        XCTAssertEqual(verifiedList, [])

        let remote = Remote(name: "Wildcard", serverURL: "http://127.0.0.1:\(port)")
        let matched = ThisMacServers(verifiedList, remotes: [remote], token: { _ in token })
        let place = try XCTUnwrap(Place(remote: remote, verified: matched.ids))
        XCTAssertEqual(place, .machine(remote.id.uuidString))
        assertPlaceCapabilities(for: place, expectedIsThisMac: false)
    }

    /// A non-bundled / unsigned / ad-hoc `ganymede serve` process fails `ThisMacVerifier`
    /// code-signature verification and stays `.machine`, denying `.deviceLedger`, `.appLinks`, etc.
    func testRealNonBundledBinaryFailsSignatureCheckAndStaysMachine() throws {
        let binary = try findGanymedeBinary()
        let token = "nonbundled-secret"
        let server = try spawnServer(binary: binary, ip: "127.0.0.1", token: token, label: "nonbundled")
        defer { server.stop() }

        let port = try XCTUnwrap(server.info.port)

        // With the default system probe (debug/ad-hoc test runner has no team ID), nothing verifies.
        XCTAssertEqual(ThisMacVerifier(probe: SystemThisMacProbe()).servers(in: server.runtimeDir), [])

        // Even with a team + bundled helper identifier supplied, the real `Security` requirement check
        // rejects an unsigned/ad-hoc or differently signed `ganymede` process.
        let strictProbe = RealSocketProbe(
            bundledTool: binary,
            bundledVersion: server.info.version,
            useRealSignature: true
        )
        XCTAssertFalse(strictProbe.hasSignature(
            pid: server.info.pid,
            team: "ABCDE12345",
            identifier: "com.ganymede-server.Ganymede.helper"
        ))
        let verifiedList = ThisMacVerifier(probe: strictProbe).servers(in: server.runtimeDir)
        XCTAssertEqual(verifiedList, [])

        // A server launched from a different executable path than `bundledTool` is also refused (#912).
        let wrongHelperProbe = RealSocketProbe(
            bundledTool: root.appendingPathComponent("Contents/Helpers/ganymede"),
            bundledVersion: server.info.version,
            useRealSignature: false
        )
        XCTAssertEqual(ThisMacVerifier(probe: wrongHelperProbe).servers(in: server.runtimeDir), [])

        let remote = Remote(name: "External CLI", serverURL: "http://127.0.0.1:\(port)")
        let matched = ThisMacServers(verifiedList, remotes: [remote], token: { _ in token })
        XCTAssertTrue(matched.isEmpty)
        let place = try XCTUnwrap(Place(remote: remote, verified: matched.ids))
        XCTAssertEqual(place, .machine(remote.id.uuidString))
        assertPlaceCapabilities(for: place, expectedIsThisMac: false)
    }
}
#endif
