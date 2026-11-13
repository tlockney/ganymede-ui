#if os(macOS)
import XCTest

/// The Mac app's default host API read grant (#585): the folders in
/// Settings, not the whole disk its `/` root would give.
final class HostDefaultsTests: XCTestCase {
    func testTheDefaultReadIsTheSettingsFolders() {
        let folders = [
            URL(fileURLWithPath: "/Users/a/Notes", isDirectory: true),
            URL(fileURLWithPath: "/Volumes/X/../X/Lab/", isDirectory: true),
        ]
        XCTAssertEqual(HostDefaults.serverConfig(folders: folders)["read"] as? [String], ["Users/a/Notes", "Volumes/X/Lab"])
        XCTAssertEqual(HostDefaults.serverConfig(folders: [])["read"] as? [String], [], "no folders: a notebook reads only itself")
    }

    func testTheServerTakesItAsItsDefault() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: dir) }
        let web = dir.appendingPathComponent("web")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try "<!doctype html>".write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        let notebook = #"{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}"#
        try notebook.write(to: dir.appendingPathComponent("a.ipynb"), atomically: true, encoding: .utf8)
        let host = try ServerHost(config: [
            "root_dir": dir.path,
            "static_dir": web.path,
            "token": "secret",
            "quiet": true,
            "port": 0,
            "host": HostDefaults.serverConfig(folders: [URL(fileURLWithPath: "/Notes", isDirectory: true)]),
        ])
        defer { host.stop() }
        var parts = try XCTUnwrap(URLComponents(url: host.url, resolvingAgainstBaseURL: false))
        parts.query = nil
        parts.path = "/api/host/grants/a.ipynb"
        var request = URLRequest(url: try XCTUnwrap(parts.url))
        request.setValue("token secret", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200, String(decoding: data, as: UTF8.self))
        let answer = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let defaults = try XCTUnwrap(answer["defaults"] as? [String: Any])
        XCTAssertEqual(defaults["read"] as? [String], ["Notes"])
    }
}
#endif
