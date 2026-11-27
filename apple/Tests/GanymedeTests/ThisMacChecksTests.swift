#if os(macOS)
import XCTest

/// The lifecycle of this Mac's checks (#883), with the world they ask
/// faked: one check out at a time, the check asked for while one is out,
/// the check that began before the trust was dropped, and the watches that
/// end a remote's trust with the process that earned it.
final class ThisMacChecksTests: XCTestCase {
    private let pid: Int32 = 4242

    private func server(
        port: Int = 8888, token: String = "a-token", root: String = "/Users/me/work", pid: Int32? = nil
    ) -> ThisMacServer {
        ThisMacServer(
            pid: pid ?? self.pid, url: URL(string: "http://127.0.0.1:\(port)/")!, token: token,
            root: URL(fileURLWithPath: root, isDirectory: true), version: "0.17.0")
    }

    private func remote(port: Int = 8888) -> Remote {
        Remote(name: "here", serverURL: "http://127.0.0.1:\(port)")
    }

    /// The checks, matched against `remotes` as the app matches them: each
    /// remote with the server it names, on its address and with its token.
    @MainActor
    private func checks(_ world: FakeWorld, remotes: [Remote], token: String = "a-token") -> ThisMacChecks {
        let checks = ThisMacChecks(world: world)
        checks.remotes = { remotes }
        checks.token = { _ in token }
        return checks
    }

    /// What a check asks, answered by the test: the servers it finds, the
    /// info files' dates, and whether a check is held before it answers so
    /// a test can ask for another.
    @MainActor
    private final class FakeWorld: ThisMacCheckWorld {
        /// What a check finds, read when it answers.
        var now: [ThisMacServer] = []
        /// The runtime directory's `jpserver-*.json` files and their dates.
        var dates: [String: Date] = [:]
        /// How many checks asked for the servers, how many a window asked
        /// for here and now, and how many process watches were cancelled.
        var asked = 0
        var askedNow = 0
        var cancelled = 0
        /// Whether a check waits before it answers, and the gates the held
        /// checks wait on.
        var held = false
        var gates: [CheckedContinuation<Void, Never>] = []
        /// Each verified pid's exit, as the app would be told of it.
        var exits: [(pid: Int32, exit: @MainActor () -> Void)] = []
        /// The runtime directory's watch, if one was taken.
        var directoryChange: (@MainActor () -> Void)?
        var directoryWatches = 0
        var debounce: Duration = .zero

        func servers() async -> [ThisMacServer] {
            asked += 1
            if held { await withCheckedContinuation { gates.append($0) } }
            return now
        }

        func serversNow() -> [ThisMacServer] {
            askedNow += 1
            return now
        }

        func watch(pid: Int32, exit: @escaping @MainActor @Sendable () -> Void) -> any ThisMacWatch {
            exits.append((pid, { exit() }))
            return Watch { [weak self] in self?.cancelled += 1 }
        }

        func watchRuntimeDirectory(
            _ change: @escaping @MainActor @Sendable () -> Void
        ) -> (any ThisMacWatch)? {
            directoryWatches += 1
            directoryChange = { change() }
            return Watch { [weak self] in self?.cancelled += 1 }
        }

        func infoFileDates() -> [String: Date] { dates }

        /// Lets every held check answer.
        func release() {
            held = false
            let waiting = gates
            gates = []
            for gate in waiting { gate.resume() }
        }

        /// Tells the app a write was made in the runtime directory.
        func changed() { directoryChange?() }

        /// Ends the verified server's process.
        func exit(_ pid: Int32) {
            for watch in exits where watch.pid == pid { watch.exit() }
        }
    }

    /// A watch the fake world hands out, which counts its cancellation.
    @MainActor
    private final class Watch: ThisMacWatch {
        private let onCancel: @MainActor () -> Void

        init(_ onCancel: @escaping @MainActor () -> Void) { self.onCancel = onCancel }

        func cancel() { onCancel() }
    }

    /// Polls `check` until it is true: a check runs in a task of its own.
    @MainActor
    private func eventually(_ what: String, _ check: () -> Bool) async {
        let deadline = Date().addingTimeInterval(5)
        while Date() < deadline {
            if check() { return }
            try? await Task.sleep(for: .milliseconds(10))
        }
        XCTFail("timed out waiting for \(what)")
    }

    // MARK: one check at a time

