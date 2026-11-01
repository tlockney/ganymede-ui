import XCTest

/// Which page a notebook or folder window loads.
final class WindowTargetTests: XCTestCase {
    private let server = URL(string: "http://127.0.0.1:8123/?token=abc")!

    private func query(_ url: URL) -> [String: String] {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
    }

    func testANotebookOpensByItsAbsolutePath() {
        let target = WindowTarget.file(URL(fileURLWithPath: "/Users/me/Moons & rings/Io+Europa.ipynb"))
        let page = target.pageURL(server: server, kernels: "server")
        XCTAssertEqual(page.host, "127.0.0.1")
        XCTAssertEqual(page.port, 8123)
        XCTAssertEqual(
            query(page),
            ["token": "abc", "kernels": "server", "open": "/Users/me/Moons & rings/Io+Europa.ipynb"]
        )
        XCTAssertFalse(page.absoluteString.contains("Io+Europa"), page.absoluteString)
        XCTAssertEqual(target.title, "Io+Europa")
    }

    func testEncodesNonASCIINames() {
        let target = WindowTarget.file(URL(fileURLWithPath: "/Users/me/Lunes/Ío.ipynb"))
        let page = target.pageURL(server: server, kernels: "server")
        XCTAssertEqual(query(page)["open"], target.url.path)
        XCTAssertTrue(page.absoluteString.allSatisfy(\.isASCII), page.absoluteString)
    }

    func testAFolderOpensAsTheSidebarFolder() {
        let target = WindowTarget.folder(URL(fileURLWithPath: "/Users/me/notes", isDirectory: true))
        XCTAssertEqual(
            query(target.pageURL(server: server, kernels: "server")),
            ["token": "abc", "kernels": "server", "dir": "/Users/me/notes"]
        )
        XCTAssertEqual(target.title, "notes")
    }

    func testOpeningTellsFoldersFromFiles() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appendingPathComponent("Io.ipynb")
        try "{}".write(to: file, atomically: true, encoding: .utf8)

        XCTAssertEqual(WindowTarget(opening: dir), .folder(dir.standardizedFileURL))
        XCTAssertEqual(WindowTarget(opening: file), .file(file.standardizedFileURL))
    }

    func testSurvivesStateRestoration() throws {
        let target = WindowTarget.file(URL(fileURLWithPath: "/tmp/Io.ipynb"))
        let data = try JSONEncoder().encode(target)
        XCTAssertEqual(try JSONDecoder().decode(WindowTarget.self, from: data), target)
    }
}
