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
        let id = UUID()
        let target = WindowTarget.console(folder: consoleFolder, id: id)
        // The console's id is its record's: the page reads it as `session` (#735).
        XCTAssertEqual(
            query(target.pageURL(server: server, kernels: "server", nativeChrome: true)),
            [
                "token": "abc", "kernels": "server", "dir": "/Users/me/work",
                "console": "duckdb", "session": id.uuidString.lowercased(), "chrome": "native",
            ]
        )
    }

    // MARK: Console names and recent consoles (#735)

    func testTheConsolePageReadsBackItsSessionAsItsId() throws {
        let id = UUID()
        let target = WindowTarget.console(folder: consoleFolder, id: id)
        // A restored or reopened console is the same console: same id, so the same record.
        XCTAssertEqual(
            WindowTarget(page: target.pageURL(server: server, kernels: "server", nativeChrome: true)),
            target)
        // The page writes it as the app did; upper case reads too. Not a UUID, or none: a new id.
        let upper = URL(string: "http://127.0.0.1:8123/?dir=Users%2Fme%2Fwork&console=duckdb&session=\(id.uuidString)")!
        XCTAssertEqual(WindowTarget(page: upper), target)
        guard case .console(_, let other)? = WindowTarget(
            page: URL(string: "http://127.0.0.1:8123/?console=duckdb&session=nope")!)
        else { return XCTFail("not a console") }
        XCTAssertNotEqual(other, id)
        // A page with no session isn't equal to the tab's target; `shows` still matches it.
        let bare = try XCTUnwrap(WindowTarget(
            page: URL(string: "http://127.0.0.1:8123/?dir=Users%2Fme%2Fwork&console=duckdb")!))
        XCTAssertNotEqual(bare, target)
        XCTAssertTrue(target.shows(bare))
    }

    func testAConsoleTabIsTitledWithItsName() {
        let console = WindowTarget.console(folder: consoleFolder, id: UUID())
        XCTAssertEqual(console.tabTitle(consoleName: "Orbits"), "Orbits")
        // Until the page reports one, or with a blank one: the folder's title.
        XCTAssertEqual(console.tabTitle(consoleName: nil), "DuckDB · work")
        XCTAssertEqual(console.tabTitle(consoleName: "  "), "DuckDB · work")
        // Only a console takes a name.
        let notebook = WindowTarget.file(URL(fileURLWithPath: "/Users/me/work/a.ipynb"))
        XCTAssertEqual(notebook.tabTitle(consoleName: "Orbits"), "a")
    }

    func testANotebookIsTitledWithItsTitleElseItsFileName() throws {
        let dated = WindowTarget.file(URL(fileURLWithPath: "/Users/me/work/2026-11-09-fremont-bridge.ipynb"))
        // The day a journal's file starts with isn't part of its title (#867).
        XCTAssertEqual(dated.displayTitle(), "fremont-bridge")
        // The page's `metadata.title` wins, trimmed, and the file's name is
        // there while the page hasn't said.
        XCTAssertEqual(dated.displayTitle(metadataTitle: "Fremont Bridge at 6 pm"),
                       "Fremont Bridge at 6 pm")
        XCTAssertEqual(dated.displayTitle(metadataTitle: "  Fremont Bridge  "), "Fremont Bridge")
        for blank in ["", "   "] {
            XCTAssertEqual(dated.displayTitle(metadataTitle: blank), "fremont-bridge")
        }
        // A name that is only a date keeps it, and one without stays as it is.
        let day = WindowTarget.file(URL(fileURLWithPath: "/Users/me/work/2026-11-09-.ipynb"))
        XCTAssertEqual(day.displayTitle(), "2026-11-09-")
        let plain = WindowTarget.file(URL(fileURLWithPath: "/Users/me/work/notes.ipynb"))
        XCTAssertEqual(plain.displayTitle(), "notes")
        let loose = WindowTarget.file(URL(fileURLWithPath: "/Users/me/work/fremont-2026-11-09.ipynb"))
        XCTAssertEqual(loose.displayTitle(), "fremont-2026-11-09")
        // A machine's window, and a tab's title, in the same way.
        let machine = try XCTUnwrap(WindowTarget.machine(
            "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB", path: "/notes/2026-11-09-a.ipynb",
            isFolder: false))
        XCTAssertEqual(machine.displayTitle(machineName: "m4mini"), "a · m4mini")
        XCTAssertEqual(machine.tabTitle(consoleName: nil, machineName: "m4mini",
                                        metadataTitle: "Io moons"),
                       "Io moons · m4mini")
        // A folder keeps its name.
        let folder = WindowTarget.folder(URL(fileURLWithPath: "/2026-11-09-work", isDirectory: true))
        XCTAssertEqual(folder.displayTitle(metadataTitle: "Io moons"), "2026-11-09-work")
    }

    func testAConsoleSavedBeforeNamesStillDecodes() throws {
        // As #730 saved it: no record, nothing but the folder and the id.
        let saved = #"{"console":{"folder":"file:///Users/me/work/","id":"0F8FAD5B-D9CB-469F-A165-70867728950E"}}"#
        let target = try XCTUnwrap(WindowTarget(saved: saved))
        guard case .console(let folder, let id) = target else { return XCTFail("not a console") }
        XCTAssertEqual(folder.path, "/Users/me/work")
        XCTAssertEqual(id, UUID(uuidString: "0F8FAD5B-D9CB-469F-A165-70867728950E"))
        // Its page names the id as its record.
        XCTAssertEqual(
            query(target.pageURL(server: server, kernels: "server"))["session"],
            "0f8fad5b-d9cb-469f-a165-70867728950e")
    }

    func testTheOpenTabMessageCarriesARecentConsolesSession() {
        let id = UUID()
        XCTAssertEqual(
            TabRequest(body: ["console": "duckdb", "folder": "Users/me", "session": id.uuidString]),
            .duckdbConsole(folder: "Users/me", session: id))
        XCTAssertEqual(
            TabRequest(body: ["console": "duckdb", "folder": "Users/me", "session": "nope"]),
            .duckdbConsole(folder: "Users/me"))
        let root = URL(fileURLWithPath: "/", isDirectory: true)
        // The request names the console, so the same window comes forward.
        XCTAssertEqual(
            TabRequest.duckdbConsole(folder: "Users/me", session: id).target(root: root),
            TabRequest.duckdbConsole(folder: "Users/me", session: id).target(root: root))
        guard case .console(_, let shown) = TabRequest.duckdbConsole(folder: "Users/me", session: id).target(root: root)
        else { return XCTFail("not a console") }
        XCTAssertEqual(shown, id)
    }

    func testTheConsolePageReadsBackAsTheSameConsole() throws {
        let target = WindowTarget.console(folder: consoleFolder, id: UUID())
        let read = try XCTUnwrap(
            WindowTarget(page: target.pageURL(server: server, kernels: "server", nativeChrome: true)))
        guard case .console(let folder, _) = read else { return XCTFail("not a console: \(read)") }
        XCTAssertEqual(folder.path, "/Users/me/work")
        // The page's `session` is the tab's id (#735), so it reads back as the same target.
        XCTAssertTrue(target.shows(read))
        XCTAssertEqual(target, read)
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
        // A notebook wins over `console`, as the page reads its URL.
        XCTAssertEqual(
            WindowTarget(page: URL(string: "http://127.0.0.1:8123/?open=a.ipynb&console=duckdb")!),
            .file(URL(fileURLWithPath: "/a.ipynb")))
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

    // MARK: File guard on metadata title (#871)

    func testShownTitleGuardsFileTargetsByFileName() throws {
        let file = WindowTarget.file(URL(fileURLWithPath: "/Users/me/work/Io.ipynb"))
        // 1) Matching .file returns the metadata title.
        XCTAssertEqual(
            WindowTarget.shownTitle(target: file, pagePath: "work/Io.ipynb", metadataTitle: "Io moons"),
            "Io moons")
        // 2) Another file name returns nil so the previous notebook's title doesn't flash.
        XCTAssertNil(
            WindowTarget.shownTitle(target: file, pagePath: "work/Europa.ipynb", metadataTitle: "Europa"))
        // 3) nil path returns nil while the page has not opened a file yet.
        XCTAssertNil(
            WindowTarget.shownTitle(target: file, pagePath: nil, metadataTitle: "Previous"))
        // 4) .machineFile path: matching returns title, mismatching or nil returns nil.
        let machine = try XCTUnwrap(WindowTarget.machine(
            "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB", path: "/notes/Io.ipynb", isFolder: false))
        XCTAssertEqual(
            WindowTarget.shownTitle(target: machine, pagePath: "notes/Io.ipynb", metadataTitle: "Io moons"),
            "Io moons")
        XCTAssertNil(
            WindowTarget.shownTitle(target: machine, pagePath: "notes/Other.ipynb", metadataTitle: "Other"))
        XCTAssertNil(
            WindowTarget.shownTitle(target: machine, pagePath: nil, metadataTitle: "Previous"))
        // 5) .folder target shows whichever notebook its page has open.
        let folder = WindowTarget.folder(URL(fileURLWithPath: "/Users/me/work", isDirectory: true))
        XCTAssertEqual(
            WindowTarget.shownTitle(target: folder, pagePath: "work/Any.ipynb", metadataTitle: "Any"),
            "Any")
        XCTAssertEqual(
            WindowTarget.shownTitle(target: folder, pagePath: nil, metadataTitle: "Any"),
            "Any")
    }

    // MARK: Focus matching (#884)

    func testFileFromServerPathMatchesLocalAndMachinePlaces() throws {
        XCTAssertEqual(
            WindowTarget.file(serverPath: "Users/me/nb399.ipynb", in: .thisDevice),
            .file(URL(fileURLWithPath: "/Users/me/nb399.ipynb")))
        XCTAssertEqual(
            WindowTarget.file(serverPath: "/Users/me/data.csv", in: .thisDevice),
            .file(URL(fileURLWithPath: "/Users/me/data.csv")))
        XCTAssertNil(WindowTarget.file(serverPath: "", in: .thisDevice))

        let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"
        XCTAssertEqual(
            WindowTarget.file(serverPath: "notes/nb399.ipynb", in: .machine(id)),
            .machineFile(machine: id, path: "/notes/nb399.ipynb"))
        XCTAssertEqual(
            WindowTarget.file(serverPath: "notes/nb399.ipynb", in: .thisMac(id)),
            .machineFile(machine: id, path: "/notes/nb399.ipynb"))
        XCTAssertNil(WindowTarget.file(serverPath: "../secret.ipynb", in: .machine(id)))
    }

    func testMatchesOpenTargetResolvesSymlinksAndDistinguishesPlaces() throws {
        let fm = FileManager.default
        let base = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let realDir = base.appendingPathComponent("real", isDirectory: true)
        try fm.createDirectory(at: realDir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: base) }
        let linkDir = base.appendingPathComponent("link", isDirectory: true)
        try fm.createSymbolicLink(at: linkDir, withDestinationURL: realDir)
        let realFile = realDir.appendingPathComponent("nb399.ipynb")
        try Data("{}".utf8).write(to: realFile)
        let linkFile = linkDir.appendingPathComponent("nb399.ipynb")
        let otherFile = realDir.appendingPathComponent("other.ipynb")

        XCTAssertTrue(WindowTarget.file(realFile).matchesOpenTarget(.file(linkFile)))
        XCTAssertFalse(WindowTarget.file(realFile).matchesOpenTarget(.file(otherFile)))
        XCTAssertFalse(WindowTarget.file(realFile).matchesOpenTarget(.folder(realDir)))

        let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"
        let upper = try XCTUnwrap(WindowTarget.machine(id.uppercased(), path: "/notes/nb399.ipynb", isFolder: false))
        let lower = try XCTUnwrap(WindowTarget.machine(id.lowercased(), path: "/notes/nb399.ipynb", isFolder: false))
        XCTAssertTrue(upper.matchesOpenTarget(lower))
        XCTAssertFalse(upper.matchesOpenTarget(.file(URL(fileURLWithPath: "/notes/nb399.ipynb"))))

        let c1 = UUID()
        let c2 = UUID()
        XCTAssertTrue(WindowTarget.console(folder: realDir, id: c1).matchesOpenTarget(.console(folder: linkDir, id: c1)))
        XCTAssertFalse(WindowTarget.console(folder: realDir, id: c1).matchesOpenTarget(.console(folder: realDir, id: c2)))
    }
}
