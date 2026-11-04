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

    func makeCoordinator() -> WebViewCoordinator { WebViewCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
        context.coordinator.makeWebView()
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.page = page
        context.coordinator.onOpenFile = onOpenFile
        context.coordinator.load(url, in: view)
    }
}
#endif

extension Notification.Name {
    /// Posted by Help > Keyboard Shortcuts.
    static let showShortcuts = Notification.Name("GanymedeShowShortcuts")
    /// Posted by Ganymede > Agent Settings.
    static let showAgentSettings = Notification.Name("GanymedeShowAgentSettings")
}

#if os(macOS)
/// The windows that show a notebook page, for the commands that open one
/// of the page's sheets from elsewhere: a menu while a Terminal or Editor
/// window is in front, or the Settings window (#206).
@MainActor
enum NotebookWindows {
    /// Every notebook page's web view.
    static let views = NSHashTable<WKWebView>.weakObjects()

    /// The frontmost window showing a notebook page, if any.
    static var front: NSWindow? {
        let windows = Set(views.allObjects.compactMap { $0.window }.map(ObjectIdentifier.init))
        return NSApp.orderedWindows.first { windows.contains(ObjectIdentifier($0)) }
    }

    /// Brings the front notebook window forward and shows one of its
    /// page's sheets there (`.showShortcuts`, `.showAgentSettings`).
    static func show(_ name: Notification.Name) {
        guard let window = front else { return }
        window.makeKeyAndOrderFront(nil)
        NotificationCenter.default.post(name: name, object: window)
    }
}
#endif

@MainActor
final class WebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var loaded: URL?
    private weak var webView: WKWebView?
    private var shortcuts: NSObjectProtocol?
    private var agentSettings: NSObjectProtocol?
    private let agentKeys = AgentKeys(secrets: KeychainStore())
    private var urlObservation: NSKeyValueObservation?
    var onNavigate: ((URL?) -> Void)?
    var onOpenFile: ((String) -> Void)?
    var page: PageModel? {
        didSet { page?.webView = webView }
    }
    #if os(macOS)
    var document: PageDocument? {
        didSet { document?.webView = webView }
    }
    #endif
    /// Where the page's in-page kernels run (ganymede-ui#99).
    private let kernels = KernelHost()
    #if os(iOS)
    /// Where each download is written before the share sheet offers it.
    private var destinations: [ObjectIdentifier: URL] = [:]
    #endif

    func makeWebView() -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        view.navigationDelegate = self
        view.uiDelegate = self
        webView = view
        kernels.attach(to: view)
        urlObservation = view.observe(\.url, options: [.new]) { [weak self] _, change in
            let url = change.newValue ?? nil
            Task { @MainActor in self?.onNavigate?(url) }
        }
        // The page's sidebar opens text files in the app's editor (#122).
        view.configuration.userContentController.add(OpenFileHandler(self), name: "openFile")
        // What the page shows, for native toolbars and menus (#205).
        view.configuration.userContentController.add(StateHandler(self), name: "state")
        // The agent's API keys, in the Keychain (#166).
        view.configuration.userContentController.addScriptMessageHandler(
            AgentKeysHandler(self), contentWorld: .page, name: "agentKeys"
        )
        #if os(macOS)
        view.configuration.userContentController.add(DocumentHandler(self), name: "document")
        // Help > Keyboard Shortcuts, Ganymede > Agent Settings and the
        // Settings window's tabs (#206) name the window to show them in:
        // the front notebook window (`NotebookWindows.front`).
        shortcuts = NotificationCenter.default.addObserver(
            forName: .showShortcuts, object: nil, queue: .main
        ) { [weak view] note in
            guard let view, let window = view.window, note.object as? NSWindow === window else { return }
            view.evaluateJavaScript("window.dispatchEvent(new Event('ganymede:show-shortcuts'))")
        }
        agentSettings = NotificationCenter.default.addObserver(
            forName: .showAgentSettings, object: nil, queue: .main
        ) { [weak view] note in
            guard let view, let window = view.window, note.object as? NSWindow === window else { return }
            view.evaluateJavaScript("window.dispatchEvent(new Event('ganymede:show-settings'))")
        }
        NotebookWindows.views.add(view)
        #endif
        if #available(macOS 13.3, iOS 16.4, *) {
            // Safari's Web Inspector can attach (Develop menu).
            view.isInspectable = true
        }
        return view
    }

    deinit {
        if let shortcuts {
            NotificationCenter.default.removeObserver(shortcuts)
        }
        if let agentSettings {
            NotificationCenter.default.removeObserver(agentSettings)
        }
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
    weak var webView: WKWebView?

    func update(_ state: PageState) {
        if state != self.state { self.state = state }
    }

    /// Runs one of the page's commands (`PageCommand`).
    func run(_ id: String, arg: String? = nil) {
        webView?.evaluateJavaScript(PageCommand.script(id, arg: arg), completionHandler: nil)
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
