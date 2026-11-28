import Foundation
import Observation
import WebKit

/// What a window's page shows, and the commands it runs: the native
/// toolbar and menus read `state` and call `run` (#205).
@MainActor
@Observable
final class PageModel {
    /// Every page model currently attached to a `WKWebView`.
    static let attachedPages = NSHashTable<PageModel>.weakObjects()
    #if os(iOS)
    /// Active scenes' page models, checked before restarting the local kernel
    /// server (#808).
    static var openPages: [PageModel] { attachedPages.allObjects }
    #endif

    private(set) var state = PageState()
    @ObservationIgnored weak var webView: WKWebView? {
        didSet {
            if webView != nil { Self.attachedPages.add(self) }
            flush()
        }
    }

    var notebookDisplayName: String {
        if let path = state.path, !path.isEmpty {
            return path.split(separator: "/").last.map(String.init) ?? path
        }
        return state.title ?? "the notebook"
    }
    /// Whether the page has posted its state with a backend, so its
    /// commands and calls are ready.
    private(set) var ready = false
    /// The server start the page must have been loaded for (#640): the
    /// app's loads are numbered by `AppModel.serverStart`, and a restart
    /// raises this to `AppModel.startsRequested` (`reset(forStart:)`), and
    /// until the app's load for that start commits, a state the old page
    /// still posts makes nothing ready: on the iPhone the parked old page
    /// keeps running, and a load for the old server already under way may
    /// commit after the restart.
    @ObservationIgnored private var awaitedStart = 0
    /// The start the committed page was loaded for.
    @ObservationIgnored private var pageStart = 0
    /// The app's load that hasn't committed yet: its navigation and start.
    @ObservationIgnored private var started: (token: AnyObject, start: Int)?
    /// Commands run before then: the iPhone's list can be tapped while the
    /// page is still loading (#209).
    @ObservationIgnored private var pending: [String] = []
    /// How many commands wait for the page (for tests).
    var pendingCount: Int { pending.count }

    /// Views that want the kernels' memory (#241).
    @ObservationIgnored private var memoryWatch = MemoryWatch()
    /// Number of views currently watching memory (for tests).
    var memoryWatchers: Int { memoryWatch.watchers }

    func update(_ state: PageState) {
        // After `forgetPage` until the new page's load commits: a page the
        // scene has dropped may still post.
        guard pageStart >= 0 else { return }
        if state != self.state { self.state = state }
        // Ready once it is connected: before that, `open` and
        // `new-notebook` have no backend to act on.
        if !ready, pageStart >= awaitedStart, state.backend != nil {
            ready = true
            // A page loaded again starts without being asked.
            if let arg = memoryWatch.onReload, !pending.contains(PageCommand.script("watch-memory", arg: arg)) {
                pending.append(PageCommand.script("watch-memory", arg: arg))
            }
            flush()
        }
    }

    /// The Running list or kernel popover shows (or goes): the page reads
    /// each kernel's memory while any of them shows (#241).
    func watchMemory(_ watching: Bool) {
        if let arg = memoryWatch.change(watching: watching) { run("watch-memory", arg: arg) }
    }

    /// Runs one of the page's commands (`PageCommand`), once the page is
    /// ready for them.
    func run(_ id: String, arg: String? = nil) {
        pending.append(PageCommand.script(id, arg: arg))
        flush()
    }

    /// Asks the page to list the server's kernels again (#350); nothing
    /// while it is loading, as a new page lists them itself.
    func refreshKernels() {
        guard ready else { return }
        run("refresh-kernels")
    }

    /// The server restarted: only a page the app loads for `start` or
    /// later counts. Called in any order with that page's load and commit,
    /// and more than once for the same start.
    func reset(forStart start: Int) {
        ready = false
        awaitedStart = max(awaitedStart, start)
    }

    /// The scene shows another place's page (#758): the old page's state,
    /// queued commands and load are forgotten, and nothing counts as ready
    /// until the app's own load of the new page commits (`pageStart` is below
    /// every start until then), so what a page of the old place posts
    /// meanwhile makes nothing ready. The views watching memory stay: the
    /// next page is told on its first state. The caller drops the old
    /// page's web view, and calls this before it loads the new page.
    func forgetPage() {
        state = PageState()
        ready = false
        pending = []
        started = nil
        pageStart = -1
    }

    /// The app started loading its page for server start `start`;
    /// `token` is the navigation.
    func loadStarted(_ token: AnyObject?, start: Int) {
        started = token.map { ($0, start) }
    }

    /// Runs `load` and tells `page`, if there is one, its navigation. A
    /// machine's window has no page, and its page loads all the same: as
    /// `page?.loadStarted(load(), …)`, optional chaining would skip `load`.
    static func startLoad(_ load: () -> AnyObject?, on page: PageModel?, start: Int) {
        let token = load()
        page?.loadStarted(token, start: start)
    }

    /// A page committed, so commands wait for its state. The app's own
    /// load (`token` from `loadStarted`) sets the page's start; any other
    /// navigation (a reload, a link) keeps the page's start as it was.
    func committed(_ token: AnyObject?) {
        ready = false
        if let token, let load = started, load.token === token {
            pageStart = load.start
            started = nil
        }
    }

    /// A navigation failed before it committed. True when it was the app's
    /// own load (another navigation, such as the old page reloading, can
    /// cancel it), which the caller loads again.
    func loadFailed(_ token: AnyObject?) -> Bool {
        guard let token, let load = started, load.token === token else { return false }
        started = nil
        return true
    }

    /// The web content process terminated; future commands wait until the
    /// reloaded page becomes ready again (#808).
    func webContentProcessDidTerminate() {
        ready = false
        started = nil
    }

