#if os(macOS)
import DeviceBridge
import WebKit
import XCTest

/// The device handlers a window's place registers (#877): a machine's
/// window gets `deviceRemote` alone with its remote's setting on, neither
/// handler with it off, and this device's gets both. That decision is
/// `KernelHost.attach(to:place:settings:asker:)`, which is what
/// `WebViewCoordinator.makeWebView` calls; the coordinator's own page needs
/// the app's model and crash reporting, which this test bundle doesn't
/// build.
final class WindowWiringTests: XCTestCase {
    private let id = "m1"
    private var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try "<!doctype html><title>wiring</title><body>wiring</body>"
            .write(to: dir.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    private func server() throws -> ServerHost {
        try ServerHost(config: [
            "root_dir": dir.path,
            "static_dir": dir.path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ])
    }

    /// Remembers who asked, and answers nothing.
    @MainActor
    private final class AskerPresenter: DialogPresenter {
        var askers: [String?] = []
        func present(
            _ dialog: Dialog, asker: String?, on host: DialogHost?,
            done: @escaping (DialogResult) -> Void
        ) throws -> Close {
            askers.append(asker)
            return { _ in }
        }
    }

    /// A page with the handlers a window of `place` registered on it, at
    /// `url`, loaded and ready.
    @MainActor
    private func page(
        _ host: KernelHost, place: Place, settings: PlaceSettings, asker: String? = nil, at url: URL
    ) async throws -> WKWebView {
        let config = WKWebViewConfiguration()
        // The page stays scheduled though it is in no window, as
        // `KernelHostTests`' pages do.
        config.preferences.inactiveSchedulingPolicy = .none
        let view = WKWebView(frame: CGRect(x: 0, y: 0, width: 300, height: 200), configuration: config)
        host.attach(to: view, place: place, settings: settings, asker: asker)
        host.uiWillLoad(url)
        view.load(URLRequest(url: url))
        // The title, not just `readyState`: a web view starts on an
        // about:blank page, already complete, so that alone would return
        // before the server's page committed.
        try await waitFor(view, "document.title === 'wiring' && document.readyState === 'complete'")
        return view
    }

    /// Whether the page has message handler `name`: WebKit's own answer,
    /// not a record of what the app meant to add. A page still settling
    /// refuses a script once in a while, so the answer is asked until one
    /// comes.
    @MainActor
    private func handler(_ name: String, in view: WKWebView) async throws -> String {
        var kind = "missing"
        try await eventually("the \(name) handler") {
            // Optional chaining throughout: a window with no handlers at
            // all has no `window.webkit` either, and `typeof` of a failed
            // chain is "undefined" rather than the TypeError that naming
            // the missing object outright would throw.
            if let answer = (try? await view.evaluateJavaScript(
                "typeof window.webkit?.messageHandlers?.\(name)")) as? String {
                kind = answer
            }
            return kind != "missing"
        }
        return kind
    }

    /// Polls `script` in `view` until it is true.
    @MainActor
    private func waitFor(_ view: WKWebView, _ script: String, timeout: TimeInterval = 20) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if (try? await view.evaluateJavaScript(script)) as? Bool == true { return }
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

    /// A machine's window with its setting on (#877): the remote subset of
    /// `device` alone. The ledger's `kernelRelay` and the full bridge are
    /// the other places' to take, so a machine's page never sees them.
    @MainActor
    func testAMachinesWindowWithItsSettingOnGetsTheRemoteHandlerAlone() async throws {
        let server = try server()
        defer { server.stop() }
        let host = KernelHost(device: DeviceBridge(presenter: AskerPresenter()), kernels: AppKernels())
        let view = try await page(
            host, place: .machine(id), settings: PlaceSettings(sharesName: true, usesDevice: true),
            asker: Place.machine(id).asker { _ in "mini" }, at: server.url)
        let remote = try await handler("deviceRemote", in: view)
        XCTAssertEqual(remote, "object")
        for name in ["kernelRelay", "device"] {
            let kind = try await handler(name, in: view)
            XCTAssertEqual(kind, "undefined", "a machine's window has no \(name)")
        }
    }

    /// A machine's window with its setting off gets neither: its notebooks
    /// may not use this device until the person says so.
    @MainActor
    func testAMachinesWindowWithItsSettingOffGetsNeitherHandler() async throws {
        let server = try server()
        defer { server.stop() }
        let host = KernelHost(device: DeviceBridge(presenter: AskerPresenter()), kernels: AppKernels())
        let view = try await page(
            host, place: .machine(id), settings: PlaceSettings(sharesName: true, usesDevice: false),
            asker: Place.machine(id).asker { _ in "mini" }, at: server.url)
        for name in ["deviceRemote", "kernelRelay", "device"] {
            let kind = try await handler(name, in: view)
            XCTAssertEqual(kind, "undefined", name)
        }
    }

    /// This device's window gets both, whatever its settings say: the
    /// ledger's handler and the remote subset.
    @MainActor
    func testThisDevicesWindowGetsBothHandlers() async throws {
        let server = try server()
        defer { server.stop() }
        let host = KernelHost(device: DeviceBridge(presenter: AskerPresenter()), kernels: AppKernels())
        let view = try await page(
            host, place: .thisDevice, settings: PlaceSettings(sharesName: true, usesDevice: false),
            at: server.url)
        for name in ["deviceRemote", "kernelRelay"] {
            let kind = try await handler(name, in: view)
            XCTAssertEqual(kind, "object", name)
        }
    }

    /// This Mac's own server's window gets both, as this device's does,
    /// whatever its settings say, and its dialogs ask as this device's: the
    /// server was verified, so its cells are this Mac's own processes
    /// (#883).
    @MainActor
    func testThisMacsWindowGetsBothHandlersAndAsksAsThisDevice() async throws {
        let server = try server()
        defer { server.stop() }
        let presenter = AskerPresenter()
        let host = KernelHost(device: DeviceBridge(presenter: presenter), kernels: AppKernels())
        let view = try await page(
            host, place: .thisMac(id), settings: PlaceSettings(sharesName: true, usesDevice: false),
            asker: Place.thisMac(id).asker { _ in "mini" }, at: server.url)
        for name in ["deviceRemote", "kernelRelay"] {
            let kind = try await handler(name, in: view)
            XCTAssertEqual(kind, "object", name)
        }
        _ = try await view.evaluateJavaScript("""
            webkit.messageHandlers.deviceRemote.postMessage(
                { id: 1, owner: 1, method: 'ui.alert', params: { message: 'x' } });
            true
            """)
        try await eventually("the dialog") { !presenter.askers.isEmpty }
        XCTAssertEqual(presenter.askers, [nil])
    }

    /// This Mac's server is gone from a window that has it open (#883): the
    /// page keeps what it has — the web view isn't made again, so its
    /// unsaved edits stay — while the ledger's relay goes and what the page
    /// asks answers as a machine's window's would, naming the machine.
    @MainActor
    func testADowngradeTakesThisMacsHandlersAwayInPlace() async throws {
        let server = try server()
        defer { server.stop() }
        let presenter = AskerPresenter()
        let host = KernelHost(device: DeviceBridge(presenter: presenter), kernels: AppKernels())
        let view = try await page(
            host, place: .thisMac(id), settings: PlaceSettings(sharesName: true, usesDevice: false),
            at: server.url)
        for name in ["deviceRemote", "kernelRelay"] {
            let kind = try await handler(name, in: view)
            XCTAssertEqual(kind, "object", name)
        }
        // Something the page holds in memory: a page loaded again would lose
        // it, and its unsaved edits with it.
        _ = try await view.evaluateJavaScript("window.kept = 'not reloaded'; true")
        host.downgrade(to: view, asker: "mini")
        let relay = try await handler("kernelRelay", in: view)
        XCTAssertEqual(relay, "undefined")
        let remote = try await handler("deviceRemote", in: view)
        XCTAssertEqual(remote, "object")
        let kept = try await view.evaluateJavaScript("window.kept") as? String
        XCTAssertEqual(kept, "not reloaded")
        // The bridge's remote handler answers as a machine's: the dialog
        // says where the cell runs.
        _ = try await view.evaluateJavaScript("""
            webkit.messageHandlers.deviceRemote.postMessage(
                { id: 1, owner: 1, method: 'ui.alert', params: { message: 'x' } });
            true
            """)
        try await eventually("the dialog") { !presenter.askers.isEmpty }
        XCTAssertEqual(presenter.askers, ["mini"])
    }

    /// A machine's dialogs always say where the cell runs (#877): the
    /// app's name for the machine, or "another computer" when it has none
    /// (a remote removed while its window was open), never as if the cell
    /// were this device's own.
    @MainActor
    func testAMachinesDialogsAskAsItsNameOrAnotherComputer() async throws {
        let server = try server()
        defer { server.stop() }
        for name in ["mini", nil] as [String?] {
            let presenter = AskerPresenter()
            let host = KernelHost(device: DeviceBridge(presenter: presenter), kernels: AppKernels())
            let view = try await page(
                host, place: .machine(id), settings: PlaceSettings(sharesName: true, usesDevice: true),
                asker: Place.machine(id).asker { _ in name }, at: server.url)
            // The page's own word, as a cell's would be: the handler answers
            // a promise, so the post is awaited by the page, not here.
            _ = try await view.evaluateJavaScript("""
                webkit.messageHandlers.deviceRemote.postMessage(
                    { id: 1, owner: 1, method: 'ui.alert', params: { message: 'x' } });
                true
                """)
            try await eventually("the dialog") { !presenter.askers.isEmpty }
            XCTAssertEqual(presenter.askers, [name ?? "another computer"])
        }
    }
}
#endif
