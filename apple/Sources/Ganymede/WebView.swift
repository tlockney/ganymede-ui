import SwiftUI
import WebKit

/// ganymede-ui, loaded from the in-process server.
#if os(macOS)
struct WebView: NSViewRepresentable {
    let url: URL
    /// The page's URL after each change, including the page's own
    /// `history.replaceState` (the notebook it has open, #129).
    var onNavigate: ((URL?) -> Void)? = nil
    /// The window's document, which the page keeps up to date (#132).
    var document: PageDocument? = nil
    /// What the page shows and the commands it runs, for native chrome (#205).
    var page: PageModel? = nil
    /// Opens a text file from the sidebar, by its path on the server (#122).
    var onOpenFile: ((String) -> Void)? = nil

    func makeCoordinator() -> WebViewCoordinator { WebViewCoordinator() }

    func makeNSView(context: Context) -> WKWebView {
        context.coordinator.makeWebView()
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        context.coordinator.onNavigate = onNavigate
        context.coordinator.document = document
        context.coordinator.page = page
        context.coordinator.onOpenFile = onOpenFile
        context.coordinator.load(url, in: view)
    }
}
#else
struct WebView: UIViewRepresentable {
    let url: URL
    /// What the page shows and the commands it runs, for native chrome (#205).
    var page: PageModel? = nil
    /// Opens a text file from the sidebar, by its path on the server (#122).
    var onOpenFile: ((String) -> Void)? = nil
    /// Keeps the page alive while it is off screen (the iPhone, #209).
    var store: WebViewStore? = nil

    func makeCoordinator() -> WebViewCoordinator { store?.coordinator ?? WebViewCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
        store?.webView ?? context.coordinator.makeWebView()
    }

    /// A stored page goes back to its parking place once its screen has
    /// let it go.
    static func dismantleUIView(_ view: WKWebView, coordinator: WebViewCoordinator) {
        // After SwiftUI has taken the screen's views out of the window, and
        // again once a pop's animation is surely over; the list's
        // `onAppear` parks it too.
        DispatchQueue.main.async { coordinator.park?() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { coordinator.park?() }
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.page = page
        context.coordinator.onOpenFile = onOpenFile
        context.coordinator.load(url, in: view)
    }
}
#endif

#if os(iOS)
/// One page that outlives the views showing it. On the iPhone the notebook
/// is pushed onto the folder list and popped off it again (#209); the page,
/// its state and the app's commands go on while the list shows, so popping
/// doesn't reload it and the list can read `PageModel` and open notebooks.
///
/// WebKit suspends a web view that is in no window (see `KernelHost`), so
/// while the notebook screen isn't showing, the web view waits in
/// `parking`, a hidden view behind the list (`ParkedPage`).
@MainActor
final class WebViewStore: ObservableObject {
    private(set) lazy var coordinator: WebViewCoordinator = {
        let coordinator = WebViewCoordinator()
        coordinator.park = { [weak self] in self?.park() }
        return coordinator
    }()
    private(set) lazy var webView: WKWebView = coordinator.makeWebView(keepRunning: true)
    /// Holds the web view while no screen shows it.
    let parking: UIView = {
        let view = UIView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        view.alpha = 0
        view.isUserInteractionEnabled = false
        return view
    }()

    /// Loads the page off screen, if it isn't already.
    func load(_ url: URL, page: PageModel, onOpenFile: @escaping (String) -> Void) {
        let view = webView
        // After the view exists: setting `page` hands it the view.
        coordinator.page = page
        coordinator.onOpenFile = onOpenFile
        coordinator.load(url, in: view)
        park()
    }

    /// The server stopped (a restart reuses its port, so the page's URL
    /// comes back the same): the next `load` loads the page again, and its
    /// commands wait for it.
    func forget(page: PageModel) {
        coordinator.forget()
        page.reset()
    }

    /// Puts the web view back in `parking` when no screen in the window
    /// holds it.
    func park() {
        guard webView.window == nil || webView.superview == nil else { return }
        parking.addSubview(webView)
    }
}

/// The hidden view behind the iPhone's list that keeps its page in the
/// window (`WebViewStore.parking`).
struct ParkedPage: UIViewRepresentable {
    let store: WebViewStore

