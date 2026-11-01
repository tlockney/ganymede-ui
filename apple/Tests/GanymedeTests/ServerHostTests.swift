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
        XCTAssertThrowsError(try get(host.url))
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
        let items = URLComponents(url: try XCTUnwrap(landed), resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(items.first { $0.name == "open" }?.value, path)
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

    func testFailureThrowsTheServersMessage() {
        XCTAssertThrowsError(try ServerHost(config: config(["root_dir": "/no/such/dir"]))) { error in
            XCTAssertTrue(error.localizedDescription.contains("/no/such/dir"), "\(error)")
        }
    }
}
