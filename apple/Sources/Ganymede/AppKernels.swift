import DeviceBridge
import WebKit

/// The kernels the app runs itself, as kernels of its own server
/// (ganymede#266): cdp-kernel's TypeScript kernel in a hidden web view
/// (`kernel.html`, `src/kernel-host.ts`), registered with the embedded
/// server, which starts, messages and stops them like any kernel. The
/// notebook page reaches them through the server's ordinary API, so the
/// execute endpoint, kernel lifetime and the kernel list cover them too.
///
/// One kernel web view serves the whole app: kernels belong to the server,
/// not to a window, so they outlive a window's reload. Only this web view
/// registers ganymede-device's full `device` handler, so nothing a notebook
/// page renders can reach it.
///
/// Messages cross as Jupyter JSON strings. Each start gets a run number,
/// which the kernel page puts on everything it sends: a restart reuses the
/// kernel id, and a late message from the run before must not reach the
/// new one.
@MainActor
final class AppKernels: NSObject {
    static let shared = AppKernels()

    static let hostHandler = "kernelHost"

    /// The kernelspec the app registers: the TypeScript kernel the notebook
    /// page used to run itself, under the same name. Interrupts go over the
    /// control channel, which the server sets for every registered kernel.
    static let spec: [String: Any] = [
        "name": "cdp-browser",
        "display_name": "TypeScript (cdp-kernel, in app)",
        "language": "typescript",
        "argv": [] as [String],
        "metadata": ["capabilities": ["device": true]],
    ]

    let webView: WKWebView
    /// ganymede-device's `device` handler, for cells.
    private let device: DeviceBridge
    private let folders: FolderGrants
    /// The permission ledger's prompt (#383); the bridge holds it weakly.
    let prompter: AppLedgerPrompter
    /// The notebook pages that can hold the kernel web view: WebKit
    /// suspends a web view in no window, so it lives in one of theirs.
    private var hosts: [WeakView] = []
    /// The server the kernel page loads from. Its token stays off the
    /// page's URL (`kernelPageURL`).
    private var serverURL: URL?
    private var loaded = false
    private var ready = false
    /// Messages for the kernel page sent before it said it was ready.
    private var pending: [[String: Any]] = []

    private struct Run {
        /// What the kernel page tags this run's messages with.
        let number: Int
        let server: RegisteredKernels
        /// The server's own number for this run, given on its thread, so
        /// a late message is refused there even before `.stop` reaches
        /// the main thread.
        let serverRun: Int
    }
    /// The run each running kernel is on, by kernel id.
    private var runs: [String: Run] = [:]
    private var lastRun = 0

    /// What notebook paths in `launch` are under when relative: the app
    /// server's root folder. The ledger keeps each notebook by absolute path.
    var notebookRoot: URL?
    /// Each kernel's notebook, as an absolute path, and its `device` owner
    /// in the kernel page. The bridge needs both to know whose call is whose.
    private var notebooks: [String: String] = [:]
    private var owners: [String: Int] = [:]

    /// `device` is the bridge cells reach (the system's when nil); tests
    /// pass one with a fake presenter, `prompts`, a presenter for the
    /// ledger's prompts, and `folders`, the grants that bridge was given.
    init(device: DeviceBridge? = nil, prompts: DialogPresenter? = nil, folders: FolderGrants? = nil) {
        let config = WKWebViewConfiguration()
        // Not on screen, but cells must keep running at full speed.
        config.preferences.inactiveSchedulingPolicy = .none
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        let folders = folders ?? FolderGrants()
        self.folders = folders
        self.device = device ?? KernelHost.systemBridge(folders: folders)
        prompter = AppLedgerPrompter(presenter: prompts, host: { nil })
        super.init()
        prompter.host = { [weak self] in self?.liveHost() }
        if self.device.ledgerPrompter == nil {
            self.device.ledgerPrompter = prompter
        }
        config.userContentController.add(KernelPageHandler(self), name: Self.hostHandler)
        // Here and nowhere else, so nothing a notebook page renders can
        // call it.
        self.device.register(in: config.userContentController)
        webView.navigationDelegate = self
        webView.isInspectable = true
        #if os(macOS)
        webView.alphaValue = 0
        #else
        webView.alpha = 0
        webView.isUserInteractionEnabled = false
        #endif
    }

    /// Registers the app's kernel with `server`, before its page loads.
    /// A server started on another port has another origin, so the kernel
    /// page loads again from it at the next start.
    func serve(_ server: ServerHost) throws {
        if let serverURL, serverURL.host != server.url.host || serverURL.port != server.url.port {
            unload()
        }
        serverURL = server.url
        try server.register(spec: Self.spec) { [weak self] event, kernels in
            // In order: the server's calls for one kernel come in order,
            // and the main queue keeps it.
            DispatchQueue.main.async {
                MainActor.assumeIsolated { self?.handle(event, from: kernels) }
            }
        }
    }

