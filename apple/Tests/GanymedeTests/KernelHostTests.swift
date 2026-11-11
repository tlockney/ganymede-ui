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

/// The app's kernels on a real server (ganymede#266), and a notebook page's
/// side of them: a stand-in kernel.html answers as a kernel would, and the
/// server starts, messages, restarts and stops it like any kernel. The
/// notebook page gets only the remote `device` subset, and only from its
/// main frame.
final class KernelHostTests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let web = dir.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        // The UI, with a sandboxed frame that tries the bridge itself.
        try """
        <!doctype html><title>ui</title>
        <iframe sandbox="allow-scripts" srcdoc="<script>
          webkit.messageHandlers.deviceRemote.postMessage({ owner: 1, method: 'hello', params: {} })
            .then(r => parent.postMessage({ frameRemote: r }, '*'));
        </script>"></iframe>
        <script>
          window.addEventListener('message', e => { if (e.data && e.data.frameRemote) window.frameRemote = e.data.frameRemote; });
        </script>
        """.write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        // The kernels: answer kernel_info and shutdown requests, as
        // src/kernel-host.ts's kernels do, tagged with the start's run.
        try """
        <!doctype html><title>kernels</title>
        <script>
          const post = m => webkit.messageHandlers.kernelHost.postMessage(m);
          window.log = [];
          const runs = {};
          const send = (kernel, channel, parent, type, content) => post({
            kernel, run: runs[kernel], op: 'message', channel,
            json: JSON.stringify({
              header: { msg_id: crypto.randomUUID(), msg_type: type, session: 'fake', username: '',
                        date: new Date().toISOString(), version: '5.3' },
              parent_header: parent, metadata: {}, content,
            }),
          });
          window.ganymedeKernelHost = {
            deliver(m) {
              window.log.push(m.op + ':' + m.kernel);
              if (m.op === 'start') {
                runs[m.kernel] = m.run;
                post({ kernel: m.kernel, op: 'owner', owner: 7 });
              } else if (m.op === 'stop') {
                delete runs[m.kernel];
              } else if (m.op === 'send') {
                const msg = JSON.parse(m.json);
                const type = msg.header.msg_type;
                const reply = type === 'kernel_info_request'
                  ? ['kernel_info_reply', { status: 'ok', protocol_version: '5.3', implementation: 'fake',
                      implementation_version: '1', banner: '',
                      language_info: { name: 'typescript', version: '5', file_extension: '.ts' } }]
                  : type === 'shutdown_request' ? ['shutdown_reply', { status: 'ok', restart: false }] : null;
                if (!reply) return;
                send(m.kernel, 'iopub', msg.header, 'status', { execution_state: 'busy' });
                send(m.kernel, m.channel, msg.header, reply[0], reply[1]);
                send(m.kernel, 'iopub', msg.header, 'status', { execution_state: 'idle' });
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

    private func server() throws -> ServerHost {
        try ServerHost(config: [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ])
    }

    /// A notebook page that stays scheduled though it is in no window.
    @MainActor
    private func uiView() -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.inactiveSchedulingPolicy = .none
        return WKWebView(frame: CGRect(x: 0, y: 0, width: 400, height: 300), configuration: config)
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

    /// Polls `check` until it is true.
    @MainActor
    private func eventually(_ what: String, timeout: TimeInterval = 20, _ check: () async throws -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if try await check() { return }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        XCTFail("timed out waiting for \(what)")
    }

    /// `method path` on `server` with its token; the status and body.
    private func request(
        _ server: ServerHost, _ method: String, _ path: String, _ body: String? = nil
    ) async throws -> (Int, String) {
        var parts = URLComponents(url: server.url, resolvingAgainstBaseURL: false)!
        let token = parts.queryItems?.first { $0.name == "token" }?.value ?? ""
        parts.query = nil
        parts.path = path
        var request = URLRequest(url: parts.url!)
        request.httpMethod = method
        request.setValue("token \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpBody = Data(body.utf8)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        return ((response as? HTTPURLResponse)?.statusCode ?? 0, String(decoding: data, as: UTF8.self))
    }

    /// The server starts the app's kernel for a notebook, through the kernel
    /// page, which alone has the `device` bridge; the ledger learns the
    /// notebook from the start. When the kernel page's process dies the
    /// server starts the kernel again, and a shutdown stops it.
    @MainActor
    func testRunsTheAppsKernelAsAServerKernel() async throws {
        let server = try server()
        defer { server.stop() }
        let ledger = PermissionLedger(store: MemoryLedgerStore())
        let kernels = AppKernels(device: DeviceBridge(presenter: SilentPresenter(), ledger: ledger))
        kernels.notebookRoot = dir
        try kernels.serve(server)
        let ui = uiView()
        kernels.lend(ui)
        XCTAssertTrue(kernels.webView.superview === ui)

        NSLog("KernelHostTests step: %d", 170)
        let (listed, specs) = try await request(server, "GET", "/api/kernelspecs")
        XCTAssertEqual(listed, 200)
        XCTAssertTrue(specs.contains(#""cdp-browser""#), specs)
        XCTAssertTrue(specs.contains("in app"), specs)

        NSLog("KernelHostTests step: %d", 175)
        let (created, session) = try await request(
            server, "POST", "/api/sessions",
            #"{"path": "trips/Trip.ipynb", "type": "notebook", "name": "trips/Trip.ipynb", "kernel": {"name": "cdp-browser"}}"#)
        XCTAssertEqual(created, 201, session)
        let object = try JSONSerialization.jsonObject(with: Data(session.utf8)) as? [String: Any]
        let id = try XCTUnwrap((object?["kernel"] as? [String: Any])?["id"] as? String)
        let idle = { () async throws -> Bool in
            try await self.request(server, "GET", "/api/kernels/\(id)").1.contains(#""execution_state":"idle""#)
        }
        NSLog("KernelHostTests step: %d", 184)
        try await eventually("the kernel", idle)
        XCTAssertEqual(kernels.webView.url?.path, "/kernel.html")
        NSLog("KernelHostTests step: %d", 186)
        try await eventually("the ledger's notebook") { ledger.notebook(for: 7) != nil }
        XCTAssertEqual(ledger.notebook(for: 7)?.hasSuffix("/trips/Trip.ipynb"), true, ledger.notebook(for: 7) ?? "")

        // The device bridge answers in the kernel web view, and is absent
        // from the notebook page.
        NSLog("KernelHostTests step: %d", 191)
        let hello = try await kernels.webView.callAsyncJavaScript(
            "const r = await webkit.messageHandlers.device.postMessage({ id: 1, method: 'hello', params: {} });"
                + " return r.result.capabilities.includes('info')",
            contentWorld: .page) as? Bool
        XCTAssertEqual(hello, true)
        NSLog("KernelHostTests step: %d", 196)
        let inUI = try await eval(ui, "typeof webkit.messageHandlers.device") as? String
        XCTAssertEqual(inUI, "undefined")

        // The process ends: the server starts the kernel again, on a new
        // kernel page.
        NSLog("KernelHostTests step: %d", 201)
        _ = try await eval(kernels.webView, "window.old = true; true")
        kernels.webView.load(URLRequest(url: URL(string: "about:blank")!))
        NSLog("KernelHostTests step: %d", 203)
        try await waitFor(kernels.webView, "location.href === 'about:blank' && document.readyState === 'complete'")
        kernels.webViewWebContentProcessDidTerminate(kernels.webView)
        NSLog("KernelHostTests step: %d", 205)
        try await waitFor(kernels.webView, """
            document.readyState === 'complete' && window.old === undefined && !!window.log
              && window.log.includes('start:\(id)')
            """)
        NSLog("KernelHostTests step: %d", 209)
        try await eventually("the restarted kernel", idle)

        // A shutdown asks the kernel, then stops it.
        NSLog("KernelHostTests step: %d", 212)
        let (deleted, _) = try await request(server, "DELETE", "/api/kernels/\(id)")
        XCTAssertEqual(deleted, 204)
        NSLog("KernelHostTests step: %d", 214)
        try await waitFor(kernels.webView, "window.log.includes('stop:\(id)')")
        XCTAssertFalse(server.kernels.isLive(id))
    }

    /// The notebook page gets the remote subset of `device`, not from a
    /// frame, and only its own reset closes what it opened.
    @MainActor
    func testTheNotebookPageGetsOnlyTheRemoteSubset() async throws {
        let server = try server()
        defer { server.stop() }
        let presenter = SilentPresenter()
        let host = KernelHost(device: DeviceBridge(presenter: presenter), kernels: AppKernels())
        let ui = uiView()
        host.attach(to: ui)
        host.uiWillLoad(server.url)
        ui.load(URLRequest(url: server.url))
        try await waitFor(ui, "document.readyState === 'complete'")

        let remoteHello = try await ui.callAsyncJavaScript(
            "const r = await webkit.messageHandlers.deviceRemote.postMessage({ owner: 1, method: 'hello', params: {} });"
                + " return r.result ? r.result.capabilities.join(',') : JSON.stringify(r)",
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

        // A server kernel's dialog belongs to the page: its reset closes it.
        _ = try await eval(ui, """
            webkit.messageHandlers.deviceRemote.postMessage({ id: 2, owner: 1, method: 'ui.alert', params: { message: 'x' } });
            true
            """)
        let deadline = Date().addingTimeInterval(20)
        while presenter.shown == 0, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertEqual(presenter.shown, 1)
        host.reset()
        while presenter.closed == 0, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        XCTAssertEqual(presenter.closed, 1, "the page's reset closed it")
    }

    /// A rename carries kept answers along, folders included, and the
    /// notebook a running kernel's calls count for; a notebook's
    /// declarations ask at open for what is undecided (#383).
    @MainActor
    func testRenamesAndDeclarationsReachTheLedger() async throws {
        let server = try server()
        defer { server.stop() }

        let store = MemoryLedgerStore()
        let ledger = PermissionLedger(store: store)
        let device = DeviceBridge(presenter: SilentPresenter(), ledger: ledger)
        device.addPermission("location", AlwaysGranted())
        let folderStore = MemoryFolderStore()
        let folders = FolderGrants(store: folderStore)
        device.addFolders(folders)
        let kernelLedger = PermissionLedger(store: store)
        let kernels = AppKernels(device: DeviceBridge(presenter: SilentPresenter(), ledger: kernelLedger))
        kernels.notebookRoot = URL(fileURLWithPath: "/root", isDirectory: true)
        let prompts = RecordingPresenter()
        let host = KernelHost(device: device, prompts: prompts, folders: folders, kernels: kernels)
        host.notebookRoot = URL(fileURLWithPath: "/root", isDirectory: true)
        let ui = uiView()
        host.attach(to: ui)
        host.uiWillLoad(server.url)
        ui.load(URLRequest(url: server.url))
        try await waitFor(ui, "document.readyState === 'complete'")

        // A kernel the server started for trips/Trip.ipynb, whose page said
        // its owner.
        try kernels.serve(server)
        let registered = RegisteredKernels()
        kernels.handle(.start(kernel: "k1", launch: #"{"env": {"JPY_SESSION_NAME": "trips/Trip.ipynb"}}"#), from: registered)
        try await waitFor(kernels.webView, "document.readyState === 'complete' && !!window.ganymedeKernelHost")
        try await eventually("the kernel's notebook") { kernelLedger.notebook(for: 7) != nil }
        XCTAssertEqual(kernelLedger.notebook(for: 7), "/root/trips/Trip.ipynb")

        // A folder rename moves the kernel and its kept answers, and the
        // folders of a closed notebook with no answer kept.
        ledger.record(.always, notebook: "/root/trips/Trip.ipynb", capability: "location")
        folderStore.saved = [
            FolderGrant(id: "F1", notebook: "/root/trips/Closed.ipynb", name: "Data", writable: false, bookmark: Data())
        ]
        _ = try await eval(ui, """
            webkit.messageHandlers.kernelRelay.postMessage({ op: 'moved', from: 'trips', to: 'travel' }); true
            """)
        try await eventually("the move") { kernelLedger.notebook(for: 7) == "/root/travel/Trip.ipynb" }
        XCTAssertEqual(ledger.answer(notebook: "/root/travel/Trip.ipynb", capability: "location"), .always)
        XCTAssertNil(ledger.answer(notebook: "/root/trips/Trip.ipynb", capability: "location"))
        XCTAssertEqual(folders.grants.map(\.notebook), ["/root/travel/Closed.ipynb"])

        // Declared at open: only what this app has and nothing decided.
        _ = try await eval(ui, """
            webkit.messageHandlers.kernelRelay.postMessage(
              { op: 'declared', path: 'New.ipynb', capabilities: ['location', 'motion'] });
            webkit.messageHandlers.kernelRelay.postMessage(
              { op: 'declared', path: 'travel/Trip.ipynb', capabilities: ['location'] });
            // Opened again before the person answered.
            webkit.messageHandlers.kernelRelay.postMessage(
              { op: 'declared', path: 'New.ipynb', capabilities: ['location'] });
            true
            """)
        let deadline = Date().addingTimeInterval(20)
        while prompts.shown.isEmpty, Date() < deadline { try await Task.sleep(nanoseconds: 50_000_000) }
        try await Task.sleep(nanoseconds: 200_000_000)
        XCTAssertEqual(prompts.shown.count, 1, "a Mac has no motion; Trip already has an answer; New asks once")
        prompts.answer(.option(1))
        XCTAssertEqual(ledger.answer(notebook: "/root/New.ipynb", capability: "location"), .deny)
    }

    func testReadsTheNotebookFromTheLaunch() {
        XCTAssertEqual(AppKernels.notebook(in: #"{"env": {"JPY_SESSION_NAME": "/a/b.ipynb"}}"#), "/a/b.ipynb")
        XCTAssertNil(AppKernels.notebook(in: #"{"env": {}}"#))
        XCTAssertNil(AppKernels.notebook(in: #"{"env": {"JPY_SESSION_NAME": ""}}"#))
        XCTAssertNil(AppKernels.notebook(in: "not json"))
        let page = AppKernels.kernelPageURL(URL(string: "http://127.0.0.1:8888/?token=t#x")!)
        XCTAssertEqual(page.absoluteString, "http://127.0.0.1:8888/kernel.html?token=t")
    }
}

/// A system permission that is already granted.
@MainActor
private final class AlwaysGranted: Permission {
    var status: PermissionStatus { .authorized }
    func request(_ done: @escaping @MainActor (PermissionStatus) -> Void) { done(.authorized) }
}
#endif
