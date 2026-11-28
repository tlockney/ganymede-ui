#if os(macOS)
import Darwin
import Foundation
import Observation

/// Something a this-Mac check keeps watch on (#883): a verified server's
/// process, or the Jupyter runtime directory. Behind a protocol so the
/// tests fire an exit or a write without a process or a folder.
@MainActor
protocol ThisMacWatch: AnyObject {
    /// Stops the watch: nothing it would report comes after.
    func cancel()
}

/// What a this-Mac check asks of the world (#883, #912, #887), behind a
/// protocol so the tests answer with no info files, processes or folders: the
/// verifier's scan (verified servers, failure reasons, and any verified
/// bundled helper with a version mismatch), a pid's exit, the runtime
/// directory's writes, and signaling a stale background server.
@MainActor
protocol ThisMacCheckWorld {
    /// The verifier's scan of the runtime directory, read off the main
    /// thread, since reading the bundled tool's version runs it.
    func scan() async -> ThisMacScanResult
    /// The same scan, here and now: a window runs this before its first load,
    /// and its answer must be there before the page is.
    func scanNow() -> ThisMacScanResult
    /// Watches a verified server's process: `exit` runs when `pid` ends.
    func watch(pid: Int32, exit: @escaping @MainActor @Sendable () -> Void) -> any ThisMacWatch
    /// Watches the Jupyter runtime directory: `change` runs when a file in
    /// it is written, renamed or removed.
    func watchRuntimeDirectory(_ change: @escaping @MainActor @Sendable () -> Void) -> (any ThisMacWatch)?
    /// The `jpserver-*.json` files in the runtime directory, by name, with
    /// when each last changed. A kernel's own `kernel-*.json` write is no
    /// part of it, so a kernel's write sends no check.
    func infoFileDates() -> [String: Date]
    /// How long a runtime directory write waits for the writes that come
    /// with it before a check.
    var debounce: Duration { get }
    /// Whether the background server LaunchAgent is enabled (#912): only
    /// then does a version mismatch send `SIGTERM` so launchd restarts it.
    var isBackgroundServerEnabled: Bool { get }
    /// Sends `SIGTERM` to a verified bundled helper pid whose version differs
    /// from the app's (#912). Never called for an unverified pid.
    func terminate(pid: Int32)
}

/// The system's answers (#883, #912): `ThisMacVerifier` for the files and the
/// processes behind them, a dispatch process source per verified pid, a file
/// system source on the runtime directory, and `SMAppService` + `SIGTERM` for
/// restarting an outdated background server.
@MainActor
final class SystemThisMacCheckWorld: ThisMacCheckWorld {
    private let verifier: ThisMacVerifier
    private let directory: URL
    private let service: any BackgroundServerService
    private let signal: @Sendable (Int32) -> Void

    init(
        verifier: ThisMacVerifier = ThisMacVerifier(),
        directory: URL = AppMCP.runtimeDirectory(),
        service: any BackgroundServerService = SystemBackgroundServerService(),
        signal: @escaping @Sendable (Int32) -> Void = { pid in
            NSLog("Ganymede: background server pid %d version mismatch; sending SIGTERM so launchd restarts it", pid)
            _ = Darwin.kill(pid, SIGTERM)
        }
    ) {
        self.verifier = verifier
        self.directory = directory
        self.service = service
        self.signal = signal
    }

    func scan() async -> ThisMacScanResult {
        let verifier = verifier
        let directory = directory
        return await Task.detached(priority: .utility) { verifier.scan(in: directory) }.value
    }

    func scanNow() -> ThisMacScanResult { verifier.scan(in: directory) }

    var isBackgroundServerEnabled: Bool { service.status == .enabled }

    func terminate(pid: Int32) { signal(pid) }

    /// A pid's exit, as `kill(pid, 0)` can't see it: a source that fires
    /// when the process ends, however it ends.
    func watch(pid: Int32, exit: @escaping @MainActor @Sendable () -> Void) -> any ThisMacWatch {
        ProcessWatch(pid: pid, exit: exit)
    }