    func makeUIView(context: Context) -> UIView { store.parking }
    func updateUIView(_ view: UIView, context: Context) {}
}
#endif

#if os(macOS)
/// The windows that show a notebook page, for the Settings window's
/// Agent tab (#332), which asks a page for the agent's settings.
@MainActor
enum NotebookWindows {
    /// Every notebook page's model.
    static let pages = NSHashTable<PageModel>.weakObjects()

    /// The page of the frontmost window showing a notebook page, if any.
    static var frontPage: PageModel? {
        let shown = pages.allObjects.filter { $0.webView?.window != nil }
        for window in NSApp.orderedWindows {
            if let page = shown.first(where: { $0.webView?.window === window }) { return page }
        }
        return nil
    }
}
#endif

@MainActor
final class WebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var loaded: URL?
    private weak var webView: WKWebView?
    private let agentKeys = AgentKeys(secrets: KeychainStore())
    private var urlObservation: NSKeyValueObservation?
    var onNavigate: ((URL?) -> Void)?
    var onOpenFile: ((String) -> Void)?
    #if os(iOS)
    /// Puts a stored page back where it waits off screen (`WebViewStore`).
    var park: (() -> Void)?
    #endif
    var page: PageModel? {
        didSet {
            page?.webView = webView
            #if os(macOS)
            if let page { NotebookWindows.pages.add(page) }
            #endif
        }
    }
    #if os(macOS)
    var document: PageDocument? {
        didSet { document?.webView = webView }
    }
    #endif
    /// Where the page's in-page kernels run (ganymede-ui#99).
    private let kernels = KernelHost()
    private var codeFontObserver: CodeFontObserver?
    #if os(iOS)
    /// Where each download is written before the share sheet offers it.
    private var destinations: [ObjectIdentifier: URL] = [:]
    #endif

    /// Every user script the page gets, replacing any already there: add
    /// a new one here, since a code font change reinstalls them all.
    private static func installPageScripts(on view: WKWebView) {
        let scripts = view.configuration.userContentController
        scripts.removeAllUserScripts()
        // The page's error reports follow the app's choice (#318, #319).
        scripts.addUserScript(CrashReports.shared.pageScript)
        // The code font (#354), before the page loads.
        scripts.addUserScript(CodeFont.pageScript)
    }

