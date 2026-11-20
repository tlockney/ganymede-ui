import Foundation
import Observation
import WebKit

/// What a window's page shows, and the commands it runs: the native
/// toolbar and menus read `state` and call `run` (#205).
@MainActor
@Observable
final class PageModel {
    private(set) var state = PageState()
    @ObservationIgnored weak var webView: WKWebView? {
        didSet { flush() }
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

    /// Views that want the kernels' memory (#241).
    @ObservationIgnored private var memoryWatch = MemoryWatch()

    func update(_ state: PageState) {
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
