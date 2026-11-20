import XCTest

/// Which page a notebook or folder window loads.
final class WindowTargetTests: XCTestCase {
    private let server = URL(string: "http://127.0.0.1:8123/?token=abc")!

    private func query(_ url: URL) -> [String: String] {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(uniqueKeysWithValues: items.map { ($0.name, $0.value ?? "") })
    }

    func testTheFolderOfATarget() {
        let notebook = WindowTarget.file(URL(fileURLWithPath: "/Users/me/work/a.ipynb"))
        XCTAssertEqual(notebook.folder.path, "/Users/me/work")
        let folder = WindowTarget.folder(URL(fileURLWithPath: "/Users/me/work", isDirectory: true))
        XCTAssertEqual(folder.folder.path, "/Users/me/work")
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

    func testNativeChromeAsksThePageToHideItsOwn() {
        let target = WindowTarget.folder(URL(fileURLWithPath: "/Users/me/notes", isDirectory: true))
        XCTAssertEqual(
            query(target.pageURL(server: server, kernels: "server", nativeChrome: true)),
            ["token": "abc", "kernels": "server", "dir": "/Users/me/notes", "chrome": "native"]
        )
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

    func testFollowsTheNotebookThePageShows() {
        // As the page writes it with URLSearchParams: relative to `/`,
        // `/` as %2F and a space as +.
        let page = URL(string: "http://127.0.0.1:8123/?open=Users%2Fme%2FMoons+%26+rings%2FIo%2BEuropa.ipynb")!
        XCTAssertEqual(
            WindowTarget(page: page),
            .file(URL(fileURLWithPath: "/Users/me/Moons & rings/Io+Europa.ipynb"))
        )
        // The page this app loads reads back as the same notebook.
        let target = WindowTarget.file(URL(fileURLWithPath: "/Users/me/Lunes/Ío & co.ipynb"))
        XCTAssertEqual(WindowTarget(page: target.pageURL(server: server, kernels: "server")), target)
    }

    func testFollowsTheFolderThePageShows() {
        // No notebook open: the sidebar's folder, from `dir=` (#220).
        XCTAssertEqual(
            WindowTarget(page: URL(string: "http://127.0.0.1:8123/?dir=Users%2Fme%2FMoons+%26+rings")!),
            .folder(URL(fileURLWithPath: "/Users/me/Moons & rings", isDirectory: true))
        )
        XCTAssertEqual(
            WindowTarget(page: URL(string: "http://127.0.0.1:8123/?kernels=server&dir=%2FUsers%2Fme%2F")!),
            .folder(URL(fileURLWithPath: "/Users/me", isDirectory: true))
        )
        // `open=` wins over `dir=`.
        XCTAssertEqual(
            WindowTarget(page: URL(string: "http://127.0.0.1:8123/?dir=Users&open=Users%2FIo.ipynb")!),
            .file(URL(fileURLWithPath: "/Users/Io.ipynb"))
        )
        // Neither: the server's root.
        XCTAssertEqual(
            WindowTarget(page: URL(string: "http://127.0.0.1:8123/")!),
            .folder(URL(fileURLWithPath: "/", isDirectory: true))
        )
        XCTAssertEqual(
            WindowTarget(page: URL(string: "http://127.0.0.1:8123/?dir=")!),
            .folder(URL(fileURLWithPath: "/", isDirectory: true))
        )
        // Not the app's page: a file a link in an output opened, or an
        // error page. The window keeps what it shows.
        XCTAssertNil(WindowTarget(page: URL(string: "http://127.0.0.1:8123/files/report.html")!))
        XCTAssertNil(WindowTarget(page: URL(string: "http://127.0.0.1:8123/api/contents?dir=Users")!))
        // A folder window's page reads back as the same folder.
        let target = WindowTarget.folder(URL(fileURLWithPath: "/Users/me/Lunes & co", isDirectory: true))
        XCTAssertEqual(WindowTarget(page: target.pageURL(server: server, kernels: "server")), target)
    }

    func testSurvivesStateRestoration() throws {
        let target = WindowTarget.file(URL(fileURLWithPath: "/tmp/Io.ipynb"))
        let data = try JSONEncoder().encode(target)
        XCTAssertEqual(try JSONDecoder().decode(WindowTarget.self, from: data), target)
    }

    func testSavedForSceneStorageRoundTrips() {
        let file = WindowTarget.file(URL(fileURLWithPath: "/Users/me/a b.ipynb"))
        let folder = WindowTarget.folder(URL(fileURLWithPath: "/Users/me/notebooks", isDirectory: true))
        XCTAssertEqual(WindowTarget(saved: WindowTarget.saved(file)), file)
        XCTAssertEqual(WindowTarget(saved: WindowTarget.saved(folder)), folder)
        XCTAssertEqual(WindowTarget.saved(nil), "")
        XCTAssertNil(WindowTarget(saved: ""))
        XCTAssertNil(WindowTarget(saved: "not json"))
    }

    // MARK: DuckDB console tabs (#729)

    private let consoleFolder = URL(fileURLWithPath: "/Users/me/work", isDirectory: true)

    func testAConsoleIsAWindowOfItsOwn() {
        let first = WindowTarget.console(folder: consoleFolder, id: UUID())
        let second = WindowTarget.console(folder: consoleFolder, id: UUID())
        // Opening by value brings forward an equal value: each console must differ.
        XCTAssertNotEqual(first, second)
        XCTAssertEqual(first.place, .thisDevice)
        XCTAssertEqual(first.folder.path, "/Users/me/work")
        XCTAssertEqual(first.url.path, "/Users/me/work")
    }

    func testAConsoleTabIsTitledWithItsFolder() {
        XCTAssertEqual(WindowTarget.console(folder: consoleFolder, id: UUID()).title, "DuckDB · work")
        let root = URL(fileURLWithPath: "/", isDirectory: true)
        XCTAssertEqual(WindowTarget.console(folder: root, id: UUID()).title, "DuckDB · /")
    }

    func testAConsoleLoadsTheDuckDBPageForItsFolder() {
        let target = WindowTarget.console(folder: consoleFolder, id: UUID())
        XCTAssertEqual(
            query(target.pageURL(server: server, kernels: "server", nativeChrome: true)),
            [
                "token": "abc", "kernels": "server", "dir": "/Users/me/work",
                "console": "duckdb", "chrome": "native",
            ]
        )
    }

    func testTheConsolePageReadsBackAsTheSameConsole() throws {
        let target = WindowTarget.console(folder: consoleFolder, id: UUID())
        let read = try XCTUnwrap(
            WindowTarget(page: target.pageURL(server: server, kernels: "server", nativeChrome: true)))
        guard case .console(let folder, _) = read else { return XCTFail("not a console: \(read)") }
        XCTAssertEqual(folder.path, "/Users/me/work")
        // The page doesn't know the tab's id: the tab still shows it.
        XCTAssertTrue(target.shows(read))
        XCTAssertNotEqual(target, read)
        // Another folder's console, or a notebook, is not the one shown.
        let other = WindowTarget.console(folder: URL(fileURLWithPath: "/Users/me/play", isDirectory: true), id: UUID())
        XCTAssertFalse(target.shows(other))
        XCTAssertFalse(target.shows(.folder(consoleFolder)))
        // As the page writes it (form-encoded, relative to `/`), and for the root.
        let page = URL(string: "http://127.0.0.1:8123/?dir=Users%2Fme%2Fmy+work&console=duckdb")!
        guard case .console(let spaced, _)? = WindowTarget(page: page) else { return XCTFail("not a console") }
        XCTAssertEqual(spaced.path, "/Users/me/my work")
        guard case .console(let root, _)? = WindowTarget(page: URL(string: "http://127.0.0.1:8123/?console=duckdb")!)
        else { return XCTFail("not a console") }
        XCTAssertEqual(root.path, "/")
        // Any other value of `console` is no console.
        XCTAssertEqual(
            WindowTarget(page: URL(string: "http://127.0.0.1:8123/?dir=Users&console=sql")!),
            .folder(URL(fileURLWithPath: "/Users", isDirectory: true)))
    }

    func testOnlyAMatchingWindowShowsAPlainTarget() {
        let file = WindowTarget.file(URL(fileURLWithPath: "/tmp/a.ipynb"))
        XCTAssertTrue(file.shows(file))
        XCTAssertFalse(file.shows(.file(URL(fileURLWithPath: "/tmp/b.ipynb"))))
    }

    func testAConsoleSurvivesRestorationWithItsFolder() throws {
        let target = WindowTarget.console(folder: consoleFolder, id: UUID())
        XCTAssertEqual(WindowTarget(saved: WindowTarget.saved(target)), target)
        let data = try JSONEncoder().encode(target)
        XCTAssertEqual(try JSONDecoder().decode(WindowTarget.self, from: data), target)
    }

    func testTheOpenTabMessage() {
        XCTAssertEqual(TabRequest(body: ["path": "Users/me/a.ipynb"]), .file(path: "Users/me/a.ipynb"))
        XCTAssertEqual(
            TabRequest(body: ["console": "duckdb", "folder": "Users/me"]), .duckdbConsole(folder: "Users/me"))
        XCTAssertEqual(TabRequest(body: ["console": "duckdb"]), .duckdbConsole(folder: ""))
        XCTAssertNil(TabRequest(body: ["console": "python", "folder": "Users"]))
        XCTAssertNil(TabRequest(body: ["path": ""]))
        XCTAssertNil(TabRequest(body: ["path": 3]))
        XCTAssertNil(TabRequest(body: ["folder": "Users"]))
        XCTAssertNil(TabRequest(body: "Users/me/a.ipynb"))
    }

    func testAnOpenTabRequestBecomesAWindowOnTheServersRoot() throws {
        let root = URL(fileURLWithPath: "/", isDirectory: true)
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appendingPathComponent("Io.ipynb")
        try "{}".write(to: file, atomically: true, encoding: .utf8)
        let relative = String(file.standardizedFileURL.path.drop { $0 == "/" })

        XCTAssertEqual(TabRequest.file(path: relative).target(root: root), .file(file.standardizedFileURL))

        // Compared by path: a directory URL may or may not end in a slash.
        let id = UUID()
        guard case .console(let work, let workID) = TabRequest.duckdbConsole(folder: "Users/me/work").target(root: root, id: id)
        else { return XCTFail("not a console") }
        XCTAssertEqual(work.path, "/Users/me/work")
        XCTAssertEqual(workID, id)
        guard case .console(let top, _) = TabRequest.duckdbConsole(folder: "").target(root: root, id: id)
        else { return XCTFail("not a console") }
        XCTAssertEqual(top.path, "/")
        // Each request is a console of its own.
        XCTAssertNotEqual(
            TabRequest.duckdbConsole(folder: "Users/me/work").target(root: root),
            TabRequest.duckdbConsole(folder: "Users/me/work").target(root: root))
    }
}