    /// `keepRunning`: the page runs at full speed while it isn't visible
    /// (the iPhone's page while its list shows, #209).
    func makeWebView(keepRunning: Bool = false) -> WKWebView {
        let config = WKWebViewConfiguration()
        if keepRunning, #available(macOS 14.0, iOS 17.0, *) {
            config.preferences.inactiveSchedulingPolicy = .none
        }
        let view = WKWebView(frame: .zero, configuration: config)
        view.navigationDelegate = self
        view.uiDelegate = self
        webView = view
        kernels.attach(to: view)
        urlObservation = view.observe(\.url, options: [.new]) { [weak self] _, change in
            let url = change.newValue ?? nil
            Task { @MainActor in self?.onNavigate?(url) }
        }
        Self.installPageScripts(on: view)
        // The code font (#354) as it changes: a reload must get the new
        // setting too, so the scripts are installed again.
        codeFontObserver = observeCodeFont { [weak view] in
            guard let view else { return }
            Self.installPageScripts(on: view)
            view.evaluateJavaScript(CodeFont.updateScript, completionHandler: nil)
        }
        // The page's sidebar opens text files in the app's editor (#122).
        view.configuration.userContentController.add(OpenFileHandler(self), name: "openFile")
        // What the page shows, for native toolbars and menus (#205).
        view.configuration.userContentController.add(StateHandler(self), name: "state")
        // The agent's API keys, in the Keychain (#166).
        view.configuration.userContentController.addScriptMessageHandler(
            AgentKeysHandler(self), contentWorld: .page, name: "agentKeys"
        )
        // The page's Settings, Keyboard Shortcuts and Connect open the
        // app's Settings at a tab (#332).
        view.configuration.userContentController.add(SettingsHandler(self), name: "settings")
        #if os(macOS)
        view.configuration.userContentController.add(DocumentHandler(self), name: "document")
        #endif
        if #available(macOS 13.3, iOS 16.4, *) {
            // Safari's Web Inspector can attach (Develop menu).
            view.isInspectable = true
        }
        return view
    }

    /// The next `load` loads even the same URL: the server restarted.
    func forget() {
        loaded = nil
    }

    /// Loads `url` when it changed: a restart for another folder.
    func load(_ url: URL, in view: WKWebView) {
        guard url != loaded else { return }
        loaded = url
        kernels.uiWillLoad(url)
        view.load(URLRequest(url: url))
    }

    /// A reload or another page: the old page's kernels go with it.
    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        kernels.reset()
        // The new page takes commands once it has posted its state.
        page?.reset()
    }

    /// Links to other hosts open in the default browser.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if navigationAction.shouldPerformDownload {
            // `<a download>`, including the blob: and data: links outputs
            // and widgets make for files.
            decisionHandler(.download)
        } else if let target = navigationAction.request.url, isExternal(target),
           navigationAction.navigationType == .linkActivated {
            openExternally(target)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

    /// Responses WebKit can't show, or that ask to be saved, download.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        let disposition = (navigationResponse.response as? HTTPURLResponse)?
            .value(forHTTPHeaderField: "Content-Disposition") ?? ""
        if !navigationResponse.canShowMIMEType
            || disposition.lowercased().hasPrefix("attachment") {
            decisionHandler(.download)
        } else {
            decisionHandler(.allow)
        }
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    #if os(macOS)
    /// Asks where to save, as Safari does with "Ask for each download".
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        let done: (NSApplication.ModalResponse) -> Void = { result in
            guard result == .OK, let url = panel.url else {
                completionHandler(nil)
                return
            }
            // The panel already asked to replace it; WebKit won't overwrite.
            try? FileManager.default.removeItem(at: url)
            completionHandler(url)
        }
        if let window = webView?.window {
            panel.beginSheetModal(for: window, completionHandler: done)
        } else {
            done(panel.runModal())
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        // Cancelling the save panel ends the download this way too.
        if (error as? URLError)?.code == .cancelled { return }
        let alert = NSAlert(error: error)
        alert.messageText = "The download failed."
        alert.informativeText = error.localizedDescription
        alert.runModal()
    }
    #else
    /// iOS has no save panel: write to a temporary folder, then offer the
    /// file in the share sheet (Save to Files, AirDrop, other apps).
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let folder = FileManager.default.temporaryDirectory
            .appendingPathComponent("Downloads", isDirectory: true)
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        } catch {
            completionHandler(nil)
            return
        }
        let url = folder.appendingPathComponent(suggestedFilename)
        destinations[ObjectIdentifier(download)] = url
        completionHandler(url)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let url = destinations.removeValue(forKey: ObjectIdentifier(download)),
              let webView else { return }
        let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        share.popoverPresentationController?.sourceView = webView
        share.popoverPresentationController?.sourceRect = CGRect(
            x: webView.bounds.midX, y: webView.bounds.midY, width: 0, height: 0)
        share.completionWithItemsHandler = { _, _, _, _ in
            try? FileManager.default.removeItem(at: url.deletingLastPathComponent())
        }
        present(share, from: webView) {}
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        destinations.removeValue(forKey: ObjectIdentifier(download))
        guard (error as? URLError)?.code != .cancelled, let webView else { return }
        let alert = UIAlertController(
            title: "The download failed.", message: error.localizedDescription, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, from: webView) {}
    }
    #endif

    /// `window.open` and `target="_blank"`: the browser for other hosts,
    /// this view for the server's own pages.
    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let target = navigationAction.request.url {
            if isExternal(target) {
                openExternally(target)
            } else {
                webView.load(navigationAction.request)
            }
        }
        return nil
    }

    private func isExternal(_ url: URL) -> Bool {
        guard let host = loaded?.host, let port = loaded?.port else { return true }
        return !(url.host == host && url.port == port) && url.scheme != "about"
            && url.scheme != "blob" && url.scheme != "data"
    }

    private func openExternally(_ url: URL) {
        #if os(macOS)
        NSWorkspace.shared.open(url)
        #else
        UIApplication.shared.open(url)
        #endif
    }

    #if os(macOS)
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = prompt
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        completionHandler(alert.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
    }
    #else
    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, from: webView, orElse: completionHandler)
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, from: webView) { completionHandler(false) }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (String?) -> Void
    ) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text ?? "")
        })
        present(alert, from: webView) { completionHandler(nil) }
    }

    /// Shows `controller` over the view controller holding `webView`;
    /// calls `fallback` when there is none, since WebKit requires the
    /// handler.
    private func present(_ controller: UIViewController, from webView: WKWebView, orElse fallback: () -> Void) {
        var top = webView.window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        if let top {
            top.present(controller, animated: true)
        } else {
            fallback()
        }
    }
    #endif
}