    /// One check is out at a time, and one asked for while it is out runs
    /// once more when it ends — not once for each asking (#883).
    @MainActor
    func testOneCheckIsOutAtATimeAndTheCheckAskedForDuringItRunsAfter() async throws {
        let world = FakeWorld()
        world.now = [server()]
        let here = remote()
        let checks = checks(world, remotes: [here])
        world.held = true
        checks.refresh()
        try await eventually("the check to reach the world") { world.gates.count == 1 }
        // Asked for again and again while it is out: one more runs, once.
        checks.refresh()
        checks.refresh()
        checks.refresh()
        XCTAssertEqual(world.asked, 1)
        XCTAssertTrue(checks.servers.isEmpty)
        world.release()
        await checks.waitForChecks()
        XCTAssertEqual(world.asked, 2)
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
        XCTAssertEqual(world.askedNow, 0)
    }

    /// A check that began before the trust was dropped names mounts that are
    /// gone: its answer applies nothing (#883).
    @MainActor
    func testACheckThatBeganBeforeTheTrustWasDroppedAppliesNothing() async throws {
        let world = FakeWorld()
        world.now = [server()]
        let here = remote()
        let checks = checks(world, remotes: [here])
        world.held = true
        checks.refresh()
        try await eventually("the check to reach the world") { world.gates.count == 1 }
        // The app's server stopped while that check was out.
        checks.stopTrust()
        world.release()
        await checks.waitForChecks()
        XCTAssertTrue(checks.servers.isEmpty)
        // And the next check, after the drop, does apply.
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
    }

    // MARK: the trust

    /// The trust goes with the server it was verified for: nothing mounted,
    /// nothing of this Mac's own (#883). `AppModel.stopServer`,
    /// `stopForQuit`, a restart's `start()` and `syncMachines`' no-server
    /// path all call this.
    @MainActor
    func testTheTrustGoesWithTheServerItWasVerifiedFor() async {
        let world = FakeWorld()
        world.now = [server()]
        let here = remote()
        let checks = checks(world, remotes: [here])
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
        XCTAssertEqual(world.exits.map(\.pid), [pid])
        let generation = checks.generation
        checks.stopTrust()
        XCTAssertTrue(checks.servers.isEmpty)
        // Its process and the runtime directory aren't watched any more, and
        // what a check that is out finds belongs to the server that stopped.
        XCTAssertEqual(world.cancelled, 2)
        XCTAssertGreaterThan(checks.generation, generation)
        // Trust comes again from a check, not from the watches that ended.
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
    }

    /// The verified server's process ended: its remote is a machine again at
    /// once, and the runtime directory is read again for a server that took
    /// its place (#883).
    @MainActor
    func testAProcessExitEndsItsRemotesTrustAndAsksAgain() async {
        let world = FakeWorld()
        world.now = [server()]
        let here = remote()
        let checks = checks(world, remotes: [here])
        checks.refresh()
        await checks.waitForChecks()
        let asked = world.asked
        // The server is gone, and then its process ends.
        world.now = []
        world.exit(pid)
        XCTAssertTrue(checks.servers.isEmpty)
        await eventually("the next check") { world.asked > asked }
        await checks.waitForChecks()
        XCTAssertTrue(checks.servers.isEmpty)
        // An exit reported for a pid the server no longer has ends nothing:
        // a server that took its place keeps its trust.
        world.now = [server(pid: 5252)]
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
        checks.processExited(id: here.id.uuidString, pid: pid)
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
    }

