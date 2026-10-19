import SwiftUI
import WebKit

/// ganymede-ui, loaded from the in-process server.
#if os(macOS)
struct WebView: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> WebViewCoordinator { WebViewCoordinator() }

    func makeNSView(context: Context) -> WKWebView {
        context.coordinator.makeWebView()
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        context.coordinator.load(url, in: view)
    }
}
#else
struct WebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> WebViewCoordinator { WebViewCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
        context.coordinator.makeWebView()
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.load(url, in: view)
    }
}
#endif

@MainActor
final class WebViewCoordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
    private var loaded: URL?

    func makeWebView() -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        view.navigationDelegate = self
        view.uiDelegate = self
        if #available(macOS 13.3, iOS 16.4, *) {
            // Safari's Web Inspector can attach (Develop menu).
            view.isInspectable = true
        }
        return view
    }

    /// Loads `url` when it changed: a restart for another folder.
    func load(_ url: URL, in view: WKWebView) {
        guard url != loaded else { return }
        loaded = url
        view.load(URLRequest(url: url))
    }

    /// Links to other hosts open in the default browser.
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if let target = navigationAction.request.url, isExternal(target),
           navigationAction.navigationType == .linkActivated {
            openExternally(target)
            decisionHandler(.cancel)
        } else {
            decisionHandler(.allow)
        }
    }

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

    /// Shows `alert` over the view controller holding `webView`; calls
    /// `fallback` when there is none, since WebKit requires the handler.
    private func present(_ alert: UIAlertController, from webView: WKWebView, orElse fallback: () -> Void) {
        var top = webView.window?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        if let top {
            top.present(alert, animated: true)
        } else {
            fallback()
        }
    }
    #endif
}