    /// `ui`, a notebook page, can hold the kernel web view.
    func lend(_ ui: WKWebView) {
        hosts.removeAll { $0.view == nil || $0.view === ui }
        hosts.append(WeakView(view: ui))
        if webView.window == nil { ui.addSubview(webView) }
    }

    /// The last notebook page lent that is still in a window, or any left.
    private func liveHost() -> WKWebView? {
        hosts.removeAll { $0.view == nil }
        return hosts.last { $0.view?.window != nil }?.view ?? hosts.last?.view
    }

    /// Back in a window if the one it was in closed.
    private func keepInWindow() {
        guard webView.window == nil, let host = liveHost(), host !== webView.superview else { return }
        host.addSubview(webView)
    }

    func handle(_ event: KernelEvent, from server: RegisteredKernels) {
        switch event {
        case .start(let kernel, let serverRun, let launch):
            lastRun += 1
            runs[kernel] = Run(number: lastRun, server: server, serverRun: serverRun)
            notebooks[kernel] = Self.notebook(in: launch).map(resolve)
            tellBridge(kernel)
            var start: [String: Any] = ["kernel": kernel, "op": "start", "run": lastRun]
            start["params"] = Self.params(in: launch)
            toPage(start)
        case .send(let kernel, let channel, let message):
            guard runs[kernel]?.server === server else { return }
            toPage(["kernel": kernel, "op": "send", "channel": channel, "json": message])
        case .stop(let kernel):
            guard runs[kernel]?.server === server else { return }
            runs[kernel] = nil
            notebooks[kernel] = nil
            owners[kernel] = nil
            toPage(["kernel": kernel, "op": "stop"])
        }
    }