extension WebViewCoordinator {
    /// The page's `openFile` message, `{ path: string }`. Only the page
    /// itself may send it: output frames see the same handlers.
    func received(openFile message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              let fields = message.body as? [String: Any], let path = fields["path"] as? String,
              !path.isEmpty
        else { return }
        onOpenFile?(path)
    }
}

/// The `openFile` handler; weak, since the content controller keeps its
/// handlers.
private final class OpenFileHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(openFile: message)
    }
}

extension WebViewCoordinator {
    /// The page's `agentKeys` message (#166). Only the page the app loaded
    /// may read or set keys: not output frames, and not another site.
    func received(
        agentKeys message: WKScriptMessage, reply: @escaping (Any?, String?) -> Void
    ) {
        let origin = message.frameInfo.securityOrigin
        guard AgentKeys.trusted(
            isMainFrame: message.frameInfo.isMainFrame,
            scheme: origin.protocol, host: origin.host, port: origin.port,
            page: loaded
        ) else {
            reply(nil, AgentKeys.Failure.notThePage.localizedDescription)
            return
        }
        do {
            reply(try agentKeys.handle(message.body), nil)
        } catch {
            reply(nil, error.localizedDescription)
        }
    }
}

/// The `agentKeys` handler, which answers each message; weak, since the
/// content controller keeps its handlers.
private final class AgentKeysHandler: NSObject, WKScriptMessageHandlerWithReply {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(
        _ controller: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping (Any?, String?) -> Void
    ) {
        guard let coordinator else {
            replyHandler(nil, "the window is closing")
            return
        }
        coordinator.received(agentKeys: message, reply: replyHandler)
    }
}

/// What a window's page shows, and the commands it runs: the native
/// toolbar and menus read `state` and call `run` (#205).
@MainActor
final class PageModel: ObservableObject {
    @Published private(set) var state = PageState()
    weak var webView: WKWebView? {
        didSet { flush() }
    }
    /// Whether the page has posted its state with a backend, so its
    /// commands and calls are ready.
    @Published private(set) var ready = false
    /// Commands run before then: the iPhone's list can be tapped while the
    /// page is still loading (#209).
    private var pending: [String] = []

    /// Views that want the kernels' memory (#241).
    private var memoryWatch = MemoryWatch()

    func update(_ state: PageState) {
        if state != self.state { self.state = state }
        // Ready once it is connected: before that, `open` and
        // `new-notebook` have no backend to act on.
        if !ready, state.backend != nil {
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

    /// The page is going away: commands wait for the next one's state.
    func reset() {
        ready = false
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

extension WebViewCoordinator {
    /// The page's `state` message. Only the page itself may send it.
    func received(state message: WKScriptMessage) {
        if message.frameInfo.isMainFrame, let state = PageState(body: message.body) {
            page?.update(state)
        }
    }
}

extension WebViewCoordinator {
    /// The page's `settings` message: a `SettingsTab` to show. Only the
    /// page itself may send it, not an output's frame.
    func received(settings message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame, let tab = SettingsTab(message: message.body) else { return }
        NotificationCenter.default.post(name: .showAppSettings, object: page, userInfo: ["tab": tab])
    }
}

/// The `settings` handler; weak, since the content controller keeps its
/// handlers.
private final class SettingsHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(settings: message)
    }
}

/// The `state` handler; weak, since the content controller keeps its
/// handlers.
private final class StateHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(state: message)
    }
}

#if os(macOS)
extension WebViewCoordinator {
    /// The page's `document` message: its notebook and unsaved edits. Only
    /// the page itself may send it.
    func received(document message: WKScriptMessage) {
        if message.frameInfo.isMainFrame, let update = DocumentMessage(body: message.body) {
            document?.update(update)
        }
    }
}

/// The `document` handler; weak, since the content controller keeps its
/// handlers.
private final class DocumentHandler: NSObject, WKScriptMessageHandler {
    weak var coordinator: WebViewCoordinator?

    init(_ coordinator: WebViewCoordinator) {
        self.coordinator = coordinator
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        coordinator?.received(document: message)
    }
}
#endif