    func watchRuntimeDirectory(
        _ change: @escaping @MainActor @Sendable () -> Void
    ) -> (any ThisMacWatch)? {
        let fd = open(directory.path, O_EVTONLY)
        guard fd >= 0 else { return nil }
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd, eventMask: .write, queue: .main)
        source.setEventHandler { MainActor.assumeIsolated { change() } }
        source.setCancelHandler { close(fd) }
        source.resume()
        return SourceWatch(source)
    }

    func infoFileDates() -> [String: Date] { AppMCP.infoFileDates(in: directory) }

    /// A few writes come with one action (a file written, then renamed
    /// into place): one check follows them.
    var debounce: Duration { .milliseconds(500) }

    /// A verified server's process, watched on the main queue.
    private final class ProcessWatch: ThisMacWatch {
        private let source: DispatchSourceProcess

        init(pid: Int32, exit: @escaping @MainActor @Sendable () -> Void) {
            source = DispatchSource.makeProcessSource(identifier: pid, eventMask: .exit, queue: .main)
            source.setEventHandler { MainActor.assumeIsolated { exit() } }
            source.resume()
        }

        func cancel() { source.cancel() }
    }

    /// The runtime directory, watched by a descriptor it opened.
    private final class SourceWatch: ThisMacWatch {
        private let source: DispatchSourceFileSystemObject

        init(_ source: DispatchSourceFileSystemObject) {
            self.source = source
        }

        func cancel() { source.cancel() }
    }
}

/// The app's this-Mac checks (#883): one out at a time, a check asked for
/// while one is out runs once more when that one ends, and a check that
/// began before the trust was dropped applies nothing. What it finds is
/// kept as the remotes whose server is this Mac's own, whose processes it
/// watches: a pid's exit ends that remote's trust at once, so a window's
/// elevated handlers never outlive the server they were given for.
@MainActor
@Observable
final class ThisMacChecks {
    /// The remotes whose server the last check verified, by remote id: what
    /// a window's place, its Recents and its ledger read.
    private(set) var servers = ThisMacServers()

    /// The remotes saved now, and each one's token, read when a check's
    /// answer applies, so a remote added or edited meanwhile is matched as
    /// it is now. `AppModel` sets these; the tests answer with their own.
    @ObservationIgnored var remotes: () -> [Remote] = { [] }
    @ObservationIgnored var token: (UUID) -> String? = { _ in nil }

    @ObservationIgnored private let world: any ThisMacCheckWorld
    /// The check that is out, if one is.
    @ObservationIgnored private var running: Task<Void, Never>?
    /// A check asked for while one was out: it runs once more when that one
    /// ends, since what it was asked for may have changed meanwhile.
    @ObservationIgnored private var pending = false
    /// How many times the trust was dropped: a check that began before one
    /// names mounts that are gone, and its answer is dropped with it.
    @ObservationIgnored private(set) var generation = 0
    /// The verified servers' processes, by remote id.
    @ObservationIgnored private var processes: [String: any ThisMacWatch] = [:]
    /// The runtime directory, and the info files it held when it was last
    /// read.
    @ObservationIgnored private var runtime: (any ThisMacWatch)?
    @ObservationIgnored private var infoFiles: [String: Date] = [:]
    /// The write in the runtime directory that is waiting for its fellows.
    @ObservationIgnored private var debouncing: Task<Void, Never>?
    /// Verified mismatched pids already sent `SIGTERM`, so back-to-back scans
    /// while the server is shutting down do not signal the same pid repeatedly.
    @ObservationIgnored private var signaledMismatches: Set<Int32> = []

    /// `world` is the app's own unless a test passes a fake.
    init(world: (any ThisMacCheckWorld)? = nil) {
        self.world = world ?? SystemThisMacCheckWorld()
    }

    // MARK: Checking

    /// Checks this Mac's servers again (#883): the info files `ganymede
    /// serve` writes and the processes behind them, off the main thread,
    /// since reading the bundled tool's version runs it. Runs at app start,
    /// when a mount connects, when a machine that was offline answers again,
    /// and when a window appears.
    func refresh() {
        guard running == nil else {
            pending = true
            return
        }
        pending = false
        let generation = generation
        running = Task { [weak self, world] in
            let found = await world.scan()
            guard let self else { return }
            self.finished(found, generation: generation)
        }
    }

    /// A check made here and now, on the caller's thread (#883): a window
    /// makes one before its first load, so the page it loads is this Mac's
    /// own place when the check finds that, rather than a machine's a later
    /// check makes again. Its answer applies at once, and a check that is
    /// out is dropped, this one being newer; nothing else of the single
    /// flight changes, since that check still ends and a check asked for
    /// meanwhile still runs once more.
    func checkNow() {
        generation += 1
        apply(world.scanNow())
    }

    /// Waits for the check that is out, and any it runs again: for the
    /// tests, since a check runs off the main thread.
    func waitForChecks() async {
        while let running {
            await running.value
        }
    }

