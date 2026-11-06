import SwiftUI
import WebKit

/// The keyboard shortcuts, listed and rebound in Settings (#332). The
/// page keeps them (`shortcuts.ts`, in its local storage), so this is the
/// page's own list, loaded alone (`view=shortcuts`) from the app's server:
/// the same origin as the notebook windows, whose pages take a change as
/// it is made.
struct ShortcutsPane: View {
    let server: URL

    var body: some View {
        ShortcutsWebView(url: Self.url(server: server))
    }

    /// The server's page with `view=shortcuts` beside its own query.
    static func url(server: URL) -> URL {
        guard var parts = URLComponents(url: server, resolvingAgainstBaseURL: false) else { return server }
        parts.queryItems = (parts.queryItems ?? []).filter { $0.name != "view" }
            + [URLQueryItem(name: "view", value: "shortcuts")]
        return parts.url ?? server
    }
}

/// Stays on the app's server: the list has no links. A server restart's
/// new URL loads the page again.
@MainActor
final class ShortcutsWebCoordinator: NSObject, WKNavigationDelegate {
    var url: URL?

    func webView(
        _ webView: WKWebView,
        decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        let to = action.request.url
        let same = to?.scheme == url?.scheme && to?.host == url?.host && to?.port == url?.port
        decisionHandler(same ? .allow : .cancel)
    }

    func load(_ url: URL, in view: WKWebView) {
        guard url != self.url else { return }
        self.url = url
        view.load(URLRequest(url: url))
    }

    func makeView() -> WKWebView {
        let view = WKWebView(frame: .zero, configuration: WKWebViewConfiguration())
        view.navigationDelegate = self
        #if os(macOS)
        // The Settings window's own background shows through the page's.
        view.setValue(false, forKey: "drawsBackground")
        #else
        view.isOpaque = false
        view.backgroundColor = .clear
        #endif
        return view
    }
}

#if os(macOS)
private struct ShortcutsWebView: NSViewRepresentable {
    let url: URL

    func makeCoordinator() -> ShortcutsWebCoordinator { ShortcutsWebCoordinator() }

    func makeNSView(context: Context) -> WKWebView {
        let view = context.coordinator.makeView()
        context.coordinator.load(url, in: view)
        return view
    }

    func updateNSView(_ view: WKWebView, context: Context) {
        context.coordinator.load(url, in: view)
    }
}
#else
private struct ShortcutsWebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> ShortcutsWebCoordinator { ShortcutsWebCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let view = context.coordinator.makeView()
        context.coordinator.load(url, in: view)
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.load(url, in: view)
    }
}
#endif
