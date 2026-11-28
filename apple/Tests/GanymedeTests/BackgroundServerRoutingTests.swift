#if os(macOS)
import Foundation
import ServiceManagement
import XCTest

/// Unit tests for routing local notebooks through the verified background
/// server as `.thisMac` and moving tailnet sharing to it (#954).
final class BackgroundServerRoutingTests: XCTestCase {
    private let home = URL(fileURLWithPath: "/Users/me", isDirectory: true)
    private let notebook = URL(fileURLWithPath: "/Users/me/work/Orbits.ipynb", isDirectory: false)
    private let folder = URL(fileURLWithPath: "/Users/me/work", isDirectory: true)
    private let outside = URL(fileURLWithPath: "/tmp/scratch.ipynb", isDirectory: false)

    private func verifiedServer(
        root: String = "/Users/me", port: Int = 9001, pid: Int32 = 4242, token: String = "bg-token"
    ) -> ThisMacServer {
        ThisMacServer(
            pid: pid,
            url: URL(string: "http://127.0.0.1:\(port)/")!,
            token: token,
            root: URL(fileURLWithPath: root, isDirectory: true),
            version: "0.17.0"
        )
    }

    // MARK: 1. Background server OFF -> .thisDevice + embedded tailnet allowed

    func testBackgroundOffRoutesToThisDeviceAndAllowsEmbeddedTailnet() {
        for status in [SMAppService.Status.notRegistered, .notFound] {
            let fileDecision = BackgroundServerRouting.route(
                .file(notebook),
                backgroundStatus: status,
                backgroundServer: verifiedServer(),
                lastScan: ThisMacScanResult()
            )
            XCTAssertEqual(fileDecision, .embedded(target: .file(notebook), notice: nil))
            XCTAssertEqual(fileDecision.target.place, .thisDevice)
            XCTAssertNil(fileDecision.notice)

            let folderDecision = BackgroundServerRouting.route(
                .folder(folder),
                backgroundStatus: status,
                backgroundServer: verifiedServer(),
                lastScan: ThisMacScanResult()
            )
            XCTAssertEqual(folderDecision, .embedded(target: .folder(folder), notice: nil))

            // Embedded tailnet sharing works normally when background server is off.
            XCTAssertFalse(BackgroundServerRouting.backgroundOwnsTailnet(status))
            XCTAssertEqual(
                BackgroundServerRouting.embeddedTailnetAllow(
                    backgroundStatus: status,
                    tailnetShare: true,
                    tailnetAllow: ["me@example.com"]
                ),
                ["me@example.com"]
            )
            XCTAssertEqual(
                BackgroundServerRouting.embeddedTailnetAllow(
                    backgroundStatus: status,
                    tailnetShare: false,
                    tailnetAllow: ["me@example.com"]
                ),
                []
            )
            XCTAssertNil(
                BackgroundServerRouting.localWindowNotice(
                    target: .file(notebook),
                    place: .thisDevice,
                    backgroundStatus: status,
                    backgroundServer: nil,
                    lastScan: ThisMacScanResult()
                )
            )
        }
    }

    // MARK: 2. Background server ON & verified -> routes via .thisMac + embedded tailnet disabled

