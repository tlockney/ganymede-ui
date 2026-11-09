import DeviceBridge
import WebKit

/// The hidden web view that cdp-kernel's in-page kernels run in
/// (ganymede-ui#99): `kernel.html` from the same server, one browser kernel
/// per kernel the UI page starts. Only this web view registers the full
/// `device` handler (ganymede-device), so nothing the UI page renders,
/// outputs and widgets included, can reach it; the UI page gets only the
/// remote subset, below.
///
/// Jupyter messages pass through here (`src/lib/kernel-relay.ts` has the
/// web side): the UI page posts to `kernelRelay`, the kernel page to
/// `kernelHost`, and each is delivered to the other page in order. Only
/// main-frame messages are taken, since WebKit gives subframes, the UI's
/// sandboxed output frames among them, the same message handlers.
///
/// Kernels that run elsewhere (server kernels) reach the bridge through the
/// UI page instead (ganymede-device#26): the page answers their `device`
/// comm and posts to the bridge's `deviceRemote` handler, which takes only
/// the methods that need no permission, and only from the UI page's main
/// frame at the server's origin.
@MainActor
final class KernelHost: NSObject {
    static let relayHandler = "kernelRelay"
    static let hostHandler = "kernelHost"

    let webView: WKWebView
    /// ganymede-device's `device` handler. Kept so that a new kernel page
    /// starts with no dialog, picker or sound left from the old one.
    private let device: DeviceBridge
    /// The folders notebooks picked, in the store the bridge and Settings
    /// share: a rename moves them even for a notebook with no kept answer.
    private let folders: FolderGrants
    private weak var ui: WKWebView?
    private var pageURL: URL?
    private var loaded = false
    private var ready = false
    /// UI messages that arrived before the kernel page said it was ready.
    private var pending: [Any] = []
    /// Kernels the UI page started here and the kernel page hasn't
    /// reported closed: what to report closed if its process dies (#293).
    private var hosted: Set<String> = []
    /// The permission ledger's prompt (#383); the bridge holds it weakly.
    let prompter: AppLedgerPrompter
    /// What notebook paths from the UI page are under: the app server's
    /// root folder, so the ledger keeps each notebook by its absolute path,
    /// which stays the same across launches. Paths are used as given
    /// without one.
    var notebookRoot: URL?
    /// The notebook each kernel runs (by the UI page's kernel id), as an
    /// absolute path, and each kernel's `device` owner in the kernel page.
    /// The bridge needs both to know whose call is whose.
    private var notebooks: [String: String] = [:]
    private var owners: [String: Int] = [:]
    /// Open-time prompts queued or showing, so a notebook opened twice
    /// asks once.
    private struct OpenAsk: Hashable {
        let notebook: String
        let capability: String
    }
    private var openAsks: Set<OpenAsk> = []