    /// Editing a trusted remote — another address or token, which is another
    /// server the app would send its token to — drops its trust before its
    /// mount is made again (#883).
    @MainActor
    func testForgettingOneRemoteLeavesTheOthersTrusted() async {
        let world = FakeWorld()
        let here = remote()
        let mini = remote(port: 9999)
        world.now = [server(), server(port: 9999, token: "b-token", pid: 4343)]
        let checks = ThisMacChecks(world: world)
        checks.remotes = { [here, mini] }
        checks.token = { $0 == here.id ? "a-token" : "b-token" }
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString, mini.id.uuidString])
        // The remote saved again with another token: its server isn't the
        // one that was verified.
        checks.forget(here.id.uuidString)
        XCTAssertEqual(checks.servers.ids, [mini.id.uuidString])
        XCTAssertNil(checks.servers.root(for: .thisMac(here.id.uuidString)))
        // The edit is applied by the next check, which drops it for good.
        world.now = [server(), server(port: 9999, token: "b-token", pid: 4343)]
        checks.token = { $0 == here.id ? "another" : "b-token" }
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(checks.servers.ids, [mini.id.uuidString])
    }

    // MARK: a window's check

    /// A check made here and now, before a window's first load, applies at
    /// once and drops the check that is out: that one names mounts from
    /// before the window asked (#883).
    @MainActor
    func testACheckMadeHereAndNowAppliesAtOnceAndDropsTheOneThatIsOut() async throws {
        let world = FakeWorld()
        let here = remote()
        let checks = checks(world, remotes: [here])
        world.held = true
        checks.refresh()
        try await eventually("the check to reach the world") { world.gates.count == 1 }
        world.now = [server()]
        checks.checkNow()
        XCTAssertEqual(world.askedNow, 1)
        // What it found applies before the page is loaded, without waiting
        // for the check that is out.
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
        // The mounts changed while that check was out: its answer is older
        // than the one that was applied, and applies nothing.
        world.now = []
        world.release()
        await checks.waitForChecks()
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
    }

    /// A check asked for while the dropped one was out still runs once it
    /// ends (#883): the window's check drops what the old one found, not
    /// the asking that came after it.
    @MainActor
    func testTheCheckAskedForWhileADroppedOneWasOutStillRuns() async throws {
        let world = FakeWorld()
        let here = remote()
        let checks = checks(world, remotes: [here])
        world.held = true
        checks.refresh()
        try await eventually("the check to reach the world") { world.gates.count == 1 }
        // Asked for again while that one is out, then a window's check.
        checks.refresh()
        world.now = [server()]
        checks.checkNow()
        world.release()
        await checks.waitForChecks()
        XCTAssertEqual(world.asked, 2)
        XCTAssertEqual(checks.servers.ids, [here.id.uuidString])
    }

    // MARK: Open Recent

    /// A this-Mac window's Open Recent lists the notebooks under its
    /// server's root, by their paths there, and opens one in a new tab
    /// through the mount as a machine's target (#883). This device's lists
    /// them all, by their own paths.
    func testAThisMacWindowsRecentsAreTheOnesUnderItsRoot() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let root = dir.appendingPathComponent("work", isDirectory: true)
        try FileManager.default.createDirectory(
            at: root.appendingPathComponent("notes"), withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let inside = root.appendingPathComponent("notes/Io.ipynb")
        let outside = dir.appendingPathComponent("elsewhere.ipynb")
        let entries = RecentEntry.entries([inside, outside, root], root: root)
        XCTAssertEqual(entries.map(\.path), ["notes/Io.ipynb"])
        XCTAssertEqual(entries.map(\.url), [inside])
        let id = remote().id.uuidString
        XCTAssertEqual(
            entries.first?.tabTarget(in: .thisMac(id)),
            WindowTarget.machine(id, path: "notes/Io.ipynb", isFolder: false))
        // This device's window: every recent, by its own path, and a new tab
        // is this device's file.
        let all = RecentEntry.entries([inside, outside], root: nil)
        XCTAssertEqual(all.map(\.url), [inside, outside])
        XCTAssertEqual(all.first?.tabTarget(in: .thisDevice), WindowTarget(opening: inside))
    }

    // MARK: the runtime directory

    /// A write in the runtime directory sends a check when the
    /// `jpserver-*.json` files or their dates changed, and no check for a
    /// kernel's own `kernel-*.json` write, which is no info file (#883).
    @MainActor
    func testOnlyTheServerInfoFilesSendACheck() async {
        let world = FakeWorld()
        let start = Date(timeIntervalSince1970: 1_000)
        world.dates = ["jpserver-4242.json": start]
        world.now = [server()]
        let here = remote()
        let checks = checks(world, remotes: [here])
        checks.refresh()
        await checks.waitForChecks()
        XCTAssertEqual(world.directoryWatches, 1)
        let asked = world.asked
        // A kernel's write: the info files are as they were.
        world.changed()
        try? await Task.sleep(for: .milliseconds(100))
        XCTAssertEqual(world.asked, asked)
        // A server's info file changed.
        world.dates = ["jpserver-4242.json": start.addingTimeInterval(60)]
        world.changed()
        await eventually("the check the changed info file sends") { world.asked > asked }
        await checks.waitForChecks()
        // Another info file: a server started.
        let afterChange = world.asked
        world.dates["jpserver-4343.json"] = start
        world.changed()
        await eventually("the check the new info file sends") { world.asked > afterChange }
        await checks.waitForChecks()
    }

    /// A few writes come with one action: the system waits for them rather
    /// than checking for each.
    @MainActor
    func testTheRuntimeDirectorysWritesAreDebounced() {
        XCTAssertEqual(SystemThisMacCheckWorld().debounce, .milliseconds(500))
    }
}
#endif
