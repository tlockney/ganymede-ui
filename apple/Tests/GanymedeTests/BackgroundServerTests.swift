#if os(macOS)
import Foundation
import ServiceManagement
import XCTest

/// Tests for the background server LaunchAgent setting and its version-check
/// restart logic (#912), using fakes for `SMAppService`, `ThisMacProbe` and
/// `SIGTERM` so nothing touches launchd or real processes.
final class BackgroundServerTests: XCTestCase {
    private let team = "ABCDE12345"
    private let helper = BackgroundServer.helperIdentifier
    private let helperPath = "/Applications/Ganymede.app/Contents/Helpers/ganymede"
    private let verifiedPid: Int32 = 4242
    private let unverifiedPid: Int32 = 5353

    private var directory: URL!

    override func setUpWithError() throws {
        directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("bg-server-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        if let directory { try? FileManager.default.removeItem(at: directory) }
    }

    // MARK: Fake SMAppService

    private struct FakeError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private final class FakeService: BackgroundServerService, @unchecked Sendable {
        var status: SMAppService.Status = .notRegistered
        var registerCalls = 0
        var unregisterCalls = 0
        var openSettingsCalls = 0
        var nextRegisterStatus: SMAppService.Status = .enabled
        var nextUnregisterStatus: SMAppService.Status = .notRegistered
        var registerError: Error?
        var unregisterError: Error?

        func register() throws {
            registerCalls += 1
            status = nextRegisterStatus
            if let registerError { throw registerError }
        }

        func unregister() throws {
            unregisterCalls += 1
            status = nextUnregisterStatus
            if let unregisterError { throw unregisterError }
        }

        func openLoginItemsSettings() {
            openSettingsCalls += 1
        }
    }

    // MARK: Toggle & SMAppService status tests

    @MainActor
    func testOffByDefaultAndToggleRegistersAndUnregisters() {
        let service = FakeService()
        let controller = BackgroundServerController(service: service)

        XCTAssertFalse(controller.isEnabled)
        XCTAssertFalse(controller.needsApproval)
        XCTAssertNil(controller.statusText)
        XCTAssertNil(controller.error)

        // Turning on registers the agent.
        controller.setEnabled(true)
        XCTAssertEqual(service.registerCalls, 1)
        XCTAssertEqual(service.unregisterCalls, 0)
        XCTAssertTrue(controller.isEnabled)
        XCTAssertFalse(controller.needsApproval)
        XCTAssertEqual(controller.statusText, "Enabled")
        XCTAssertNil(controller.error)

        // Turning off unregisters it.
        controller.setEnabled(false)
        XCTAssertEqual(service.unregisterCalls, 1)
        XCTAssertFalse(controller.isEnabled)
        XCTAssertNil(controller.statusText)
        XCTAssertNil(controller.error)
    }

    @MainActor
    func testRequiresApprovalShowsMessageAndOpensLoginItems() {
        let service = FakeService()
        service.nextRegisterStatus = .requiresApproval
        let controller = BackgroundServerController(service: service)

        controller.setEnabled(true)
        XCTAssertTrue(controller.isEnabled)
        XCTAssertTrue(controller.needsApproval)
        XCTAssertEqual(controller.statusText, "Needs approval in System Settings › Login Items")
        XCTAssertNil(controller.error)

        controller.openLoginItemsSettings()
        XCTAssertEqual(service.openSettingsCalls, 1)

        // Returning to the app after approving updates the status.
        service.status = .enabled
        controller.refresh()
        XCTAssertTrue(controller.isEnabled)
        XCTAssertFalse(controller.needsApproval)
        XCTAssertEqual(controller.statusText, "Enabled")
    }

    @MainActor
    func testRegisterAndUnregisterErrorsAreShownAndNeverDropped() {
        let service = FakeService()
        service.nextRegisterStatus = .notRegistered
        service.registerError = FakeError(message: "Operation not permitted")
        let controller = BackgroundServerController(service: service)

        controller.setEnabled(true)
        XCTAssertFalse(controller.isEnabled)
        XCTAssertEqual(controller.error, "Operation not permitted")

        // Succeeding clears the previous error.
        service.registerError = nil
        service.nextRegisterStatus = .enabled
        controller.setEnabled(true)
        XCTAssertTrue(controller.isEnabled)
        XCTAssertNil(controller.error)

        // An error on unregister keeps the error visible and reflects real status.
        service.nextUnregisterStatus = .enabled
        service.unregisterError = FakeError(message: "Launchd refused unregister")
        controller.setEnabled(false)
        XCTAssertTrue(controller.isEnabled)
        XCTAssertEqual(controller.error, "Launchd refused unregister")
    }

    @MainActor
    func testRegisterThrowingWithRequiresApprovalShowsBothStatusAndError() {
        let service = FakeService()
        service.nextRegisterStatus = .requiresApproval
        service.registerError = FakeError(message: "Launch denied by user")
        let controller = BackgroundServerController(service: service)

        controller.setEnabled(true)
        XCTAssertTrue(controller.needsApproval)
        XCTAssertEqual(controller.statusText, "Needs approval in System Settings › Login Items")
        XCTAssertEqual(controller.error, "Launch denied by user")

        // Approving in System Settings clears the stale error on refresh.
        service.status = .enabled
        controller.refresh()
        XCTAssertEqual(controller.statusText, "Enabled")
        XCTAssertNil(controller.error)
    }

    @MainActor
    func testNotFoundStatusReportsMissingConfiguration() {
        let service = FakeService()
        service.status = .notFound
        let controller = BackgroundServerController(service: service)

        XCTAssertFalse(controller.isEnabled)
        XCTAssertFalse(controller.needsApproval)
        XCTAssertNotNil(controller.statusText)
    }

    // MARK: Version check & SIGTERM tests

    private struct FakeProbe: ThisMacProbe {
        var teamIdentifier: String? = "ABCDE12345"
        var helperIdentifier: String? = BackgroundServer.helperIdentifier
        var helperPath: String? = "/Applications/Ganymede.app/Contents/Helpers/ganymede"
        var bundledVersion: String? = "0.18.0"
        var running: Set<Int32> = []
        var paths: [Int32: String] = [:]
        var signatures: [Int32: (team: String, identifier: String)] = [:]
        var listeners: [Int32: [(host: String, port: Int)]] = [:]

        func infoFiles(in directory: URL) -> [URL] { AppMCP.serverInfoFiles(in: directory) }
        func isRunning(_ pid: Int32) -> Bool { running.contains(pid) }
        func executablePath(of pid: Int32) -> String? { paths[pid] }

        func hasSignature(pid: Int32, team: String, identifier: String) -> Bool {
            guard let sig = signatures[pid] else { return false }
            return sig.team == team && sig.identifier == identifier
        }

        func isListening(pid: Int32, port: Int, host: String) -> Bool {
            (listeners[pid] ?? []).contains { $0.port == port && $0.host == host }
        }
    }

    /// Thread-safe recorder for `SIGTERM` calls from the fake world.
    private final class SignalRecorder: @unchecked Sendable {
        private let lock = NSLock()
        private var recorded: [Int32] = []

        func record(_ pid: Int32) {
            lock.lock()
            defer { lock.unlock() }
            recorded.append(pid)
        }

        var pids: [Int32] {
            lock.lock()
            defer { lock.unlock() }
            return recorded
        }
    }

    @discardableResult
    private func writeInfo(pid: Int32, port: Int = 8888, version: String) throws -> URL {
        let info: [String: Any] = [
            "url": "http://127.0.0.1:\(port)/",
            "hostname": "127.0.0.1",
            "port": port,
            "sock": "",
            "secure": false,
            "base_url": "/",
            "token": "secret-\(pid)",
            "root_dir": "/Users/me",
            "password": false,
            "pid": Int(pid),
            "version": "2.21.1",
            "ganymede_version": version,
        ]
        let file = directory.appendingPathComponent("jpserver-\(pid).json")
        try JSONSerialization.data(withJSONObject: info, options: [.sortedKeys]).write(to: file)
        return file
    }

    @MainActor
    func testMatchingVersionSendsNoSignal() async throws {
        try writeInfo(pid: verifiedPid, version: "0.18.0")
        var probe = FakeProbe()
        probe.running = [verifiedPid]
        probe.paths = [verifiedPid: helperPath]
        probe.signatures = [verifiedPid: (team, helper)]
        probe.listeners = [verifiedPid: [("127.0.0.1", 8888)]]

        let service = FakeService()
        service.status = .enabled
        let signals = SignalRecorder()
        let world = SystemThisMacCheckWorld(
            verifier: ThisMacVerifier(probe: probe),
            directory: directory,
            service: service,
            signal: { signals.record($0) }
        )
        let checks = ThisMacChecks(world: world)
        let remote = Remote(name: "here", serverURL: "http://127.0.0.1:8888")
        checks.remotes = { [remote] }
        checks.token = { _ in "secret-\(self.verifiedPid)" }

        checks.refresh()
        await checks.waitForChecks()

        XCTAssertEqual(signals.pids, [])
        XCTAssertEqual(checks.servers.ids, [remote.id.uuidString])
    }

    @MainActor
    func testVersionMismatchSignalsVerifiedPidOnly() async throws {
        // One verified bundled helper running an old version, and one
        // unverified server (different path and signature) also on an old
        // version: only the verified pid receives SIGTERM.
        try writeInfo(pid: verifiedPid, port: 8888, version: "0.17.0")
        try writeInfo(pid: unverifiedPid, port: 8889, version: "0.17.0")
        var probe = FakeProbe()
        probe.running = [verifiedPid, unverifiedPid]
        probe.paths = [
            verifiedPid: helperPath,
            unverifiedPid: "/opt/homebrew/bin/ganymede",
        ]
        probe.signatures = [
            verifiedPid: (team, helper),
            unverifiedPid: ("OTHERTEAM", "ganymede-homebrew"),
        ]
        probe.listeners = [
            verifiedPid: [("127.0.0.1", 8888)],
            unverifiedPid: [("127.0.0.1", 8889)],
        ]

        let service = FakeService()
        service.status = .enabled
        let signals = SignalRecorder()
        let world = SystemThisMacCheckWorld(
            verifier: ThisMacVerifier(probe: probe),
            directory: directory,
            service: service,
            signal: { signals.record($0) }
        )
        let checks = ThisMacChecks(world: world)

        checks.refresh()
        await checks.waitForChecks()

        XCTAssertEqual(signals.pids, [verifiedPid])
        XCTAssertTrue(checks.servers.isEmpty)

        // A second check while the old pid is still shutting down does not
        // signal it again.
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(signals.pids, [verifiedPid])
    }

    @MainActor
    func testUnverifiedPidIsNeverSignaled() async throws {
        try writeInfo(pid: unverifiedPid, version: "0.17.0")
        let service = FakeService()
        service.status = .enabled

        // 1. Wrong executable path (even with valid signature).
        var wrongPath = FakeProbe()
        wrongPath.running = [unverifiedPid]
        wrongPath.paths = [unverifiedPid: "/Users/me/Downloads/Ganymede.app/Contents/Helpers/ganymede"]
        wrongPath.signatures = [unverifiedPid: (team, helper)]
        wrongPath.listeners = [unverifiedPid: [("127.0.0.1", 8888)]]

        // 2. Wrong signature (even at the helper's path).
        var wrongSignature = FakeProbe()
        wrongSignature.running = [unverifiedPid]
        wrongSignature.paths = [unverifiedPid: helperPath]
        wrongSignature.signatures = [unverifiedPid: ("WRONGTEAM", helper)]
        wrongSignature.listeners = [unverifiedPid: [("127.0.0.1", 8888)]]

        // 3. Unsigned / debug build (no team identifier).
        var debugBuild = FakeProbe()
        debugBuild.teamIdentifier = nil
        debugBuild.running = [unverifiedPid]
        debugBuild.paths = [unverifiedPid: helperPath]
        debugBuild.signatures = [unverifiedPid: (team, helper)]
        debugBuild.listeners = [unverifiedPid: [("127.0.0.1", 8888)]]

        // 4. Bundled version unavailable.
        var noVersion = FakeProbe()
        noVersion.bundledVersion = nil
        noVersion.running = [unverifiedPid]
        noVersion.paths = [unverifiedPid: helperPath]
        noVersion.signatures = [unverifiedPid: (team, helper)]
        noVersion.listeners = [unverifiedPid: [("127.0.0.1", 8888)]]

        for (label, probe) in [
            ("wrongPath", wrongPath),
            ("wrongSignature", wrongSignature),
            ("debugBuild", debugBuild),
            ("noVersion", noVersion),
        ] {
            let signals = SignalRecorder()
            let world = SystemThisMacCheckWorld(
                verifier: ThisMacVerifier(probe: probe),
                directory: directory,
                service: service,
                signal: { signals.record($0) }
            )
            let checks = ThisMacChecks(world: world)
            checks.refresh()
            await checks.waitForChecks()
            XCTAssertEqual(signals.pids, [], "unexpected signal for \(label)")
        }
    }

    @MainActor
    func testVersionMismatchDoesNotSignalWhenBackgroundServerIsDisabled() async throws {
        try writeInfo(pid: verifiedPid, version: "0.17.0")
        var probe = FakeProbe()
        probe.running = [verifiedPid]
        probe.paths = [verifiedPid: helperPath]
        probe.signatures = [verifiedPid: (team, helper)]
        probe.listeners = [verifiedPid: [("127.0.0.1", 8888)]]

        let service = FakeService()
        service.status = .notRegistered
        let signals = SignalRecorder()
        let world = SystemThisMacCheckWorld(
            verifier: ThisMacVerifier(probe: probe),
            directory: directory,
            service: service,
            signal: { signals.record($0) }
        )
        let checks = ThisMacChecks(world: world)

        checks.refresh()
        await checks.waitForChecks()

        XCTAssertEqual(signals.pids, [])
        XCTAssertTrue(checks.servers.isEmpty)
    }

    // MARK: LaunchAgent plist

    func testLaunchAgentPlistHasExpectedKeysAndNoToken() throws {
        let plistURL = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // GanymedeTests
            .deletingLastPathComponent()  // Tests
            .deletingLastPathComponent()  // apple
            .appendingPathComponent("LaunchAgents/\(BackgroundServer.plistName)")
        let data = try Data(contentsOf: plistURL)
        let plist = try XCTUnwrap(
            PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any]
        )
        XCTAssertEqual(plist["Label"] as? String, BackgroundServer.label)
        XCTAssertEqual(plist["BundleProgram"] as? String, "Contents/Helpers/ganymede")
        XCTAssertEqual(
            plist["ProgramArguments"] as? [String],
            ["ganymede", "serve", "--no-browser", "--port", "0"]
        )
        XCTAssertEqual(plist["RunAtLoad"] as? Bool, true)
        XCTAssertEqual(plist["KeepAlive"] as? Bool, true)
        XCTAssertEqual(plist["ProcessType"] as? String, "Interactive")
        // Never keep a token or credentials in the plist.
        let args = plist["ProgramArguments"] as? [String] ?? []
        XCTAssertFalse(args.contains { $0.contains("token") })
        XCTAssertNil(plist["EnvironmentVariables"])
    }
}
#endif