    func testBackgroundOnAndVerifiedRoutesLocalTargetsThroughThisMacAndDisablesEmbeddedTailnet() {
        let bg = verifiedServer(root: "/Users/me")
        let scan = ThisMacScanResult(verified: [bg])

        let fileDecision = BackgroundServerRouting.route(
            .file(notebook),
            backgroundStatus: .enabled,
            backgroundServer: bg,
            lastScan: scan
        )
        XCTAssertEqual(
            fileDecision,
            .background(
                target: .machineFile(machine: BackgroundServer.mountID, path: "/work/Orbits.ipynb"),
                server: bg)
        )
        XCTAssertNil(fileDecision.notice)

        let folderDecision = BackgroundServerRouting.route(
            .folder(folder),
            backgroundStatus: .enabled,
            backgroundServer: bg,
            lastScan: scan
        )
        XCTAssertEqual(
            folderDecision,
            .background(
                target: .machineFolder(machine: BackgroundServer.mountID, path: "/work"),
                server: bg)
        )

        // Root folder itself maps to "/".
        let rootDecision = BackgroundServerRouting.route(
            .folder(home),
            backgroundStatus: .enabled,
            backgroundServer: bg,
            lastScan: scan
        )
        XCTAssertEqual(
            rootDecision,
            .background(
                target: .machineFolder(machine: BackgroundServer.mountID, path: "/"),
                server: bg)
        )

        // ThisMacServers resolves routed targets to `.thisMac(BackgroundServer.mountID)` with full capabilities.
        let servers = ThisMacServers(scan: scan, remotes: [], token: { _ in nil }, backgroundServer: bg)
        let resolvedPlace = servers.place(for: fileDecision.target)
        XCTAssertEqual(resolvedPlace, .thisMac(BackgroundServer.mountID))
        XCTAssertTrue(resolvedPlace.isThisMac)
        XCTAssertTrue(resolvedPlace.isLocalPlace)
        XCTAssertTrue(resolvedPlace.allows(.deviceLedger))
        XCTAssertTrue(resolvedPlace.allows(.deviceRemote))
        XCTAssertTrue(resolvedPlace.indexesLocally)
        XCTAssertEqual(servers.root(for: resolvedPlace), bg.root)
        XCTAssertNil(servers.notice(for: resolvedPlace))
        XCTAssertNil(
            BackgroundServerRouting.localWindowNotice(
                target: fileDecision.target,
                place: resolvedPlace,
                backgroundStatus: .enabled,
                backgroundServer: bg,
                lastScan: scan
            )
        )

        // Local notebook title omits the redundant " · This Mac" suffix.
        XCTAssertEqual(fileDecision.target.displayTitle(machineName: "This Mac"), "Orbits")

        // Local terminals open in the local folder under the background server's root.
        let terminal = resolvedPlace.terminalTarget(
            notebook: "work/Orbits.ipynb", fallbackFolder: "", remotes: [], thisMacRoot: bg.root)
        XCTAssertEqual(
            terminal,
            .local(folder: URL(fileURLWithPath: "/Users/me/work", isDirectory: true)))

        // Place switcher lists "This Mac" once as `.thisMac("this-mac")`.
        let entries = Places.entries(
            remotes: [], thisDevice: "This Mac", mounting: true,
            verified: servers.ids, thisDevicePlace: resolvedPlace)
        XCTAssertEqual(entries, [PlaceEntry(place: .thisMac(BackgroundServer.mountID), title: "This Mac")])

        // Embedded server omits tailnet sharing while background server is enabled.
        XCTAssertTrue(BackgroundServerRouting.backgroundOwnsTailnet(.enabled))
        XCTAssertEqual(
            BackgroundServerRouting.embeddedTailnetAllow(
                backgroundStatus: .enabled,
                tailnetShare: true,
                tailnetAllow: ["me@example.com"]
            ),
            []
        )
    }

    func testLocalPathOutsideBackgroundRootFallsBackWithExplicitNotice() {
        let bg = verifiedServer(root: "/Users/me")
        let decision = BackgroundServerRouting.route(
            .file(outside),
            backgroundStatus: .enabled,
            backgroundServer: bg,
            lastScan: ThisMacScanResult(verified: [bg])
        )
        XCTAssertEqual(decision.target, .file(outside))
        XCTAssertNotNil(decision.notice)
        XCTAssertTrue(decision.notice?.contains("/Users/me") == true)
        XCTAssertTrue(decision.notice?.contains("embedded server") == true)
    }

    // MARK: 3. Background server ON & unverified/unavailable -> never routes, surfaces status

