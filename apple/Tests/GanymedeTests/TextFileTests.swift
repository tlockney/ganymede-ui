import XCTest

/// The editor's reads and writes through `/api/contents`, and the
/// language it picks for a file.
final class TextFileTests: XCTestCase {
    private let endpoint = ServerEndpoint(base: URL(string: "http://127.0.0.1:8888/base/")!, token: "t")

    func testReadsTextOrOnlyTheMetadata() throws {
        let client = TextFileClient(endpoint: endpoint, path: "moons/Io & Europa.md")
        let full = client.readRequest(content: true)
        XCTAssertEqual(full.httpMethod, "GET")
        XCTAssertEqual(full.value(forHTTPHeaderField: "Authorization"), "token t")
        let parts = try XCTUnwrap(URLComponents(url: try XCTUnwrap(full.url), resolvingAgainstBaseURL: false))
        XCTAssertEqual(parts.path, "/base/api/contents/moons/Io & Europa.md")
        XCTAssertEqual(parts.queryItems?.map(\.name), ["type", "format", "content"])
        XCTAssertEqual(parts.queryItems?.map(\.value), ["file", "text", "1"])
        let meta = client.readRequest(content: false)
        XCTAssertEqual(meta.url?.query, "content=0")
        XCTAssertEqual(client.name, "Io & Europa.md")
    }

    func testWritesTheWholeFileAsText() throws {
        let client = TextFileClient(endpoint: endpoint, path: "notes.txt")
        let request = client.writeRequest("Io\n", lastModified: "2026-11-01T08:00:00Z")
        XCTAssertEqual(request.httpMethod, "PUT")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let body = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try XCTUnwrap(request.httpBody)) as? [String: String])
        XCTAssertEqual(body, [
            "type": "file", "format": "text", "content": "Io\n", "last_modified": "2026-11-01T08:00:00Z",
        ])
        let unchecked = client.writeRequest("Io\n", lastModified: nil)
        let fields = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try XCTUnwrap(unchecked.httpBody)) as? [String: String])
        XCTAssertNil(fields["last_modified"])
    }

    func testReadsTheServersAnswer() throws {
        let ok = HTTPURLResponse(url: endpoint.base, statusCode: 200, httpVersion: nil, headerFields: nil)!
        let model = #"{"format": "text", "content": "Io", "last_modified": "2026-11-01T08:00:00Z"}"#
        XCTAssertEqual(
            try TextFileClient.snapshot(from: Data(model.utf8), response: ok, expectingText: true),
            .init(text: "Io", lastModified: "2026-11-01T08:00:00Z")
        )
        let binary = #"{"format": "base64", "content": "AAEC", "last_modified": "2026-11-01T08:00:00Z"}"#
        XCTAssertThrowsError(try TextFileClient.snapshot(from: Data(binary.utf8), response: ok, expectingText: true)) {
            XCTAssertEqual($0.localizedDescription, "This is not a text file.")
        }
        // A save's answer has no content.
        let saved = #"{"format": null, "content": null, "last_modified": "2026-11-01T08:01:00Z"}"#
        XCTAssertEqual(
            try TextFileClient.snapshot(from: Data(saved.utf8), response: ok, expectingText: false),
            .init(text: nil, lastModified: "2026-11-01T08:01:00Z")
        )
    }

    func testSaysWhatTheServerRefused() {
        func failure(_ status: Int, _ body: String) -> TextFileClient.Failure? {
            let response = HTTPURLResponse(url: endpoint.base, statusCode: status, httpVersion: nil, headerFields: nil)!
            do {
                _ = try TextFileClient.snapshot(from: Data(body.utf8), response: response, expectingText: true)
                return nil
            } catch {
                return error as? TextFileClient.Failure
            }
        }
        XCTAssertEqual(failure(404, ""), .init(message: "The file no longer exists."))
        XCTAssertEqual(failure(409, #"{"message": "Io.md changed on disk"}"#), .init(message: "Io.md changed on disk", conflict: true))
        XCTAssertEqual(failure(400, #"{"message": "Io.bin is not UTF-8 encoded"}"#), .init(message: "Io.bin is not UTF-8 encoded"))
        XCTAssertEqual(failure(500, "oops"), .init(message: "The server answered 500."))
    }

    func testPicksTheLanguageFromTheName() {
        XCTAssertEqual(TextLanguage(fileName: "orbits.py"), .python)
        XCTAssertEqual(TextLanguage(fileName: "Kernel.TS"), .typescript)
        XCTAssertEqual(TextLanguage(fileName: "App.tsx"), .tsx)
        XCTAssertEqual(TextLanguage(fileName: "app.mjs"), .javascript)
        XCTAssertEqual(TextLanguage(fileName: "README.md"), .markdown)
        XCTAssertEqual(TextLanguage(fileName: "ganymede.toml"), .toml)
        XCTAssertEqual(TextLanguage(fileName: "ci.yml"), .yaml)
        XCTAssertEqual(TextLanguage(fileName: "package.json"), .json)
        XCTAssertEqual(TextLanguage(fileName: "build.sh"), .bash)
        XCTAssertEqual(TextLanguage(fileName: ".zshrc"), .bash)
        XCTAssertNil(TextLanguage(fileName: "notes.txt"))
        XCTAssertNil(TextLanguage(fileName: "Makefile"))
    }

    /// Against the real server: read, save, and refuse to overwrite a
    /// file that changed on disk.
    func testReadsSavesAndNoticesChangesOnTheRealServer() async throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let web = dir.appendingPathComponent("web")
        let notes = dir.appendingPathComponent("files")
        try FileManager.default.createDirectory(at: web, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: notes, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        try "<!doctype html>".write(to: web.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        let file = notes.appendingPathComponent("Io & Europa.md")
        try "# Io\n".write(to: file, atomically: true, encoding: .utf8)
        let host = try ServerHost(config: [
            "root_dir": notes.path,
            "static_dir": web.path,
            "cookie_secret_file": dir.appendingPathComponent("cookie_secret").path,
            "port": 0,
        ])
        defer { host.stop() }
        let client = TextFileClient(endpoint: try XCTUnwrap(ServerEndpoint(serverURL: host.url)), path: "Io & Europa.md")

        let first = try await client.read()
        XCTAssertEqual(first.text, "# Io\n")
        let saved = try await client.write("# Io\n\nVolcanic.\n", lastModified: first.lastModified)
        XCTAssertEqual(try String(contentsOf: file, encoding: .utf8), "# Io\n\nVolcanic.\n")
        let metadata = try await client.read(content: false)
        XCTAssertNil(metadata.text)
        XCTAssertEqual(metadata.lastModified, saved.lastModified)

        // Another program writes the file a minute later.
        try "# Io\n\nTidal.\n".write(to: file, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes(
            [.modificationDate: Date().addingTimeInterval(60)], ofItemAtPath: file.path)
        let changed = try await client.read(content: false)
        XCTAssertNotEqual(changed.lastModified, saved.lastModified)
        do {
            _ = try await client.write("# Io\n\nMine.\n", lastModified: saved.lastModified)
            XCTFail("saved over a file that changed on disk")
        } catch let failure as TextFileClient.Failure {
            XCTAssertTrue(failure.conflict, failure.message)
        }
        XCTAssertEqual(try String(contentsOf: file, encoding: .utf8), "# Io\n\nTidal.\n")
    }
}
