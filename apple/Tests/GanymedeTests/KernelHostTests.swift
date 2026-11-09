#if os(macOS)
import DeviceBridge
import WebKit
import XCTest

/// Shows nothing and never answers; counts what it was asked to close.
@MainActor
private final class SilentPresenter: DialogPresenter {
    var shown = 0
    var closed = 0
    func present(_ dialog: Dialog, on host: DialogHost?, done: @escaping (DialogResult) -> Void) throws -> Close {
        shown += 1
        return { [weak self] gone in
            self?.closed += 1
            gone()
        }
    }
}

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
          webkit.messageHandlers.deviceRemote.postMessage({ owner: 1, method: 'hello', params: {} })
            .then(r => parent.postMessage({ frameRemote: r }, '*'));
        </script>"></iframe>
        <script>
          window.addEventListener('message', e => { if (e.data && e.data.frameRemote) window.frameRemote = e.data.frameRemote; });
        </script>
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
        // A Mac has no haptics, motion sensors or camera in the app. The
        // permissioned namespaces (#422) follow what every bridge answers;
        // notifications need an app bundle, which the test runner isn't.
        XCTAssertEqual(
            hello,
            "clipboard.readText,clipboard.writeText,clipboard.readImage,clipboard.writeImage,info,openURL,"
                + "ui.alert,ui.confirm,ui.prompt,ui.actionSheet,ui.pickDate,share,preview,"
                + "files.pick,files.export,photos.pick,sound.play,sound.player,sound.control,sound.close,"
                + "contacts.authorizationStatus,contacts.requestAuthorization,"
                + "location.authorizationStatus,location.requestAuthorization,"
                + "photos.authorizationStatus,photos.requestAuthorization,"
                + "reminders.authorizationStatus,reminders.requestAuthorization,"
                + "contacts.add,contacts.all,contacts.delete,contacts.get,contacts.search,"
                + "location.current,location.geocode,location.reverseGeocode,photos.save,"
                + "reminders.add,reminders.calendars,reminders.complete,reminders.delete,reminders.list,reminders.uncomplete,"
                + "location.watch")
        let inUI = try await eval(ui, "typeof webkit.messageHandlers.device") as? String
        XCTAssertEqual(inUI, "undefined")

        // The UI page has the remote handler, for server kernels'
        // `device` comm (ganymede-device#26): the remote subset only, and
        // not from a frame.
        let remoteHello = try await ui.callAsyncJavaScript(
            "const r = await webkit.messageHandlers.deviceRemote.postMessage({ owner: 1, method: 'hello', params: {} });"
                + " return r.result.capabilities.join(',')",
            contentWorld: .page) as? String
        XCTAssertEqual(
            remoteHello,
            "clipboard.readText,clipboard.writeText,clipboard.readImage,clipboard.writeImage,info,openURL,"
                + "ui.alert,ui.confirm,ui.prompt,ui.actionSheet,ui.pickDate,share,preview,"
                + "files.pick,files.export,photos.pick,sound.play")
        let refused = try await ui.callAsyncJavaScript(
            "const r = await webkit.messageHandlers.deviceRemote.postMessage("
                + "{ id: 1, owner: 1, method: 'sound.player', params: { data: { base64: 'AQI=' } } });"
                + " return r.error.code",
            contentWorld: .page) as? String
        XCTAssertEqual(refused, "unavailable")
        try await waitFor(ui, "!!window.frameRemote")
        let frameCode = try await eval(ui, "window.frameRemote.error && window.frameRemote.error.code") as? String
        XCTAssertEqual(frameCode, "unavailable", "a frame in the UI page can't reach the bridge")
    }

    /// When the kernel page's process dies, each kernel it ran is reported
    /// closed to the UI page, and the next start loads a new kernel page
    /// (#293).
    @MainActor
    func testAKernelPageThatDiesReportsItsKernelsClosed() async throws {
        let server = try ServerHost(config: [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ])
        defer { server.stop() }

        let host = KernelHost()
        // This test runs longer than the others, and WebKit suspends a web
        // view in no window after a few seconds, dropping the scripts sent
        // to it. The app's UI page is on screen.
        let config = WKWebViewConfiguration()
        config.preferences.inactiveSchedulingPolicy = .none
        let ui = WKWebView(frame: CGRect(x: 0, y: 0, width: 400, height: 300), configuration: config)
        host.attach(to: ui)
        host.uiWillLoad(server.url)
        ui.load(URLRequest(url: server.url))
        try await waitFor(ui, "document.readyState === 'complete' && !!window.ganymedeKernelRelay")
        // WebKit can drop the reply to a script while another page's
        // process starts or swaps, so each step runs through waitFor,
        // which tries again, and posts at most once.
        try await waitFor(ui, """
            if (!window.sent1) {
              window.sent1 = true;
              const post = m => webkit.messageHandlers.kernelRelay.postMessage(m);
              post({ kernel: 'k1', op: 'start' });
              post({ kernel: 'k2', op: 'start' });
              post({ kernel: 'k1', op: 'send', channel: 'shell', msg: { n: 1 } });
            }
            true
            """)
        try await waitFor(ui, "window.got.length >= 1")
        try await waitFor(host.webView, "window.old = true; true")

        // The process ends: its page is gone, and WebKit tells the
        // navigation delegate.
        host.webView.load(URLRequest(url: URL(string: "about:blank")!))
        try await waitFor(host.webView, "location.href === 'about:blank' && document.readyState === 'complete'")
        host.webViewWebContentProcessDidTerminate(host.webView)
        try await waitFor(ui, """
            JSON.stringify(window.got.filter(m => m.op === 'closed').map(m => m.kernel)) === '["k1","k2"]'
            """)

        // The next start loads a new kernel page, which answers.
        try await waitFor(ui, """
            if (!window.sent3) {
              window.sent3 = true;
              const post = m => webkit.messageHandlers.kernelRelay.postMessage(m);
              post({ kernel: 'k3', op: 'start' });
              post({ kernel: 'k3', op: 'send', channel: 'shell', msg: { n: 3 } });
            }
            true
            """)
        try await waitFor(ui, "window.got.some(m => m.kernel === 'k3' && m.msg && m.msg.echo === 3)")
        // Polled, as after the reload below: a script sent while the new
        // page is still loading can be dropped.
        try await waitFor(host.webView, "document.readyState === 'complete' && window.old === undefined")
    }

    /// A dialog a cell left open goes when the kernel page does.
    @MainActor
    func testResetDropsAnOpenDialog() async throws {
        let server = try ServerHost(config: [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ])
        defer { server.stop() }

        let presenter = SilentPresenter()
        let host = KernelHost(device: DeviceBridge(presenter: presenter))
        let ui = WKWebView(
            frame: CGRect(x: 0, y: 0, width: 400, height: 300), configuration: WKWebViewConfiguration())
        host.attach(to: ui)
        host.uiWillLoad(server.url)
        ui.load(URLRequest(url: server.url))
        try await waitFor(ui, "document.readyState === 'complete' && !!window.ganymedeKernelRelay")
        _ = try await eval(ui, "webkit.messageHandlers.kernelRelay.postMessage({ kernel: 'k1', op: 'start' }); true")
        try await waitFor(host.webView, "document.readyState === 'complete' && !!window.ganymedeKernelHost")

        // Never answered: only a drop ends it.
        _ = try await eval(host.webView, """
            webkit.messageHandlers.device.postMessage({ id: 1, method: 'ui.alert', params: { message: 'x' } });
            true
            """)
        let deadline = Date().addingTimeInterval(20)
        while presenter.shown == 0, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertEqual(presenter.shown, 1)
        XCTAssertEqual(presenter.closed, 0)

        host.reset()
        while presenter.closed == 0, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertEqual(presenter.closed, 1, "the reset closed the dialog")
    }
    /// A server kernel's dialog belongs to the UI page: a kernel page
    /// reload leaves it open, and only the UI page's reset closes it.
    @MainActor
    func testKernelPageReloadLeavesARemoteDialog() async throws {
        let server = try ServerHost(config: [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ])
        defer { server.stop() }

        let presenter = SilentPresenter()
        let host = KernelHost(device: DeviceBridge(presenter: presenter))
        let ui = WKWebView(
            frame: CGRect(x: 0, y: 0, width: 400, height: 300), configuration: WKWebViewConfiguration())
        host.attach(to: ui)
        host.uiWillLoad(server.url)
        ui.load(URLRequest(url: server.url))
        try await waitFor(ui, "document.readyState === 'complete' && !!window.ganymedeKernelRelay")
        _ = try await eval(ui, "webkit.messageHandlers.kernelRelay.postMessage({ kernel: 'k1', op: 'start' }); true")
        try await waitFor(host.webView, "document.readyState === 'complete' && !!window.ganymedeKernelHost")

        _ = try await eval(ui, """
            webkit.messageHandlers.deviceRemote.postMessage({ id: 1, owner: 1, method: 'ui.alert', params: { message: 'x' } });
            true
            """)
        let deadline = Date().addingTimeInterval(20)
        while presenter.shown == 0, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertEqual(presenter.shown, 1)

        _ = try await eval(host.webView, "window.reloaded = true; true")
        host.webView.reload()
        try await waitFor(host.webView, "document.readyState === 'complete' && !window.reloaded && !!window.ganymedeKernelHost")
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(presenter.closed, 0, "the kernel page's reload left the remote dialog open")

        host.reset()
        while presenter.closed == 0, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertEqual(presenter.closed, 1, "the UI page's reset closed it")
    }
    /// The bridge learns each kernel's notebook from the UI page's
    /// session and the kernel page's owner, whichever comes first; a
    /// rename carries kept answers along, folders included; a notebook's
    /// declarations ask at open for what is undecided (#383).
    @MainActor
    func testTellsTheLedgerWhichNotebookEachKernelRuns() async throws {
        let server = try ServerHost(config: [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ])
        defer { server.stop() }

        let store = MemoryLedgerStore()
        let ledger = PermissionLedger(store: store)
        let device = DeviceBridge(presenter: SilentPresenter(), ledger: ledger)
        device.addPermission("location", AlwaysGranted())
        let prompts = RecordingPresenter()
        let host = KernelHost(device: device, prompts: prompts)
        host.notebookRoot = URL(fileURLWithPath: "/root", isDirectory: true)
        let ui = WKWebView(
            frame: CGRect(x: 0, y: 0, width: 400, height: 300), configuration: WKWebViewConfiguration())
        host.attach(to: ui)
        host.uiWillLoad(server.url)
        ui.load(URLRequest(url: server.url))
        try await waitFor(ui, "document.readyState === 'complete' && !!window.ganymedeKernelRelay")
        _ = try await eval(ui, """
            const post = m => webkit.messageHandlers.kernelRelay.postMessage(m);
            post({ kernel: 'k1', op: 'start' });
            post({ kernel: 'k1', op: 'notebook', path: 'trips/Trip.ipynb' });
            true
            """)
        try await waitFor(host.webView, "document.readyState === 'complete' && !!window.ganymedeKernelHost")
        _ = try await eval(host.webView, """
            webkit.messageHandlers.kernelHost.postMessage({ kernel: 'k1', op: 'owner', owner: 7 }); true
            """)
        let deadline = Date().addingTimeInterval(20)
        while ledger.notebook(for: 7) == nil, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertEqual(ledger.notebook(for: 7), "/root/trips/Trip.ipynb")
        let forwarded = try await eval(ui, "window.got.some(m => m.op === 'owner')") as? Bool
        XCTAssertEqual(forwarded, false, "the owner goes to Swift only")

        // A folder rename moves the kernel and its kept answers.
        ledger.record(.always, notebook: "/root/trips/Trip.ipynb", capability: "location")
        _ = try await eval(ui, """
            webkit.messageHandlers.kernelRelay.postMessage({ op: 'moved', from: 'trips', to: 'travel' }); true
            """)
        while ledger.notebook(for: 7) != "/root/travel/Trip.ipynb", Date() < deadline {
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertEqual(ledger.notebook(for: 7), "/root/travel/Trip.ipynb")
        XCTAssertEqual(ledger.answer(notebook: "/root/travel/Trip.ipynb", capability: "location"), .always)
        XCTAssertNil(ledger.answer(notebook: "/root/trips/Trip.ipynb", capability: "location"))

        // Declared at open: only what this app has and nothing decided.
        _ = try await eval(ui, """
            webkit.messageHandlers.kernelRelay.postMessage(
              { op: 'declared', path: 'New.ipynb', capabilities: ['location', 'bluetooth'] });
            webkit.messageHandlers.kernelRelay.postMessage(
              { op: 'declared', path: 'travel/Trip.ipynb', capabilities: ['location'] });
            // Opened again before the person answered.
            webkit.messageHandlers.kernelRelay.postMessage(
              { op: 'declared', path: 'New.ipynb', capabilities: ['location'] });
            true
            """)
        while prompts.shown.isEmpty, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(prompts.shown.count, 1, "bluetooth isn't in this app; Trip already has an answer; New asks once")
        prompts.answer(.option(1))
        XCTAssertEqual(ledger.answer(notebook: "/root/New.ipynb", capability: "location"), .deny)
    }
}

/// A system permission that is already granted.
@MainActor
private final class AlwaysGranted: Permission {
    var status: PermissionStatus { .authorized }
    func request(_ done: @escaping @MainActor (PermissionStatus) -> Void) { done(.authorized) }
}
#endif