    func testBackgroundOnButUnverifiedNeverRoutesAndSurfacesStatus() {
        // Not running yet (empty scan).
        let notRunning = BackgroundServerRouting.route(
            .file(notebook),
            backgroundStatus: .enabled,
            backgroundServer: nil,
            lastScan: ThisMacScanResult()
        )
        XCTAssertEqual(notRunning.target, .file(notebook))
        XCTAssertNotNil(notRunning.notice)
        XCTAssertTrue(notRunning.notice?.contains("isn’t running") == true)

        // Unsigned / debug app build.
        let unsigned = BackgroundServerRouting.route(
            .file(notebook),
            backgroundStatus: .enabled,
            backgroundServer: nil,
            lastScan: ThisMacScanResult(appFailure: .unsignedApp)
        )
        XCTAssertEqual(unsigned.target, .file(notebook))
        XCTAssertTrue(unsigned.notice?.contains("isn’t signed") == true)

        // Version mismatch (restarting via launchd).
        let mismatched = BackgroundServerRouting.route(
            .file(notebook),
            backgroundStatus: .enabled,
            backgroundServer: nil,
            lastScan: ThisMacScanResult(entries: [
                ThisMacScanEntry(
                    url: URL(string: "http://127.0.0.1:9001/")!, hostname: "127.0.0.1",
                    port: 9001, token: "t", isRunning: true,
                    failure: .versionMismatch(server: "0.16.0", app: "0.17.0")),
            ])
        )
        XCTAssertEqual(mismatched.target, .file(notebook))
        XCTAssertTrue(mismatched.notice?.contains("0.16.0") == true)
        XCTAssertTrue(mismatched.notice?.contains("0.17.0") == true)

        // Wildcard bind.
        let wildcard = BackgroundServerRouting.route(
            .file(notebook),
            backgroundStatus: .enabled,
            backgroundServer: nil,
            lastScan: ThisMacScanResult(entries: [
                ThisMacScanEntry(
                    url: URL(string: "http://localhost:9001/")!, hostname: "0.0.0.0",
                    port: 9001, token: "t", isRunning: true, failure: .wildcardBind),
            ])
        )
        XCTAssertEqual(wildcard.target, .file(notebook))
        XCTAssertTrue(wildcard.notice?.contains("--ip 127.0.0.1") == true)

        // Needs approval in System Settings › Login Items.
        let needsApproval = BackgroundServerRouting.route(
            .file(notebook),
            backgroundStatus: .requiresApproval,
            backgroundServer: nil,
            lastScan: ThisMacScanResult()
        )
        XCTAssertEqual(needsApproval.target, .file(notebook))
        XCTAssertTrue(needsApproval.notice?.contains("Login Items") == true)
        // While awaiting approval, the background server is not running yet, so embedded tailnet stays allowed.
        XCTAssertFalse(BackgroundServerRouting.backgroundOwnsTailnet(.requiresApproval))
    }

    func testDowngradedBackgroundWindowSurfacesNoticeAndReadyEmbeddedWindowPromptsNewTab() {
        let bg = verifiedServer(root: "/Users/me")
        let scan = ThisMacScanResult(verified: [bg])

        // An open embedded `.thisDevice` window notices when the background server becomes ready.
        let readyNotice = BackgroundServerRouting.localWindowNotice(
            target: .file(notebook),
            place: .thisDevice,
            backgroundStatus: .enabled,
            backgroundServer: bg,
            lastScan: scan
        )
        XCTAssertNotNil(readyNotice)
        XCTAssertTrue(readyNotice?.contains("ready") == true)

        // A background window downgraded to `.machine("this-mac")` when the server stops surfaces why.
        let stoppedNotice = BackgroundServerRouting.localWindowNotice(
            target: .machineFile(machine: BackgroundServer.mountID, path: "/work/Orbits.ipynb"),
            place: .machine(BackgroundServer.mountID),
            backgroundStatus: .enabled,
            backgroundServer: nil,
            lastScan: ThisMacScanResult()
        )
        XCTAssertNotNil(stoppedNotice)
        XCTAssertTrue(stoppedNotice?.contains("isn’t running") == true)

        // Turning the background server off while a routed tab is open tells the user to reopen.
        let turnedOffNotice = BackgroundServerRouting.localWindowNotice(
            target: .machineFile(machine: BackgroundServer.mountID, path: "/work/Orbits.ipynb"),
            place: .machine(BackgroundServer.mountID),
            backgroundStatus: .notRegistered,
            backgroundServer: nil,
            lastScan: ThisMacScanResult()
        )
        XCTAssertNotNil(turnedOffNotice)
        XCTAssertTrue(turnedOffNotice?.contains("turned off") == true)
    }

    func testNonLocalTargetsAreNeverRerouted() {
        let bg = verifiedServer(root: "/Users/me")
        let machineTarget = WindowTarget.machineFile(machine: "remote-1", path: "/notes/a.ipynb")
        let consoleTarget = WindowTarget.console(folder: folder, id: UUID())
        for target in [machineTarget, consoleTarget] {
            let decision = BackgroundServerRouting.route(
                target,
                backgroundStatus: .enabled,
                backgroundServer: bg,
                lastScan: ThisMacScanResult(verified: [bg])
            )
            XCTAssertEqual(decision, .embedded(target: target, notice: nil))
        }
    }