    /// `env.JPY_SESSION_NAME` in a start's launch JSON: the notebook's path.
    nonisolated static func notebook(in launch: String) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: Data(launch.utf8)) as? [String: Any],
              let env = object["env"] as? [String: Any],
              let path = env["JPY_SESSION_NAME"] as? String, !path.isEmpty
        else { return nil }
        return path
    }

    /// `env.GANYMEDE_PARAMS` in a start's launch JSON: the run's
    /// parameters, as a JSON object's text, for `jupyter.params`
    /// (ganymede#652). The server sets it for every run it starts with
    /// parameters; nil when absent or empty.
    nonisolated static func params(in launch: String) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: Data(launch.utf8)) as? [String: Any],
              let env = object["env"] as? [String: Any],
              let params = env["GANYMEDE_PARAMS"] as? String, !params.isEmpty
        else { return nil }
        return params
    }

    private func toPage(_ message: [String: Any]) {
        keepInWindow()
        if !loaded, let url = serverURL {
            loaded = true
            webView.load(URLRequest(url: Self.kernelPageURL(url)))
        }
        if ready {
            deliver(message)
        } else {
            pending.append(message)
        }
    }

    private func deliver(_ message: [String: Any]) {
        webView.callAsyncJavaScript(
            "window.ganymedeKernelHost?.deliver(m)", arguments: ["m": message], in: nil, in: .page)
    }

    /// kernel.html on the server, with no query. The page makes no API
    /// calls (its messages go through here), and the server serves static
    /// files without the token. With the token, the notebook page's
    /// service worker, which controls this origin too, found no precached
    /// match and answered with the notebook app instead (#518).
    nonisolated static func kernelPageURL(_ server: URL) -> URL {
        guard var parts = URLComponents(url: server, resolvingAgainstBaseURL: false) else { return server }
        parts.path = "/kernel.html"
        parts.query = nil
        parts.fragment = nil
        return parts.url ?? server
    }

    fileprivate func received(_ message: WKScriptMessage) {
        guard message.webView === webView, message.frameInfo.isMainFrame,
              let serverURL,
              message.frameInfo.securityOrigin.host == serverURL.host,
              message.frameInfo.securityOrigin.port == serverURL.port ?? 0,
              let body = message.body as? [String: Any]
        else { return }
        switch body["op"] as? String {
        case "ready":
            ready = true
            for message in pending { deliver(message) }
            pending = []
        case "owner":
            if let kernel = body["kernel"] as? String, let owner = body["owner"] as? Int {
                owners[kernel] = owner
                tellBridge(kernel)
            }
        case "message":
            guard let kernel = body["kernel"] as? String, let run = current(kernel, body),
                  let channel = body["channel"] as? String, let json = body["json"] as? String
            else { return }
            run.server.deliver(kernel, run: run.serverRun, channel: channel, message: json)
        case "closed":
            // Ended without the server asking (cdp-kernel ends a kernel
            // only on a shutdown_request, so not today): a crash, which
            // counts toward the restart limit.
            guard let kernel = body["kernel"] as? String, let run = current(kernel, body) else { return }
            runs[kernel] = nil
            owners[kernel] = nil
            run.server.ended(kernel, run: run.serverRun, reason: "exited")
        default:
            break
        }
    }

    /// The run `body` names, if it is still kernel `kernel`'s.
    private func current(_ kernel: String, _ body: [String: Any]) -> Run? {
        guard let run = runs[kernel], body["run"] as? Int == run.number else { return nil }
        return run
    }

    /// The kernel page's process died, and every kernel in it: iOS ends it
    /// under memory pressure, more so with a Pyodide heap, and a suspended
    /// app's soon after (#293). The server restarts each without counting
    /// a crash (`reason` other than `lost` counts one); the restart loads a
    /// new kernel page.
    func kernelPageEnded(reason: String = "lost") {
        device.dropPage()
        let lost = runs
        runs = [:]
        owners = [:]
        loaded = false
        ready = false
        pending = []
        for (kernel, run) in lost.sorted(by: { $0.key < $1.key }) {
            run.server.ended(kernel, run: run.serverRun, reason: reason)
        }
    }

    /// The kernel page goes, with any kernels left in it (none once their
    /// server stopped them).
    private func unload() {
        guard loaded else { return }
        loaded = false
        ready = false
        pending = []
        webView.load(URLRequest(url: URL(string: "about:blank")!))
    }

    /// A file or folder moved: every notebook at or under `old` follows,
    /// in the bridge and in what each kernel runs.
    func moved(from old: String, to new: String) {
        guard old != new else { return }
        let rename: (String) -> String? = { path in
            if path == old { return new }
            if path.hasPrefix(old + "/") { return new + path.dropFirst(old.count) }
            return nil
        }
        let paths = Set(device.ledger.grants.map(\.notebook))
            .union(folders.grants.map(\.notebook))
            .union(notebooks.values)
        for path in paths.sorted() {
            if let to = rename(path) { device.notebookMoved(from: path, to: to) }
        }
        notebooks = notebooks.mapValues { rename($0) ?? $0 }
    }

    /// A notebook path from the server as the ledger keeps it.
    private func resolve(_ path: String) -> String {
        Self.resolve(path, under: notebookRoot)
    }

    /// `path` under `root` as the ledger keeps it: joined to `root` when
    /// relative, and moved back onto `root` when it is under `root`'s
    /// canonical path. The server canonicalizes its root, and on iOS the
    /// Documents folder's `/var` is a link to `/private/var`, while the
    /// page's renames and declarations are joined to `root` as given.
    nonisolated static func resolve(_ path: String, under root: URL?) -> String {
        guard let root else { return path }
        guard path.hasPrefix("/") else {
            return root.appendingPathComponent(path).standardizedFileURL.path
        }
        let given = root.standardizedFileURL.path
        let canonical = canonicalPath(root)
        guard canonical != given else { return path }
        if path == canonical { return given }
        if path.hasPrefix(canonical + "/") { return given + path.dropFirst(canonical.count) }
        return path
    }

    /// `url`'s path with every link resolved, as the server's root is.
    /// Not `resolvingSymlinksInPath`, which drops a leading `/private`.
    nonisolated static func canonicalPath(_ url: URL) -> String {
        url.withUnsafeFileSystemRepresentation { path in
            guard let path, let real = realpath(path, nil) else { return nil }
            defer { free(real) }
            return String(cString: real)
        } ?? url.standardizedFileURL.path
    }

    /// Once a kernel's notebook and owner are both known, the bridge
    /// learns which notebook its calls come from.
    private func tellBridge(_ kernel: String) {
        guard let owner = owners[kernel] else { return }
        device.setNotebook(notebooks[kernel], for: owner)
    }
}

extension AppKernels: WKNavigationDelegate {
    /// The kernel page is going away (a reload, another server): its
    /// device calls can no longer be answered, and the new page's call ids
    /// start over.
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        device.dropPage()
        owners = [:]
    }

    /// Again at commit: the old page ran until now, and a call it made
    /// after the navigation started would otherwise outlive it.
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        device.dropPage()
        owners = [:]
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        kernelPageEnded()
    }

    /// The kernel page didn't load (the server stopped answering, say):
    /// its kernels can't start, which the server counts as failed starts,
    /// so the next start loads the page again and the restart limit ends
    /// a server that never serves it. One navigation replacing another
    /// (`unload`) is not a failure.
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        loadFailed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        loadFailed(error)
    }

    private func loadFailed(_ error: Error) {
        let error = error as NSError
        guard loaded, !ready, !(error.domain == NSURLErrorDomain && error.code == NSURLErrorCancelled) else { return }
        kernelPageEnded(reason: "failed")
    }
}

private struct WeakView {
    weak var view: WKWebView?
}

/// WKUserContentController keeps its handlers alive; this keeps the
/// kernels from keeping themselves alive through them.
@MainActor
private final class KernelPageHandler: NSObject, WKScriptMessageHandler {
    weak var kernels: AppKernels?

    init(_ kernels: AppKernels) {
        self.kernels = kernels
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        kernels?.received(message)
    }
}
