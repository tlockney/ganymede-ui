import XCTest

/// ServerHost against the real static library: start, serve, stop.
final class ServerHostTests: XCTestCase {
    private var dir: URL!

    override func setUpWithError() throws {
        dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let web = dir.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try "<!doctype html><title>ganymede-ui test</title>"
            .write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dir)
    }

    private func config(_ extra: [String: Any] = [:]) -> [String: Any] {
        [
            "root_dir": dir.path,
            "static_dir": dir.appendingPathComponent("web").path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ].merging(extra) { $1 }
    }

    /// GETs `url`.
    private func get(_ url: URL) throws -> (Int, String) {
        var result: Result<(Int, String), Error>?
        let done = expectation(description: url.absoluteString)
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error {
                result = .failure(error)
            } else {
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                result = .success((status, String(decoding: data ?? Data(), as: UTF8.self)))
            }
            done.fulfill()
        }.resume()
        wait(for: [done], timeout: 10)
        return try XCTUnwrap(result).get()
    }

    func testServesTheWebAppAndStops() throws {
        let host = try ServerHost(config: config())
        XCTAssertEqual(host.url.host, "127.0.0.1")
        XCTAssertNotNil(host.url.query?.range(of: "token="))
        // The token becomes a cookie and the page loads, as in the app.
        let (status, body) = try get(host.url)
        XCTAssertEqual(status, 200)
        XCTAssertTrue(body.contains("ganymede-ui test"), body)
        host.stop()
        // A plain connect, not a request: on the iOS simulator URLSession
        // can call back more than 10 s after a refused connection, even
        // past its own timeout (#175).
        let port = try XCTUnwrap(host.url.port)
        XCTAssertFalse(accepts(port), "still listening on \(port) after stop()")
    }

    /// Whether 127.0.0.1 accepts a TCP connection on `port`. With nothing
    /// listening, connect fails at once with ECONNREFUSED.
    private func accepts(_ port: Int) -> Bool {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = in_port_t(UInt16(port).bigEndian)
        address.sin_addr.s_addr = inet_addr("127.0.0.1")
        return withUnsafePointer(to: &address) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) == 0
            }
        }
    }

    /// The app tells the page where kernels run with `kernels=` next to
    /// the token; the server's login redirect drops only the token.
    func testLoginRedirectKeepsTheKernelsParameter() throws {
        let host = try ServerHost(config: config())
        defer { host.stop() }
        var parts = URLComponents(url: host.url, resolvingAgainstBaseURL: false)!
        parts.queryItems = (parts.queryItems ?? []) + [URLQueryItem(name: "kernels", value: "page")]
        var landed: URL?
        let done = expectation(description: "redirect")
        URLSession.shared.dataTask(with: parts.url!) { _, response, _ in
            landed = response?.url
            done.fulfill()
        }.resume()
        wait(for: [done], timeout: 10)
        XCTAssertEqual(landed?.query, "kernels=page")
    }

    /// The Mac app serves `/` and opens a window's notebook by its absolute
    /// path (`WindowTarget`): the login redirect keeps `open`, and the
    /// contents API finds the file under that path.
    func testServesNotebooksByAbsolutePathFromTheRoot() throws {
        let notebook = dir.appendingPathComponent("Io & Europa+.ipynb")
        try #"{"cells": [], "metadata": {}, "nbformat": 4, "nbformat_minor": 5}"#
            .write(to: notebook, atomically: true, encoding: .utf8)
        let host = try ServerHost(config: config(["root_dir": "/"]))
        defer { host.stop() }
        let path = notebook.resolvingSymlinksInPath().path
        let page = WindowTarget.file(URL(fileURLWithPath: path)).pageURL(server: host.url, kernels: "server")

        var landed: URL?
        let done = expectation(description: "redirect")
        URLSession.shared.dataTask(with: page) { _, response, _ in
            landed = response?.url
            done.fulfill()
        }.resume()
        wait(for: [done], timeout: 10)
        // The redirect form-encodes the query (space as `+`); the page reads
        // it with URLSearchParams, so decode it the same way.
        let items = URLComponents(url: try XCTUnwrap(landed), resolvingAgainstBaseURL: false)?
            .percentEncodedQueryItems ?? []
        let open = items.first { $0.name == "open" }?.value?
            .replacingOccurrences(of: "+", with: " ").removingPercentEncoding
        XCTAssertEqual(open, path)
        XCTAssertNil(items.first { $0.name == "token" })

        let token = try XCTUnwrap(
            URLComponents(url: host.url, resolvingAgainstBaseURL: false)?
                .queryItems?.first { $0.name == "token" }?.value
        )
        var contents = URLComponents(url: host.url, resolvingAgainstBaseURL: false)!
        contents.query = nil
        contents.path = "/api/contents" + path
        var request = URLRequest(url: contents.url!)
        request.setValue("token \(token)", forHTTPHeaderField: "Authorization")
        var status = 0
        var body = ""
        let fetched = expectation(description: "contents")
        URLSession.shared.dataTask(with: request) { data, response, _ in
            status = (response as? HTTPURLResponse)?.statusCode ?? 0
            body = String(decoding: data ?? Data(), as: UTF8.self)
            fetched.fulfill()
        }.resume()
        wait(for: [fetched], timeout: 10)
        XCTAssertEqual(status, 200, body)
        XCTAssertTrue(body.contains(#""type":"notebook""#), body)
    }

    /// A server whose kernels run on another one (`gateway_url`), here a
    /// second in-process server.
    func testKernelServerConfigIsAccepted() throws {
        let remote = try ServerHost(config: config(["token": "remote"]))
        defer { remote.stop() }
        var base = URLComponents(url: remote.url, resolvingAgainstBaseURL: false)!
        base.query = nil
        let local = try ServerHost(config: config([
            "gateway_url": base.url!.absoluteString,
            "gateway_token": "remote",
            "cookie_secret_file": dir.appendingPathComponent("local_secret").path,
        ]))
        defer { local.stop() }
        var specs = local.url
        specs.appendPathComponent("api/kernelspecs")
        let (status, body) = try get(specs)
        XCTAssertEqual(status, 200, body)
        XCTAssertTrue(body.contains("kernelspecs"), body)
    }

    /// `method path` with `body` and the server's token; the status and body.
    private func request(_ host: ServerHost, _ method: String, _ path: String, _ body: String? = nil) throws -> (Int, String) {
        var parts = URLComponents(url: host.url, resolvingAgainstBaseURL: false)!
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
        var result: Result<(Int, String), Error>?
        let done = expectation(description: "\(method) \(path)")
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error {
                result = .failure(error)
            } else {
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                result = .success((status, String(decoding: data ?? Data(), as: UTF8.self)))
            }
            done.fulfill()
        }.resume()
        wait(for: [done], timeout: 10)
        return try XCTUnwrap(result).get()
    }

    /// Polls `check` until it is true.
    private func eventually(_ what: String, timeout: TimeInterval = 20, _ check: () throws -> Bool) rethrows {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if try check() { return }
            Thread.sleep(forTimeInterval: 0.1)
        }
        XCTFail("timed out waiting for \(what)")
    }

    /// A kernel the app registers (ganymede#266): the server starts it with
    /// the notebook's path, messages it, restarts it when the system ends
    /// it, and stops it; nothing from a stopped run gets through.
    func testRunsAKernelTheAppRegisters() throws {
        let host = try ServerHost(config: config())
        defer { host.stop() }
        let app = FakeAppKernel()
        try host.register(spec: ["name": "app-ts", "display_name": "TypeScript (in app)", "language": "typescript"]) {
            event, kernels in app.handle(event, kernels)
        }
        XCTAssertThrowsError(try host.register(spec: ["name": "app-ts"]) { _, _ in }, "a name registers once")

        let (listed, specs) = try request(host, "GET", "/api/kernelspecs")
        XCTAssertEqual(listed, 200)
        XCTAssertTrue(specs.contains(#""app-ts""#), specs)

        let (created, session) = try request(
            host, "POST", "/api/sessions",
            #"{"path": "Trip.ipynb", "type": "notebook", "name": "Trip.ipynb", "kernel": {"name": "app-ts"}}"#)
        XCTAssertEqual(created, 201, session)
        let object = try JSONSerialization.jsonObject(with: Data(session.utf8)) as? [String: Any]
        let id = try XCTUnwrap((object?["kernel"] as? [String: Any])?["id"] as? String)
        let idle: () throws -> Bool = {
            try self.request(host, "GET", "/api/kernels/\(id)").1.contains(#""execution_state":"idle""#)
        }
        try eventually("the kernel", idle)
        XCTAssertEqual(app.starts.count, 1)
        XCTAssertTrue(AppKernels.notebook(in: app.starts[0])?.hasSuffix("Trip.ipynb") == true, app.starts[0])
        XCTAssertTrue(host.kernels.isLive(id))

        // The system ends it: the server starts it again, under the same id.
        let first = try XCTUnwrap(app.run(of: id))
        host.kernels.ended(id, run: first, reason: "lost")
        // Not `isLive`: the server may already have restarted it on its
        // own thread. The ended run takes nothing either way.
        XCTAssertFalse(host.kernels.deliver(id, run: first, channel: "iopub", message: FakeAppKernel.status(id, "busy")),
                       "the ended run takes nothing")
        eventually("the restart") { app.starts.count == 2 }
        try eventually("the restarted kernel", idle)
        // A late message from the first run doesn't reach the second.
        let second = try XCTUnwrap(app.run(of: id))
        XCTAssertNotEqual(first, second)
        XCTAssertFalse(host.kernels.deliver(id, run: first, channel: "iopub", message: FakeAppKernel.status(id, "busy")),
                       "the first run takes nothing more")
        host.kernels.ended(id, run: first, reason: "exited")
        XCTAssertTrue(host.kernels.isLive(id), "the first run's end doesn't end the second")

        let (deleted, _) = try request(host, "DELETE", "/api/kernels/\(id)")
        XCTAssertEqual(deleted, 204)
        XCTAssertEqual(app.stops, [id])
        XCTAssertFalse(host.kernels.isLive(id))
        XCTAssertFalse(host.kernels.deliver(id, run: second, channel: "iopub", message: FakeAppKernel.status(id, "idle")),
                       "a stopped kernel takes nothing more")
    }

    func testFailureThrowsTheServersMessage() {
        XCTAssertThrowsError(try ServerHost(config: config(["root_dir": "/no/such/dir"]))) { error in
            XCTAssertTrue(error.localizedDescription.contains("/no/such/dir"), "\(error)")
        }
    }
}

/// Answers kernel_info and shutdown requests on a background queue, as the
/// app's kernel page does through the main thread.
private final class FakeAppKernel: @unchecked Sendable {
    private let lock = NSLock()
    private var _starts: [String] = []
    private var _stops: [String] = []
    private var runs: [String: Int] = [:]
    var starts: [String] { lock.withLock { _starts } }
    func run(of kernel: String) -> Int? { lock.withLock { runs[kernel] } }
    var stops: [String] { lock.withLock { _stops } }
    private let queue = DispatchQueue(label: "fake-app-kernel")

    func handle(_ event: KernelEvent, _ kernels: RegisteredKernels) {
        switch event {
        case .start(let kernel, let run, let launch):
            lock.withLock {
                _starts.append(launch)
                runs[kernel] = run
            }
        case .stop(let kernel):
            lock.withLock { _stops.append(kernel) }
        case .send(let kernel, let channel, let message):
            guard let request = try? JSONSerialization.jsonObject(with: Data(message.utf8)) as? [String: Any],
                  let header = request["header"] as? [String: Any],
                  let type = header["msg_type"] as? String
            else { return }
            guard let run = self.run(of: kernel) else { return }
            let reply: (String, [String: Any])
            switch type {
            case "kernel_info_request":
                reply = ("kernel_info_reply", [
                    "status": "ok", "protocol_version": "5.3", "implementation": "fake",
                    "implementation_version": "1", "banner": "",
                    "language_info": ["name": "typescript", "version": "5", "file_extension": ".ts"],
                ])
            case "shutdown_request":
                reply = ("shutdown_reply", ["status": "ok", "restart": false])
            default:
                return
            }
            queue.async {
                kernels.deliver(kernel, run: run, channel: "iopub", message: Self.status(kernel, "busy", parent: header))
                kernels.deliver(kernel, run: run, channel: channel,
                                message: Self.message(reply.0, reply.1, parent: header))
                kernels.deliver(kernel, run: run, channel: "iopub", message: Self.status(kernel, "idle", parent: header))
            }
        }
    }

    static func status(_ kernel: String, _ state: String, parent: [String: Any] = [:]) -> String {
        message("status", ["execution_state": state], parent: parent)
    }

    static func message(_ type: String, _ content: [String: Any], parent: [String: Any]) -> String {
        let message: [String: Any] = [
            "header": [
                "msg_id": UUID().uuidString, "msg_type": type, "session": "fake", "username": "",
                "date": "2026-11-10T00:00:00Z", "version": "5.3",
            ],
            "parent_header": parent,
            "metadata": [String: Any](),
            "content": content,
        ]
        let data = try! JSONSerialization.data(withJSONObject: message)
        return String(decoding: data, as: UTF8.self)
    }
}
