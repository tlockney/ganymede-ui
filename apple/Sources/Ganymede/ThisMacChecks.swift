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

/// What a this-Mac check asks of the world (#883), behind a protocol so
/// the tests answer with no info files, processes or folders: the servers
/// that verify, a pid's exit, and the runtime directory's writes.
@MainActor
protocol ThisMacCheckWorld {
    /// The servers that verify, read off the main thread, since reading
    /// the bundled tool's version runs it.
    func servers() async -> [ThisMacServer]
    /// The servers that verify, here and now: a window runs this before
    /// its first load, and its answer must be there before the page is.
    func serversNow() -> [ThisMacServer]
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
}

/// The system's answers (#883): `ThisMacVerifier` for the files and the
/// processes behind them, a dispatch process source per verified pid, and
/// a file system source on the runtime directory.
@MainActor
final class SystemThisMacCheckWorld: ThisMacCheckWorld {
    private let verifier: ThisMacVerifier
    private let directory: URL

    init(verifier: ThisMacVerifier = ThisMacVerifier(), directory: URL = AppMCP.runtimeDirectory()) {
        self.verifier = verifier
        self.directory = directory
    }

    func servers() async -> [ThisMacServer] {
        let verifier = verifier
        let directory = directory
        return await Task.detached(priority: .utility) { verifier.servers(in: directory) }.value
    }

    func serversNow() -> [ThisMacServer] { verifier.servers(in: directory) }

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

    /// `world` is the app's own unless a test passes a fake.
    init(world: (any ThisMacCheckWorld)? = nil) {
        self.world = world ?? SystemThisMacCheckWorld()
    }

    // MARK: Checking

    /// Checks this Mac's servers again (#883): the info files `ganymede
    /// serve` writes and the processes behind them, off the main thread,
    /// since reading the bundled tool's version runs it. Runs when a mount
    /// connects, when a machine that was offline answers again, and when a
    /// window appears.
    func refresh() {
        guard running == nil else {
            pending = true
            return
        }
        pending = false
        let generation = generation
        running = Task { [weak self, world] in
            let found = await world.servers()
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
        apply(world.serversNow())
    }

    /// Waits for the check that is out, and any it runs again: for the
    /// tests, since a check runs off the main thread.
    func waitForChecks() async {
        while let running {
            await running.value
        }
    }

    /// What a check found (#883), on the main actor: the remotes whose
    /// server it verified, each with the info file it was verified by, and
    /// the processes whose exit ends a remote's trust.
    private func finished(_ found: [ThisMacServer], generation: Int) {
        running = nil
        // A check that began before the trust was dropped names mounts that
        // are gone: it applies nothing. A check asked for meanwhile still
        // runs (`stopTrust` clears that, `checkNow` doesn't).
        if generation == self.generation { apply(found) }
        guard pending else { return }
        pending = false
        refresh()
    }

    /// Applies what a check found: the runtime directory is watched, and a
    /// new set of servers is watched from scratch, so an old pid's exit
    /// can't end a new server's trust.
    private func apply(_ found: [ThisMacServer]) {
        watchRuntimeDirectory()
        let servers = ThisMacServers(found, remotes: remotes(), token: token)
        if servers != self.servers {
            self.servers = servers
            watchProcesses()
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
        guard servers.server(id) != nil else { return }
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
        if !servers.isEmpty { servers = ThisMacServers() }
        generation += 1
        watchProcesses()
        stopRuntimeWatch()
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