    /// What a check found (#883, #912, #887), on the main actor: the remotes
    /// whose server it verified, the failure reason of any loopback remote
    /// that didn't, the processes whose exit ends a remote's trust, and any
    /// verified version-mismatched background server to restart.
    private func finished(_ found: ThisMacScanResult, generation: Int) {
        running = nil
        // A check that began before the trust was dropped names mounts that
        // are gone: it applies nothing. A check asked for meanwhile still
        // runs (`stopTrust` clears that, `checkNow` doesn't).
        if generation == self.generation { apply(found) }
        guard pending else { return }
        pending = false
        refresh()
    }

    /// Applies what a check found: the runtime directory is watched, any
    /// verified background server of another version is sent `SIGTERM` so
    /// launchd restarts it from the updated binary (#912), and a new set of
    /// verified servers is watched from scratch, so an old pid's exit can't
    /// end a new server's trust.
    private func apply(_ found: ThisMacScanResult) {
        watchRuntimeDirectory()
        restartMismatched(found.mismatched)
        let servers = ThisMacServers(scan: found, remotes: remotes(), token: token)
        if servers != self.servers {
            self.servers = servers
            watchProcesses()
        }
    }

    /// Signals verified bundled helpers whose version differs from the app's
    /// (#912) when the LaunchAgent is enabled, so launchd restarts them from
    /// the updated binary. Only pids that `ThisMacVerifier` matched to the
    /// bundled helper's path, signature and loopback listener reach this list.
    private func restartMismatched(_ mismatched: [ThisMacServer]) {
        let current = Set(mismatched.map(\.pid))
        signaledMismatches.formIntersection(current)
        guard world.isBackgroundServerEnabled else { return }
        for server in mismatched where server.pid > 0 && !signaledMismatches.contains(server.pid) {
            signaledMismatches.insert(server.pid)
            world.terminate(pid: server.pid)
        }
    }

    // MARK: Trust

    /// A verified server's process ended (#883): what it served isn't this
    /// Mac's own any more, so its windows are machines' from now on, and
    /// the runtime directory is read again for a server that took its place.
    func processExited(id: String, pid: Int32) {
        guard servers.server(id)?.pid == pid else { return }
        servers = servers.removing(id)
        watchProcesses()
        refresh()
    }

    /// A remote's server isn't the one the check verified any more (#883):
    /// it was saved with another address or token, which is another server
    /// the app would send its token to. Its trust goes before the mount is
    /// made again, so nothing answers for the server that is gone.
    func forget(_ id: String) {
        guard servers.server(id) != nil || servers.failure(for: .machine(id)) != nil else { return }
        servers = servers.removing(id)
        watchProcesses()
    }

    /// The app's server stopped, so nothing is mounted and nothing the
    /// check verified is a place any more (#883): the trust goes with the
    /// mounts, as do the watches that kept it, and what a check that is out
    /// finds is dropped. `AppModel` calls this from `stopServer`,
    /// `stopForQuit`, a restart's `start()` and `syncMachines`' no-server
    /// path.
    func stopTrust() {
        if servers != ThisMacServers() { servers = ThisMacServers() }
        generation += 1
        watchProcesses()
        stopRuntimeWatch()
        signaledMismatches.removeAll()
        pending = false
    }

    // MARK: Watching

    /// Watches the verified servers' processes (#883), each from scratch.
    private func watchProcesses() {
        for watch in processes.values { watch.cancel() }
        processes.removeAll()
        for (id, server) in servers.byID where server.pid > 0 {
            processes[id] = world.watch(pid: server.pid) { [weak self] in
                self?.processExited(id: id, pid: server.pid)
            }
        }
    }

    /// Watches the Jupyter runtime directory (#883): a server that starts
    /// or stops writes or removes its info file there, so the check reads
    /// it again rather than waiting for a window to.
    private func watchRuntimeDirectory() {
        guard runtime == nil else { return }
        infoFiles = world.infoFileDates()
        runtime = world.watchRuntimeDirectory { [weak self] in self?.runtimeChanged() }
    }

    /// A write in the runtime directory: after the writes that come with it
    /// (a file written, then renamed into place), a check — when the
    /// `jpserver-*.json` files or their dates changed. A kernel's own
    /// `kernel-*.json` write is no change, so a kernel running sends none.
    private func runtimeChanged() {
        debouncing?.cancel()
        debouncing = Task { [weak self, world] in
            try? await Task.sleep(for: world.debounce)
            guard !Task.isCancelled, let self else { return }
            let dates = world.infoFileDates()
            guard dates != self.infoFiles else { return }
            self.infoFiles = dates
            self.refresh()
        }
    }

    private func stopRuntimeWatch() {
        runtime?.cancel()
        runtime = nil
        infoFiles = [:]
        debouncing?.cancel()
        debouncing = nil
    }
}
#endif