    func testTailnetTransitionRestartPolicy() {
        // Enabling background server while embedded tailnet is shared (or left a served port) restarts embedded server.
        XCTAssertTrue(
            BackgroundServerRouting.shouldRestartEmbeddedForTailnetTransition(
                from: .notRegistered, to: .enabled, tailnetShare: true, hasServedPort: false))
        XCTAssertTrue(
            BackgroundServerRouting.shouldRestartEmbeddedForTailnetTransition(
                from: .notRegistered, to: .enabled, tailnetShare: false, hasServedPort: true))
        // Disabling background server while tailnetShare is on restores embedded tailnet via restart.
        XCTAssertTrue(
            BackgroundServerRouting.shouldRestartEmbeddedForTailnetTransition(
                from: .enabled, to: .notRegistered, tailnetShare: true, hasServedPort: false))
        // No restart needed when tailnet isn't shared and no served port exists, or when ownership didn't change.
        XCTAssertFalse(
            BackgroundServerRouting.shouldRestartEmbeddedForTailnetTransition(
                from: .notRegistered, to: .enabled, tailnetShare: false, hasServedPort: false))
        XCTAssertFalse(
            BackgroundServerRouting.shouldRestartEmbeddedForTailnetTransition(
                from: .enabled, to: .enabled, tailnetShare: true, hasServedPort: true))
    }

    func testSelectPrimaryServerPrefersDeepestCoveringRoot() {
        let rootAll = verifiedServer(root: "/", port: 9001, pid: 100)
        let rootHome = verifiedServer(root: "/Users/me", port: 9002, pid: 200)
        let selected = BackgroundServerRouting.selectPrimaryServer(
            from: [rootAll, rootHome], preferredRoot: folder)
        XCTAssertEqual(selected, rootHome)

        // When preferredRoot is outside /Users/me, selects `/` which covers it.
        let forTmp = BackgroundServerRouting.selectPrimaryServer(
            from: [rootAll, rootHome], preferredRoot: outside)
        XCTAssertEqual(forTmp, rootAll)
    }

    // MARK: 4. ThisMacChecks integration for the background mount

    @MainActor
    private final class FakeWorld: ThisMacCheckWorld {
        var scanResult = ThisMacScanResult()
        var isBackgroundServerEnabled = false
        var exits: [(pid: Int32, exit: @MainActor () -> Void)] = []
        var debounce: Duration = .zero

        func scan() async -> ThisMacScanResult { scanResult }
        func scanNow() -> ThisMacScanResult { scanResult }
        func watch(pid: Int32, exit: @escaping @MainActor @Sendable () -> Void) -> any ThisMacWatch {
            exits.append((pid, { exit() }))
            return DummyWatch()
        }
        func watchRuntimeDirectory(_ change: @escaping @MainActor @Sendable () -> Void) -> (any ThisMacWatch)? {
            DummyWatch()
        }
        func infoFileDates() -> [String: Date] { [:] }
        func terminate(pid: Int32) {}
    }

    @MainActor
    private final class DummyWatch: ThisMacWatch {
        func cancel() {}
    }

    @MainActor
    func testThisMacChecksRegistersAndWatchesBackgroundMountOnlyWhenEnabled() async {
        let world = FakeWorld()
        let bg = verifiedServer(root: "/Users/me", pid: 7777)
        world.scanResult = ThisMacScanResult(verified: [bg])
        let checks = ThisMacChecks(world: world)
        checks.appRoot = { self.folder }

        var changes = 0
        checks.onServersChanged = { changes += 1 }

        // Background disabled: verifiedServers sees it, but backgroundServer mount is nil.
        world.isBackgroundServerEnabled = false
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(checks.verifiedServers, [bg])
        XCTAssertNil(checks.backgroundServer)

        // Background enabled: mounted under BackgroundServer.mountID and PID is watched.
        world.isBackgroundServerEnabled = true
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(checks.backgroundServer, bg)
        XCTAssertEqual(checks.servers.server(BackgroundServer.mountID), bg)
        XCTAssertEqual(world.exits.map(\.pid), [7777])
        XCTAssertGreaterThan(changes, 0)

        // When the background server process exits, the mount drops immediately.
        world.scanResult = ThisMacScanResult()
        for watch in world.exits where watch.pid == 7777 { watch.exit() }
        XCTAssertNil(checks.backgroundServer)
        await checks.waitForChecks()
        XCTAssertNil(checks.backgroundServer)
    }
}
#endif
