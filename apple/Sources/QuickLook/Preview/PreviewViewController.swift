import Cocoa
import QuickLookUI
import WebKit

/// Quick Look's preview of a notebook (#135): ganymede-ui's notebook view
/// from the bundled preview page, read-only, with no server and no kernel.
/// Outputs show untrusted, as the app shows a file nobody signed.
final class PreviewViewController: NSViewController, QLPreviewingController, WKNavigationDelegate {
    /// Larger files get Quick Look's plain preview instead.
    static let maxBytes = 64 * 1024 * 1024

    private var webView: WKWebView!
    private var loading: ((Error?) -> Void)?

    override var nibName: NSNib.Name? { nil }

    override func loadView() {
        let configuration = WKWebViewConfiguration()
        let root = Bundle.main.resourceURL!.appendingPathComponent("quicklook", isDirectory: true)
        configuration.setURLSchemeHandler(PreviewSchemeHandler(root: root), forURLScheme: PreviewResources.scheme)
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600), configuration: configuration)
        webView.navigationDelegate = self
        view = webView
    }

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        let text: String
        do {
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size <= Self.maxBytes else { throw CocoaError(.fileReadTooLarge) }
            text = String(decoding: try Data(contentsOf: url), as: UTF8.self)
        } catch {
            handler(error)
            return
        }
        loading = { [weak self] error in
            guard let self else { return handler(error ?? CocoaError(.userCancelled)) }
            if let error { return handler(error) }
            // The page defines `ganymedePreview` when its module runs, which
            // is before `load`; waiting a moment more costs nothing if not.
            let script = """
                for (let i = 0; i < 100 && !window.ganymedePreview; i++)
                  await new Promise(r => setTimeout(r, 20));
                return (await window.ganymedePreview.render(text)).cells;
                """
            self.webView.callAsyncJavaScript(script, arguments: ["text": text], in: nil, in: .page) { result in
                if case .failure(let error) = result { return handler(error) }
                handler(nil)
            }
        }
        webView.load(URLRequest(url: PreviewResources.pageURL))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finishLoading(nil)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finishLoading(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finishLoading(error)
    }

    /// Links open in the browser, not in the preview.
    func webView(
        _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = action.request.url, url.scheme != PreviewResources.scheme else {
            return decisionHandler(.allow)
        }
        if action.navigationType == .linkActivated, ["http", "https", "mailto"].contains(url.scheme) {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    private func finishLoading(_ error: Error?) {
        let next = loading
        loading = nil
        next?(error)
    }
}

/// Answers the web view's requests for the preview page's files.
final class PreviewSchemeHandler: NSObject, WKURLSchemeHandler {
    let root: URL

    init(root: URL) {
        self.root = root
    }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url, let file = PreviewResources.file(for: url, in: root),
              let data = try? Data(contentsOf: file)
        else {
            return task.didFailWithError(URLError(.fileDoesNotExist))
        }
        let headers = [
            "Content-Type": PreviewResources.mimeType(for: file),
            "Content-Length": String(data.count),
        ]
        task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}
}
