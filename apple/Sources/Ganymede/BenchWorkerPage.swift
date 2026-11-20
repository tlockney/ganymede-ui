import SwiftUI
import WebKit

/// The engine benchmark's WebKit half (#698): `web/index.html` from the
/// bundled bench folder in a web view, which runs the workloads in Workers
/// (today's in-app kernel's engine) and posts its report to the "bench"
/// handler. The web view's memory is the WebContent process's, which the
/// app can't read.
///
/// A failed load, a WebContent process that ends, or a page that hasn't
/// reported within `timeout` ends the run with an error report, so the app
/// never waits forever. One page serves one run.
@MainActor
final class BenchWorkerPage: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    static let handlerName = "bench"
    static let timeout: Duration = .seconds(180)

    let webView: WKWebView
    private var pending: CheckedContinuation<String, Never>?
    private var timer: Task<Void, Never>?
    private let controller: WKUserContentController

    /// `root` is the bundled bench folder.
    init(root: URL) {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BenchSchemeHandler(root: root), forURLScheme: BenchSchemeHandler.scheme)
        controller = config.userContentController
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        controller.add(self, name: Self.handlerName)
        webView.navigationDelegate = self
    }

    /// Loads the page and waits for its report (JSON text).
    func run(repeats: Int = EngineBench.repeats) async -> String {
        guard pending == nil else { return EngineBench.errorReport("The Worker page is already running.") }
        return await withCheckedContinuation { done in
            pending = done
            timer = Task { [weak self] in
                try? await Task.sleep(for: Self.timeout)
                guard !Task.isCancelled else { return }
                self?.finish(EngineBench.errorReport("The Worker page didn't report within \(Self.timeout.components.seconds) seconds."))
            }
            guard let url = URL(string: "\(BenchSchemeHandler.scheme)://\(BenchSchemeHandler.host)/web/index.html?repeats=\(repeats)") else {
                finish(EngineBench.errorReport("The Worker page's address is malformed."))
                return
            }
            webView.load(URLRequest(url: url))
        }
    }

    private func finish(_ report: String) {
        timer?.cancel()
        timer = nil
        // The user content controller keeps its handler alive: let go of
        // this page, which the web view holds.
        controller.removeScriptMessageHandler(forName: Self.handlerName)
        webView.stopLoading()
        pending?.resume(returning: report)
        pending = nil
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        finish(message.body as? String ?? EngineBench.errorReport("The Worker page posted no report."))
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: any Error) {
        finish(EngineBench.errorReport("The Worker page failed: \(error.localizedDescription)"))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: any Error) {
        finish(EngineBench.errorReport("The Worker page didn't load: \(error.localizedDescription)"))
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        finish(EngineBench.errorReport("The Worker page's web process ended."))
    }
}

/// Serves the bench folder at `bench://app/`, so the page and its Workers
/// share an origin. Only files inside the folder: the file and type rules
/// are the Quick Look preview's (`PreviewResources`).
final class BenchSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "bench"
    static let host = "app"
    private let root: URL

    init(root: URL) {
        self.root = root
    }

    func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
        guard let url = task.request.url,
              let file = PreviewResources.file(for: url, in: root, scheme: Self.scheme, host: Self.host),
              let data = try? Data(contentsOf: file)
        else {
            return task.didFailWithError(URLError(.fileDoesNotExist))
        }
        guard let response = PreviewResources.response(for: url, file: file, byteCount: data.count) else {
            return task.didFailWithError(URLError(.badServerResponse))
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

#if os(macOS)
/// Shows the page's web view while it runs: WebKit throttles one that
/// isn't on screen.
struct BenchWorkerView: NSViewRepresentable {
    let page: BenchWorkerPage
    func makeNSView(context: Context) -> WKWebView { page.webView }
    func updateNSView(_ view: WKWebView, context: Context) {}
}
#else
struct BenchWorkerView: UIViewRepresentable {
    let page: BenchWorkerPage
    func makeUIView(context: Context) -> WKWebView { page.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}
#endif
