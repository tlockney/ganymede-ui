#if os(macOS)
import WebKit
import XCTest

/// KernelHost between two real web views on a real server: stand-in
/// pages for the UI and kernel.html check that messages cross both ways,
/// in order, that a sandboxed frame in the UI page can't post into
/// the relay, and that only the kernel web view has the `device` bridge.
final class KernelHostTests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let web = dir.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        // The UI: collects what the kernels send, and holds a sandboxed
        // frame that tries the relay itself.
        try """
        <!doctype html><title>ui</title>
        <script>
          window.got = [];
          window.ganymedeKernelRelay = { deliver: m => window.got.push(m) };
        </script>
        <iframe sandbox="allow-scripts" srcdoc="<script>
          webkit.messageHandlers.kernelRelay.postMessage({ kernel: 'evil', op: 'start' });
          webkit.messageHandlers.kernelRelay.postMessage(
            { kernel: 'evil', op: 'send', channel: 'shell', msg: { n: -1 } });
        </script>"></iframe>
        """.write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        // The kernels: answer each message with an echo on iopub.
        try """
        <!doctype html><title>kernels</title>
        <script>
          const post = m => webkit.messageHandlers.kernelHost.postMessage(m);
          window.ganymedeKernelHost = {
            deliver(m) {
              if (m.op === 'send') {
                post({ kernel: m.kernel, op: 'message', channel: 'iopub', msg: { echo: m.msg.n } });
              }
            },
          };
          post({ op: 'ready' });
        </script>
        """.write(to: web.appendingPathComponent("kernel.html"), atomically: true, encoding: .utf8)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    @MainActor
    private func eval(_ view: WKWebView, _ script: String) async throws -> Any? {
        try await view.evaluateJavaScript(script)
    }

    /// Polls `script` in `view` until it is true.
    @MainActor
    private func waitFor(_ view: WKWebView, _ script: String, timeout: TimeInterval = 20) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if (try? await eval(view, script)) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail("timed out waiting for \(script)")
    }

    @MainActor
    func testRelaysMessagesBothWaysInOrder() async throws {
        let server = try ServerHost(config: [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ])
        defer { server.stop() }

        let host = KernelHost()
        let ui = WKWebView(
            frame: CGRect(x: 0, y: 0, width: 400, height: 300), configuration: WKWebViewConfiguration())
        host.attach(to: ui)
        host.uiWillLoad(server.url)
        ui.load(URLRequest(url: server.url))
        try await waitFor(ui, "document.readyState === 'complete' && !!window.ganymedeKernelRelay")

        // Sent before the kernel page exists: queued, then delivered in order.
        _ = try await eval(ui, """
            const post = m => webkit.messageHandlers.kernelRelay.postMessage(m);
            post({ kernel: 'k1', op: 'start' });
            for (let n = 0; n < 5; n++) post({ kernel: 'k1', op: 'send', channel: 'shell', msg: { n } });
            true
            """)
        try await waitFor(ui, "window.got.length >= 5")
        let echoes = try await eval(ui, "JSON.stringify(window.got.map(m => m.msg.echo))") as? String
        XCTAssertEqual(echoes, "[0,1,2,3,4]")
        let fromFrame = try await eval(ui, "window.got.some(m => m.kernel === 'evil')") as? Bool
        XCTAssertEqual(fromFrame, false)
        XCTAssertEqual(host.webView.url?.path, "/kernel.html")

        // The device bridge answers in the kernel web view and is absent
        // from the UI page.
        let hello = try await host.webView.callAsyncJavaScript(
            "const r = await webkit.messageHandlers.device.postMessage({ id: 1, method: 'hello', params: {} });"
                + " return r.result.capabilities.join(',')",
            contentWorld: .page) as? String
        XCTAssertEqual(hello, "clipboard.readText,clipboard.writeText")
        let inUI = try await eval(ui, "typeof webkit.messageHandlers.device") as? String
        XCTAssertEqual(inUI, "undefined")
    }
}
#endif