    /// Saves the open notebook through `window.ganymede.save()` (#808).
    /// When the page isn't ready, reports `.saved` if nothing is known dirty
    /// and `.failed` if unsaved edits are recorded.
    @MainActor
    func save(timeout: Duration = .seconds(15)) async -> SwitchSaveOutcome {
        guard ready, let webView else {
            return state.dirty ? .failed : .saved
        }
        return await SwitchSaveCoordinator.raceSave(timeout: timeout) {
            await withCheckedContinuation { done in
                webView.callAsyncJavaScript(
                    "return window.ganymede ? await window.ganymede.save() : true",
                    arguments: [:],
                    in: nil,
                    in: .page
                ) { result in
                    switch result {
                    case .success(let value): done.resume(returning: value as? Bool ?? false)
                    case .failure: done.resume(returning: false)
                    }
                }
            }
        }
    }

    /// Triggers downloading a copy of the open notebook (`download` command)
    /// and waits for the share sheet or save panel to dismiss (#808).
    @MainActor
    func downloadCopy() async {
        guard ready, let webView else { return }
        await DownloadWaiter.triggerDownload(in: webView)
    }

    enum CallError: LocalizedError {
        case notReady

        var errorDescription: String? { "The notebook page hasn't loaded." }
    }

    /// One of the page's calls (`window.ganymede.call`, #210), with its
    /// answer as JSON values. Throws when the page isn't ready, or with the
    /// page's error.
    @MainActor
    func call(_ id: String, arg: String? = nil) async throws -> Any? {
        guard ready, let webView else { throw CallError.notReady }
        // The completion-handler form: the async one traps on a null answer.
        return try await withCheckedThrowingContinuation { done in
            webView.callAsyncJavaScript(
                "return await window.ganymede.call(id, arg ?? undefined)",
                arguments: ["id": id, "arg": arg ?? NSNull()],
                in: nil,
                in: .page
            ) { result in
                switch result {
                case .success(let value): done.resume(returning: value)
                case .failure(let error): done.resume(throwing: error)
                }
            }
        }
    }

    private func flush() {
        guard ready, let webView, !pending.isEmpty else { return }
        let scripts = pending
        pending = []
        for script in scripts {
            webView.evaluateJavaScript(script, completionHandler: nil)
        }
    }
}

/// Which page a web view has loaded, for which server start
/// (`AppModel.serverStart`), and whether a load that failed before it
/// committed was started again (#640).
struct PageLoads {
    private(set) var url: URL?
    private(set) var start: Int?
    private var retried = false

    /// Whether to load `url` for `start`: when the URL changed, or the
    /// server restarted even on the same URL. Records it if so.
    mutating func shouldLoad(_ url: URL, start: Int) -> Bool {
        guard url != self.url || start != self.start else { return false }
        self.url = url
        self.start = start
        retried = false
        return true
    }

    /// The app's load failed before it committed: the load to start
    /// again, or nil. `cancelled`: another navigation took its place,
    /// which happens only as often as something navigates, so it is
    /// always started again; any other failure once (a server that
    /// doesn't answer isn't asked forever).
    mutating func retry(cancelled: Bool = false) -> (url: URL, start: Int)? {
        guard let url, let start else { return nil }
        if cancelled { return (url, start) }
        guard !retried else { return nil }
        retried = true
        return (url, start)
    }

    /// The server stopped: the next `shouldLoad` loads.
    mutating func forget() {
        url = nil
        start = nil
    }
}

/// Coordinates waiting for a `WKDownload` (and any iOS share sheet or macOS
/// save panel) triggered by `PageModel.downloadCopy()` (#808).
@MainActor
protocol DownloadTracking: AnyObject {
    func runTrackedDownload(_ trigger: @MainActor () async -> Bool) async
}

/// Tracks a `WKDownload` started by `command('download')` until the user
/// finishes or cancels (#808).
@MainActor
final class DownloadWaiter {
    static func triggerDownload(in webView: WKWebView) async {
        let trigger: @MainActor () async -> Bool = {
            await withCheckedContinuation { done in
                webView.callAsyncJavaScript(
                    "return window.ganymede ? await window.ganymede.command('download') : false",
                    arguments: [:],
                    in: nil,
                    in: .page
                ) { result in
                    switch result {
                    case .success(let value): done.resume(returning: value as? Bool ?? false)
                    case .failure: done.resume(returning: false)
                    }
                }
            }
        }
        if let tracker = webView.navigationDelegate as? (any DownloadTracking) {
            await tracker.runTrackedDownload(trigger)
        } else {
            _ = await trigger()
        }
    }

    private var active: Set<ObjectIdentifier> = []
    private var started = false
    private var continuation: CheckedContinuation<Void, Never>?

    func track(_ download: WKDownload) {
        started = true
        active.insert(ObjectIdentifier(download))
    }

    func finish(_ id: ObjectIdentifier) {
        active.remove(id)
        if started, active.isEmpty { resume() }
    }

    private func resume() {
        let cont = continuation
        continuation = nil
        cont?.resume()
    }

    func wait(triggered: Bool) async {
        guard triggered else { return }
        await withTaskGroup(of: Void.self) { group in
            group.addTask { @MainActor [self] in
                if self.started, self.active.isEmpty { return }
                await withCheckedContinuation { cont in
                    if self.started, self.active.isEmpty {
                        cont.resume()
                    } else {
                        self.continuation = cont
                    }
                }
            }
            group.addTask {
                try? await Task.sleep(for: .seconds(3))
                await MainActor.run { [weak self] in
                    guard let self, !self.started else { return }
                    self.resume()
                }
            }
            await group.next()
            group.cancelAll()
        }
    }
}