    /// `device` is the bridge cells reach (the system's when nil); tests
    /// pass one with a fake presenter, `prompts`, a presenter for the
    /// ledger's prompts, and `folders`, the grants that bridge was given.
    init(device: DeviceBridge? = nil, prompts: DialogPresenter? = nil, folders: FolderGrants? = nil) {
        let config = WKWebViewConfiguration()
        // Not on screen, but cells must keep running at full speed.
        config.preferences.inactiveSchedulingPolicy = .none
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        // Every window's bridge keeps its answers in one store, which
        // Settings reads too (ganymede-device#86).
        let folders = folders ?? FolderGrants()
        self.folders = folders
        self.device = device ?? Self.systemBridge(folders: folders)
        prompter = AppLedgerPrompter(presenter: prompts, host: { nil })
        super.init()
        prompter.host = { [weak self] in self?.ui }
        if self.device.ledgerPrompter == nil {
            self.device.ledgerPrompter = prompter
        }
        config.userContentController.add(WeakHandler(self), name: Self.hostHandler)
        // ganymede-device's `device` handler, for cells: here and nowhere
        // else, so nothing the UI page renders can call it.
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

    /// One scheduler for every window: the first one made becomes the
    /// notification center's (weak) delegate, which shows notifications
    /// while the app is in front, so it must outlive any one window.
    private static let notifications = SystemNotificationScheduler()

    /// The bridge cells get by default: every namespace ganymede-device
    /// has, with the permissioned ones (ganymede-device#57, #422) turned
    /// on, host events (`device.on`), and folders the person picks
    /// (`device.folders`). Each permissioned one asks the
    /// app's ledger, then the system, on first use; one the device lacks
    /// (motion and the camera on a Mac) stays out of `hello`.
    private static func systemBridge(folders: FolderGrants) -> DeviceBridge {
        let bridge = DeviceBridge()
        // The notification center throws outside an app bundle, such as
        // the unit tests' runner.
        if Bundle.main.bundleURL.pathExtension == "app" {
            bridge.addNotifications(notifications)
        }
        bridge.addLocation()
        bridge.addMotion()
        bridge.addPhotoSaving()
        bridge.addCameraCapture()
        bridge.addContacts()
        bridge.addReminders()
        bridge.addBluetooth()
        bridge.addFolders(folders)
        bridge.addHostEvents()
        return bridge
    }

    /// Takes `ui`'s kernel messages, and keeps this web view in its view
    /// tree: WebKit suspends a web view that is in no window.
    func attach(to ui: WKWebView) {
        self.ui = ui
        ui.configuration.userContentController.add(WeakHandler(self), name: Self.relayHandler)
        device.registerRemote(in: ui.configuration.userContentController) { [weak self, weak ui] message in
            guard let self, let ui, message.webView === ui else { return false }
            return self.fromPage(message)
        }
        ui.addSubview(webView)
    }

    /// The UI page is `url`; the kernel page loads from the same server
    /// when the first kernel starts, after the page's login cookie is set.
    func uiWillLoad(_ url: URL) {
        pageURL = url
        reset()
    }

    /// The UI page navigated: its kernels are gone with it.
    func reset() {
        // What the old UI page asked for server kernels has no one to
        // answer it; the kernel page's calls end as it loads about:blank
        // below (`dropPage()` in the navigation delegate).
        device.dropRemote()
        notebooks = [:]
        owners = [:]
        guard loaded else { return }
        loaded = false
        ready = false
        pending = []
        hosted = []
        webView.load(URLRequest(url: URL(string: "about:blank")!))
    }

    /// The kernel page's process died, and every kernel in it (#293). Each
    /// is reported closed to the UI page, which shows it as dead with
    /// Restart, and the next message from the UI page loads a new kernel
    /// page, queued until that one is ready.
    func kernelPageEnded() {
        device.dropPage()
        owners = [:]
        loaded = false
        ready = false
        pending = []
        let gone = hosted.sorted()
        hosted = []
        guard let ui else { return }
        for kernel in gone {
            deliver(["kernel": kernel, "op": "closed"], to: ui, function: "ganymedeKernelRelay")
        }
    }

    /// The UI page's process died: no one answers what it asked for server
    /// kernels. The kernel page keeps running until the page reloads.
    func uiPageEnded() {
        device.dropRemote()
    }

    /// The message comes from a page of ours: the main frame, at the UI
    /// page's server.
    private func fromPage(_ message: WKScriptMessage) -> Bool {
        message.frameInfo.isMainFrame
            && message.frameInfo.securityOrigin.host == pageURL?.host
            && message.frameInfo.securityOrigin.port == pageURL?.port ?? 0
    }

    fileprivate func received(_ message: WKScriptMessage) {
        guard fromPage(message) else { return }
        if message.name == Self.relayHandler, message.webView === ui {
            fromUI(message.body)
        } else if message.name == Self.hostHandler, message.webView === webView {
            fromKernels(message.body)
        }
    }

    private func fromUI(_ body: Any) {
        if forApp(body) { return }
        if let m = body as? [String: Any], m["op"] as? String == "start", let kernel = m["kernel"] as? String {
            hosted.insert(kernel)
        }
        if !loaded, let url = kernelPageURL() {
            loaded = true
            webView.load(URLRequest(url: url))
        }
        if ready {
            deliver(body, to: webView, function: "ganymedeKernelHost")
        } else {
            pending.append(body)
        }
    }

    private func fromKernels(_ body: Any) {
        if let m = body as? [String: Any], m["op"] as? String == "owner" {
            if let kernel = m["kernel"] as? String, let owner = m["owner"] as? Int {
                owners[kernel] = owner
                tellBridge(kernel)
            }
            return
        }
        if (body as? [String: Any])?["op"] as? String == "ready" {
            ready = true
            for message in pending {
                deliver(message, to: webView, function: "ganymedeKernelHost")
            }
            pending = []
        } else if let ui {
            if let m = body as? [String: Any], m["op"] as? String == "closed", let kernel = m["kernel"] as? String {
                hosted.remove(kernel)
                owners[kernel] = nil
            }
            deliver(body, to: ui, function: "ganymedeKernelRelay")
        }
    }

    /// The UI page's messages for the permission ledger (#383), which go
    /// no further: a kernel's notebook, a rename, a notebook's declared
    /// capabilities. True when `body` was one.
    private func forApp(_ body: Any) -> Bool {
        guard let m = body as? [String: Any] else { return false }
        switch m["op"] as? String {
        case "notebook":
            if let kernel = m["kernel"] as? String {
                notebooks[kernel] = (m["path"] as? String).map(resolve)
                tellBridge(kernel)
            }
        case "moved":
            if let from = m["from"] as? String, let to = m["to"] as? String {
                moved(from: resolve(from), to: resolve(to))
            }
        case "declared":
            if let path = m["path"] as? String, let declared = m["capabilities"] as? [String] {
                askAtOpen(declared, notebook: resolve(path))
            }
        default:
            return false
        }
        return true
    }

    /// A server path from the UI page as the ledger keeps it.
    private func resolve(_ path: String) -> String {
        guard let notebookRoot else { return path }
        let relative = path.hasPrefix("/") ? String(path.dropFirst()) : path
        return notebookRoot.appendingPathComponent(relative).standardizedFileURL.path
    }

    /// Once a kernel's notebook and owner are both known, the bridge
    /// learns which notebook its calls come from.
    private func tellBridge(_ kernel: String) {
        guard let owner = owners[kernel] else { return }
        device.setNotebook(notebooks[kernel], for: owner)
    }

    /// A file or folder moved: every notebook at or under `old` follows,
    /// with its kept answers, its folders and its kernels.
    private func moved(from old: String, to new: String) {
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

    /// Asks, one at a time, about each declared capability this app has
    /// and nothing has decided.
    private func askAtOpen(_ declared: [String], notebook: String) {
        for capability in device.undecided(declared, notebook: notebook) {
            // Opened again (another tab, a reload) before the person
            // answered: the prompt already up or waiting covers it.
            let key = OpenAsk(notebook: notebook, capability: capability)
            guard openAsks.insert(key).inserted else { continue }
            prompter.askAtOpen(capability, notebook: notebook) { [weak self] answer in
                self?.openAsks.remove(key)
                guard let self, let answer, answer != .once,
                      // Answered meanwhile, by a call's prompt.
                      self.device.ledger.answer(notebook: notebook, capability: capability) == nil
                else { return }
                self.device.ledger.record(answer, notebook: notebook, capability: capability)
            }
        }
    }

    private func deliver(_ message: Any, to view: WKWebView, function: String) {
        view.callAsyncJavaScript(
            "window.\(function)?.deliver(m)", arguments: ["m": message], in: nil, in: .page)
    }

    private func kernelPageURL() -> URL? {
        guard let pageURL,
              var parts = URLComponents(url: pageURL, resolvingAgainstBaseURL: false) else { return nil }
        parts.path = "/kernel.html"
        parts.query = nil
        parts.fragment = nil
        return parts.url
    }
}

extension KernelHost: WKNavigationDelegate {
    /// The kernel page is going away (a reset, a reload): its device calls
    /// can no longer be answered, and the new page's call ids start over.
    /// The UI page's calls for server kernels stay.
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

    /// The kernel page's process died, and its kernels with it: iOS ends
    /// it under memory pressure, more so with a Pyodide heap (#293).
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        kernelPageEnded()
    }
}

/// WKUserContentController keeps its handlers alive; this keeps the host
/// from keeping itself alive through them.
@MainActor
private final class WeakHandler: NSObject, WKScriptMessageHandler {
    weak var host: KernelHost?

    init(_ host: KernelHost) {
        self.host = host
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        host?.received(message)
    }
}
