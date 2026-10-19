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

    func testFailureThrowsTheServersMessage() {
        XCTAssertThrowsError(try ServerHost(config: config(["root_dir": "/no/such/dir"]))) { error in
            XCTAssertTrue(error.localizedDescription.contains("/no/such/dir"), "\(error)")
        }
    }
}
