import DeviceBridge
import WebKit

/// The hidden web view that cdp-kernel's in-page kernels run in
/// (ganymede-ui#99): `kernel.html` from the same server, one browser kernel
/// per kernel the UI page starts. Only this web view registers native
/// bridges such as ganymede-device's `device` handler, so nothing the UI
/// page renders, outputs and widgets included, can reach them.
///
/// Jupyter messages pass through here (`src/lib/kernel-relay.ts` has the
/// web side): the UI page posts to `kernelRelay`, the kernel page to
/// `kernelHost`, and each is delivered to the other page in order. Only
/// main-frame messages are taken, since WebKit gives subframes, the UI's
/// sandboxed output frames among them, the same message handlers.
@MainActor
final class KernelHost: NSObject {
    static let relayHandler = "kernelRelay"
    static let hostHandler = "kernelHost"

    let webView: WKWebView
    private weak var ui: WKWebView?
    private var pageURL: URL?
    private var loaded = false
    private var ready = false
    /// UI messages that arrived before the kernel page said it was ready.
    private var pending: [Any] = []

    override init() {
        let config = WKWebViewConfiguration()
        if #available(macOS 14.0, iOS 17.0, *) {
            // Not on screen, but cells must keep running at full speed.
            config.preferences.inactiveSchedulingPolicy = .none
        }
        webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 1, height: 1), configuration: config)
        super.init()
        config.userContentController.add(WeakHandler(self), name: Self.hostHandler)
        // ganymede-device's `device` handler, for cells: here and nowhere
        // else, so nothing the UI page renders can call it.
        DeviceBridge().register(in: config.userContentController)
        if #available(macOS 13.3, iOS 16.4, *) {
            webView.isInspectable = true
        }
        #if os(macOS)
        webView.alphaValue = 0
        #else
        webView.alpha = 0
        webView.isUserInteractionEnabled = false
        #endif
    }

    /// Takes `ui`'s kernel messages, and keeps this web view in its view
    /// tree: WebKit suspends a web view that is in no window.
    func attach(to ui: WKWebView) {
        self.ui = ui
        ui.configuration.userContentController.add(WeakHandler(self), name: Self.relayHandler)
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
        guard loaded else { return }
        loaded = false
        ready = false
        pending = []
        webView.load(URLRequest(url: URL(string: "about:blank")!))
    }

    fileprivate func received(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              message.frameInfo.securityOrigin.host == pageURL?.host,
              message.frameInfo.securityOrigin.port == pageURL?.port ?? 0 else { return }
        if message.name == Self.relayHandler, message.webView === ui {
            fromUI(message.body)
        } else if message.name == Self.hostHandler, message.webView === webView {
            fromKernels(message.body)
        }
    }

    private func fromUI(_ body: Any) {
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
        if (body as? [String: Any])?["op"] as? String == "ready" {
            ready = true
            for message in pending {
                deliver(message, to: webView, function: "ganymedeKernelHost")
            }
            pending = []
        } else if let ui {
            deliver(body, to: ui, function: "ganymedeKernelRelay")
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
