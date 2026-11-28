import DeviceBridge
import WebKit
#if os(macOS)
import AppKit
#else
import UIKit
#endif

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

    /// The in-app kernel's name: it runs in this app whichever server the
    /// other kernels run on (the header's "Runs on", #812).
    nonisolated static let inAppKernelName = "cdp-browser"

    /// The kernelspec the app registers: the TypeScript kernel the notebook
    /// page used to run itself, under the same name. Interrupts go over the
    /// control channel, which the server sets for every registered kernel.
    static let spec: [String: Any] = [
        "name": inAppKernelName,
        "display_name": "TypeScript (cdp-kernel, in app)",
        "language": "typescript",
        "argv": [] as [String],
        "metadata": ["capabilities": ["device": true]],
    ]

    /// Display-only kernelspec fields sent over the background server's
    /// kernel provider socket (#941): omits `argv` and `env`.
    nonisolated static let providerSpec: [String: Any] = [
        "name": inAppKernelName,
        "display_name": "TypeScript (cdp-kernel, in app)",
        "language": "typescript",
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
        let server: any KernelSink
        /// The server's own number for this run, given on its thread, so
        /// a late message is refused there even before `.stop` reaches
        /// the main thread.
        let serverRun: Int
    }
    /// The run each running kernel is on, by kernel id.
    private var runs: [String: Run] = [:]
    private var lastRun = 0
    /// How many recent `lost` endings each kernel can trigger before
    /// `AppKernels` stops restarting it (#469).
    let maxLostRestarts: Int
    /// Window over which `lost` endings count toward `maxLostRestarts`.
    let lostRestartWindow: TimeInterval
    private let now: @MainActor () -> Date
    private var losses: [String: [Date]] = [:]
    /// Called on the main actor when `maxLostRestarts` stops a restart.
    var onLostRestartLimit: ((String) -> Void)?
    #if os(macOS)
    /// Offscreen host window keeping the kernel web view scheduled when all
    /// Mac notebook windows close while kernels remain running (#469).
    private var hostWindow: NSWindow?
    nonisolated(unsafe) private var runningActivity: NSObjectProtocol?
    #endif

    /// What notebook paths in `launch` are under when relative: the app
    /// server's root folder. The ledger keeps each notebook by absolute path.
    var notebookRoot: URL?
    /// Each kernel's notebook, as an absolute path, and its `device` owner
    /// in the kernel page. The bridge needs both to know whose call is whose.
    private var notebooks: [String: String] = [:]
    private var owners: [String: Int] = [:]

    /// The kernel page's data store, apart from the notebook pages' default
    /// one (#557). Fixed, so its cache outlives a launch.
    static let kernelStore = UUID(uuidString: "6A1D3C2E-5B7F-4E81-9C0A-2F4D8B6E1A57")!

    /// `device` is the bridge cells reach (the system's when nil); tests
    /// pass one with a fake presenter, `prompts`, a presenter for the
    /// ledger's prompts, and `folders`, the grants that bridge was given.
    init(
        device: DeviceBridge? = nil,
        prompts: DialogPresenter? = nil,
        folders: FolderGrants? = nil,
        maxLostRestarts: Int = 3,
        lostRestartWindow: TimeInterval = 300,
        now: @escaping @MainActor () -> Date = Date.init
    ) {
        self.maxLostRestarts = maxLostRestarts
        self.lostRestartWindow = lostRestartWindow
        self.now = now
        let config = WKWebViewConfiguration()
        // Not on screen, but cells must keep running at full speed.
        config.preferences.inactiveSchedulingPolicy = .none
        // Its own store, so not the notebook pages' login cookie (#557):
        // cells run on the server's origin, and with the cookie their
        // `fetch` and `WebSocket` could read any file and drive any kernel,
        // whatever the notebook's grant. The page makes no API calls
        // (`kernelPageURL`), and the server serves static files without it.
        // Persistent, so modules cells import stay in its disk cache across
        // launches and offline; the server sets no cookie in it, since the
        // page loads without the token.
        config.websiteDataStore = WKWebsiteDataStore(forIdentifier: Self.kernelStore)
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        let folders = folders ?? FolderGrants()
        self.folders = folders
        self.device = device ?? KernelHost.systemBridge(folders: folders)
        prompter = AppLedgerPrompter(presenter: prompts, host: { nil })
        super.init()
        if self.device.dialogHost == nil {
            self.device.dialogHost = { [weak self] owner in
                self?.host(forOwner: owner)
            }
        }
        prompter.host = { [weak self] in self?.frontHost() }
        prompter.hostForNotebook = { [weak self] notebook in
            self?.host(forKernel: nil, notebook: notebook) ?? self?.frontHost()
        }
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
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowWillClose(_:)),
            name: NSWindow.willCloseNotification,
            object: nil
        )
        #else
        webView.alpha = 0
        webView.isUserInteractionEnabled = false
        #endif
    }

    deinit {
        #if os(macOS)
        NotificationCenter.default.removeObserver(self)
        if let activity = runningActivity {
            ProcessInfo.processInfo.endActivity(activity)
        }
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
        if !pending.isEmpty && !loaded {
            loaded = true
            webView.load(Self.kernelPageRequest(server.url))
        }
    }

    /// `ui`, a notebook page, can hold the kernel web view.
    func lend(_ ui: WKWebView) {
        let existingNotebook = hosts.first(where: { $0.view === ui })?.notebook
        hosts.removeAll { $0.view == nil || $0.view === ui }
        hosts.append(WeakView(view: ui, notebook: existingNotebook))
        #if os(macOS)
        if ui.window != nil {
            if webView.window == nil || webView.window === hostWindow {
                ui.addSubview(webView)
                hostWindow?.orderOut(nil)
            }
        } else if webView.window == nil {
            ui.addSubview(webView)
        }
        #else
        if webView.window == nil { ui.addSubview(webView) }
        #endif
    }

    /// `ui` no longer lends itself (closed, dismantled, or switched to a
    /// remote machine).
    func unlend(_ ui: WKWebView) {
        hosts.removeAll { $0.view == nil || $0.view === ui }
        if webView.superview === ui {
            webView.removeFromSuperview()
        }
        keepInWindow()
    }

    /// Records the resolved notebook path `ui` currently shows, so a kernel's
    /// `device` permission prompts target the window showing its notebook (#469).
    func showing(_ notebook: String?, in ui: WKWebView) {
        for i in hosts.indices where hosts[i].view === ui {
            hosts[i].notebook = notebook
        }
        #if os(macOS)
        if ui.window != nil, webView.window == nil || webView.window === hostWindow {
            keepInWindow()
        }
        #endif
    }

    /// The notebook pages the kernel web view was lent, for the tests: a
    /// machine's window lends nothing (#877).
    var lentPages: [WKWebView] { hosts.compactMap(\.view) }

    /// The last notebook page lent that is still in a live window, or any left.
    private func liveHost() -> WKWebView? {
        hosts.removeAll { $0.view == nil }
        return hosts.last { $0.view.map(isLiveHostView) ?? false }?.view
            ?? hosts.last { $0.view?.window != nil }?.view
            ?? hosts.last?.view
    }

    private func isLiveHostView(_ view: WKWebView) -> Bool {
        guard let window = view.window else { return false }
        #if os(macOS)
        return window.isVisible || window.isMiniaturized
        #else
        return true
        #endif
    }

    /// Back in a window if the one it was in closed. On macOS, falls back to
    /// an invisible offscreen `NSWindow` while kernels stay running so WebKit
    /// does not suspend the kernel web view when all notebook windows close (#469).
    #if os(macOS)
    private func keepInWindow(closing closingWindow: NSWindow? = nil) {
        hosts.removeAll { $0.view == nil }
        let openHosts = Array(hosts.compactMap(\.view).reversed().filter { view in
            guard let window = view.window, window !== closingWindow else { return false }
            return window.isVisible || window.isMiniaturized
        })
        if let host = frontmost(in: openHosts, matchTabSelection: true, windowOf: { $0.window }) {
            if webView.superview !== host { host.addSubview(webView) }
            hostWindow?.orderOut(nil)
            return
        }
        if !runs.isEmpty {
            let window = ensureHostWindow()
            if let content = window.contentView, webView.superview !== content {
                content.addSubview(webView)
            }
            window.orderBack(nil)
            return
        }
        if webView.window === closingWindow {
            webView.removeFromSuperview()
        }
        hostWindow?.orderOut(nil)
    }

    private func ensureHostWindow() -> NSWindow {
        if let hostWindow { return hostWindow }
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1, height: 1),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        window.isReleasedWhenClosed = false
        window.isExcludedFromWindowsMenu = true
        window.isRestorable = false
        window.canHide = false
        window.hidesOnDeactivate = false
        window.ignoresMouseEvents = true
        window.hasShadow = false
        window.isOpaque = false
        window.backgroundColor = .clear
        window.alphaValue = 0
        window.tabbingMode = .disallowed
        window.collectionBehavior = [.stationary, .ignoresCycle, .canJoinAllSpaces]
        hostWindow = window
        return window
    }

    @objc private func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow,
              webView.window === window || hosts.contains(where: { $0.view?.window === window })
        else { return }
        keepInWindow(closing: window)
    }

    private func updateActivity() {
        if runs.isEmpty {
            if let activity = runningActivity {
                ProcessInfo.processInfo.endActivity(activity)
                runningActivity = nil
            }
            if hostWindow?.isVisible == true {
                keepInWindow()
            }
        } else if runningActivity == nil {
            runningActivity = ProcessInfo.processInfo.beginActivity(
                options: .userInitiatedAllowingIdleSystemSleep,
                reason: "Running in-app TypeScript kernels"
            )
        }
    }
    #else
    private func keepInWindow() {
        guard webView.window == nil, let host = frontHost() ?? liveHost(), host !== webView.superview else { return }
        host.addSubview(webView)
    }

    private func updateActivity() {}
    #endif

    /// Resolves the UI web view whose window runs the kernel for `owner`, or
    /// `nil` when no matching notebook page is open (so dialogs fall back to
    /// the active window rather than whichever tab houses `webView`).
    private func host(forOwner owner: Int) -> WKWebView? {
        let kernel = owners.first { $0.value == owner }?.key
        let notebook = kernel.flatMap { notebooks[$0] } ?? device.ledger.notebook(for: owner)
        return host(forKernel: kernel, notebook: notebook)
    }

    /// Finds an open notebook page matching `kernel` or resolved `notebook`.
    private func host(forKernel kernel: String?, notebook: String?) -> WKWebView? {
        hosts.removeAll { $0.view == nil }
        let open = PageModel.attachedPages.allObjects.filter { page in
            guard let view = page.webView, isLiveHostView(view) else { return false }
            return hosts.isEmpty || hosts.contains { $0.view === view }
        }
        if let kernel {
            let byKernel = open.filter { $0.state.kernelID == kernel }
            if let match = preferredPage(in: byKernel)?.webView { return match }
        }
        if let notebook {
            let resolved = resolve(notebook)
            let byPath = open.filter { $0.state.path.map(resolve) == resolved }
            if let match = preferredPage(in: byPath)?.webView { return match }
            let byLent = hosts.compactMap { entry -> WKWebView? in
                guard let view = entry.view, entry.notebook == resolved, isLiveHostView(view) else { return nil }
                return view
            }
            if let match = frontmost(in: byLent, matchTabSelection: false, windowOf: { $0.window }) {
                return match
            }
        }
        return nil
    }

    /// Picks the frontmost matching page when multiple windows or tabs show it.
    private func preferredPage(in matches: [PageModel]) -> PageModel? {
        guard matches.count > 1 else { return matches.first }
        return frontmost(in: matches, matchTabSelection: false) { $0.webView?.window }
    }

    /// The lent notebook page in the frontmost visible window, or `liveHost()`.
    private func frontHost() -> WKWebView? {
        hosts.removeAll { $0.view == nil }
        let lent = Array(hosts.compactMap(\.view).reversed().filter { isLiveHostView($0) })
        return frontmost(in: lent, matchTabSelection: true) { $0.window } ?? liveHost()
    }

    #if os(macOS)
    private func frontmost<Item>(in items: [Item], matchTabSelection: Bool, windowOf: (Item) -> NSWindow?) -> Item? {
        if let key = NSApp?.keyWindow, let match = items.first(where: { windowOf($0) === key }) {
            return match
        }
        if let main = NSApp?.mainWindow, let match = items.first(where: { windowOf($0) === main }) {
            return match
        }
        for window in NSApp?.orderedWindows ?? [] {
            if matchTabSelection, let selected = window.tabGroup?.selectedWindow,
               let match = items.first(where: { windowOf($0) === selected }) {
                return match
            }
            if let match = items.first(where: { windowOf($0) === window }) { return match }
        }
        return items.first
    }
    #else
    private func frontmost<Item>(in items: [Item], matchTabSelection: Bool, windowOf: (Item) -> UIWindow?) -> Item? {
        if let match = items.first(where: { windowOf($0)?.isKeyWindow == true }) {
            return match
        }
        return items.first
    }
    #endif

    private func recentLosses(for kernel: String, at date: Date) -> [Date] {
        let cutoff = date.addingTimeInterval(-lostRestartWindow)
        let kept = (losses[kernel] ?? []).filter { $0 >= cutoff }
        if kept.isEmpty {
            losses.removeValue(forKey: kernel)
        } else {
            losses[kernel] = kept
        }
        return kept
    }

    func handle(_ event: KernelEvent, from server: any KernelSink, notebookRoot root: URL? = nil) {
        switch event {
        case .start(let kernel, let serverRun, let launch):
            if maxLostRestarts >= 0, recentLosses(for: kernel, at: now()).count > maxLostRestarts {
                server.ended(kernel, run: serverRun, reason: "lost")
                onLostRestartLimit?(kernel)
                return
            }
            lastRun += 1
            runs[kernel] = Run(number: lastRun, server: server, serverRun: serverRun)
            updateActivity()
            notebooks[kernel] = Self.notebook(in: launch).map { Self.resolve($0, under: root ?? notebookRoot) }
            tellBridge(kernel)
            var start: [String: Any] = ["kernel": kernel, "op": "start", "run": lastRun]
            start["params"] = Self.params(in: launch)
            toPage(start)
        case .send(let kernel, let channel, let message):
            guard runs[kernel]?.server === server else { return }
            toPage(["kernel": kernel, "op": "send", "channel": channel, "json": message])
        case .stop(let kernel):
            guard runs[kernel]?.server === server else { return }
            losses[kernel] = nil
            runs[kernel] = nil
            notebooks[kernel] = nil
            owners[kernel] = nil
            updateActivity()
            toPage(["kernel": kernel, "op": "stop"])
        }
    }

    /// Stops every running kernel owned by `server` (such as a disconnected
    /// background server's provider socket, #941) without affecting kernels
    /// belonging to any other server.
    func detach(_ server: any KernelSink) {
        let owned = runs.compactMap { $0.value.server === server ? $0.key : nil }
        for kernel in owned.sorted() {
            losses[kernel] = nil
            runs[kernel] = nil
            notebooks[kernel] = nil
            owners[kernel] = nil
            toPage(["kernel": kernel, "op": "stop"])
        }
        updateActivity()
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
            webView.load(Self.kernelPageRequest(url))
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
    /// files without the token. Loading it without the token is also what
    /// keeps the server from setting the login cookie in the kernel web
    /// view's data store (#557).
    nonisolated static func kernelPageURL(_ server: URL) -> URL {
        guard var parts = URLComponents(url: server, resolvingAgainstBaseURL: false) else { return server }
        parts.path = "/kernel.html"
        parts.query = nil
        parts.fragment = nil
        return parts.url ?? server
    }

    /// The request that loads the kernel page: it is always fetched from
    /// the server, never the cache (#647). The server's `ServeDir` sends `Last-Modified` but
    /// no `Cache-Control`, so WebKit may serve a cached `kernel.html` on
    /// heuristic freshness, and the app reuses its port, so after an update
    /// the first launch could run the old release's page against the new
    /// Swift. The page's hashed `/assets/*` are not requested this way and
    /// stay cached.
    nonisolated static func kernelPageRequest(_ server: URL) -> URLRequest {
        URLRequest(url: kernelPageURL(server), cachePolicy: .reloadIgnoringLocalCacheData)
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
            updateActivity()
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
    /// a crash (`reason` other than `lost` counts one); `AppKernels` also
    /// bounds repeated `lost` restarts (#469).
    func kernelPageEnded(reason: String = "lost") {
        device.dropPage()
        let lost = runs
        runs = [:]
        owners = [:]
        loaded = false
        ready = false
        pending = []
        let timestamp = now()
        for (kernel, run) in lost.sorted(by: { $0.key < $1.key }) {
            if reason == "lost" {
                var history = recentLosses(for: kernel, at: timestamp)
                history.append(timestamp)
                losses[kernel] = history
            }
            run.server.ended(kernel, run: run.serverRun, reason: reason)
        }
        updateActivity()
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
        for i in hosts.indices {
            if let path = hosts[i].notebook, let to = rename(path) {
                hosts[i].notebook = to
            }
        }
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
        FileStamp.canonical(url)
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
    var notebook: String?
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
