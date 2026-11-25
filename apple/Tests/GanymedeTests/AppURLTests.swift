import DeviceBridge
import XCTest

/// `ganymede://` URLs (#303): what each asks for, and the answers sent
/// back to x-callback-url callers.
final class AppURLTests: XCTestCase {
    private func parse(_ text: String) throws -> AppURL {
        try AppURL(XCTUnwrap(URL(string: text)))
    }

    private func error(_ text: String) -> AppURLError? {
        do {
            _ = try parse(text)
            return nil
        } catch {
            return error as? AppURLError
        }
    }

    // MARK: Routes

    func testOpen() throws {
        let url = try parse("ganymede://open?path=/Users/me/a%20b.ipynb")
        XCTAssertEqual(url.command, .open(path: "/Users/me/a b.ipynb"))
        XCTAssertNil(url.callback)
        XCTAssertFalse(url.runsCode)
    }

    func testOpenInFolder() throws {
        let url = try parse("ganymede://open?folder=My%20Vault&file=Daily/2026-11-15.ipynb")
        XCTAssertEqual(url.command, .openInFolder(folder: "My Vault", file: "Daily/2026-11-15.ipynb"))
        XCTAssertNil(url.callback)
        XCTAssertFalse(url.runsCode)
        // Through x-callback-url, as for the other routes.
        XCTAssertEqual(
            try parse("ganymede://x-callback-url/open?folder=V&file=a.ipynb").command,
            .openInFolder(folder: "V", file: "a.ipynb")
        )
    }

    func testOpenWithPathAndFolderUsesThePath() throws {
        let url = try parse("ganymede://open?path=/a.ipynb&folder=V&file=b.ipynb")
        XCTAssertEqual(url.command, .open(path: "/a.ipynb"))
        // Even when the folder form is incomplete.
        XCTAssertEqual(try parse("ganymede://open?path=/a.ipynb&folder=V").command, .open(path: "/a.ipynb"))
        XCTAssertEqual(try parse("ganymede://open?path=/a.ipynb&file=b.ipynb").command, .open(path: "/a.ipynb"))
    }

    func testFolderLinksAreForIPadAndIPhone() {
        XCTAssertEqual(
            AppURLError.folderLinkNotOnMac.errorDescription,
            "Links with a folder open on iPad and iPhone. On the Mac, a link names the notebook with path=."
        )
        XCTAssertEqual(AppURLError.macOnly("run").errorDescription, "“run” links work only on the Mac.")
        XCTAssertEqual(AppURLError.folderLinkNotOnMac.code, 2)
    }

    func testNew() throws {
        let url = try parse("ganymede://new?dir=~/notes&name=Today&template=~/t.ipynb")
        XCTAssertEqual(url.command, .new(dir: "~/notes", name: "Today", template: "~/t.ipynb"))
        XCTAssertEqual(try parse("ganymede://new?dir=/tmp").command, .new(dir: "/tmp", name: nil, template: nil))
    }

    func testRunDefaults() throws {
        let url = try parse("ganymede://run?path=/a.ipynb")
        XCTAssertEqual(url.command, .run(path: "/a.ipynb", cell: nil, restart: true, timeout: 600, params: nil))
        XCTAssertTrue(url.runsCode)
    }

    func testRunOptions() throws {
        let url = try parse("ganymede://run?path=/a.ipynb&cell=report&restart=0&timeout=30")
        XCTAssertEqual(url.command, .run(path: "/a.ipynb", cell: "report", restart: false, timeout: 30))
    }

    func testRouteIsCaseInsensitive() throws {
        XCTAssertEqual(try parse("ganymede://OPEN?path=/a.ipynb").command, .open(path: "/a.ipynb"))
    }

    func testXCallback() throws {
        let url = try parse(
            "ganymede://x-callback-url/run?path=/a.ipynb"
                + "&x-success=shortcuts%3A%2F%2Fx-callback-url%2Fdone"
                + "&x-error=shortcuts%3A%2F%2Ferr&x-cancel=shortcuts%3A%2F%2Fcancel"
        )
        XCTAssertEqual(url.command, .run(path: "/a.ipynb", cell: nil, restart: true, timeout: 600))
        XCTAssertEqual(url.callback?.success, URL(string: "shortcuts://x-callback-url/done"))
        XCTAssertEqual(url.callback?.error, URL(string: "shortcuts://err"))
        XCTAssertEqual(url.callback?.cancel, URL(string: "shortcuts://cancel"))
        XCTAssertEqual(url.callback?.destination, "shortcuts://err, shortcuts://x-callback-url")
    }

    func testDestination() throws {
        XCTAssertNil(try parse("ganymede://run?path=/a").callback?.destination)
        XCTAssertNil(AppURL.Callback(cancel: URL(string: "x://y")).destination)
        let page = try parse("ganymede://x-callback-url/run?path=/a&x-success=HTTPS%3A%2F%2FEvil.example%2Fc%3Fq%3D1")
        XCTAssertEqual(page.callback?.destination, "https://evil.example")
    }

    func testXCallbackWithoutAnswersStillCountsAsOne() throws {
        let url = try parse("ganymede://x-callback-url/open?path=/a.ipynb")
        XCTAssertEqual(url.callback, AppURL.Callback())
    }

    // MARK: Bad URLs

    func testBadURLs() {
        XCTAssertEqual(error("https://open?path=/a"), .notOurs)
        XCTAssertEqual(error("ganymede://"), .missing("route"))
        XCTAssertEqual(error("ganymede://delete?path=/a"), .unknownRoute("delete"))
        XCTAssertEqual(error("ganymede://open"), .missing("path"))
        XCTAssertEqual(error("ganymede://open?path="), .missing("path"))
        XCTAssertEqual(error("ganymede://open?folder=V"), .missing("file"))
        XCTAssertEqual(error("ganymede://open?folder=V&file="), .missing("file"))
        XCTAssertEqual(error("ganymede://open?file=a.ipynb"), .missing("path"))
        XCTAssertEqual(error("ganymede://open?folder=&file=a.ipynb"), .missing("path"))
        XCTAssertEqual(error("ganymede://run?folder=V&file=a.ipynb"), .missing("path"))
        XCTAssertEqual(error("ganymede://new?name=x"), .missing("dir"))
        XCTAssertEqual(error("ganymede://run?path=/a&restart=maybe"), .badValue("restart", "maybe"))
        XCTAssertEqual(error("ganymede://run?path=/a&timeout=0"), .badValue("timeout", "0"))
        XCTAssertEqual(error("ganymede://run?path=/a&timeout=9999"), .badValue("timeout", "9999"))
        XCTAssertEqual(error("ganymede://x-callback-url/open?path=/a&x-success=file%3A%2F%2F%2Ftmp"), .badValue("x-success", "file:///tmp"))
        XCTAssertEqual(error("ganymede://x-callback-url/open?path=/a&x-error=nothing"), .badValue("x-error", "nothing"))
    }

    private func params(_ query: String) throws -> String? {
        guard case .run(_, _, _, _, let params) = try parse("ganymede://run?path=/a&" + query).command else {
            XCTFail("not a run")
            return nil
        }
        return params
    }

    func testParameters() throws {
        // JSON when it parses, else a string, as `ganymede execute -p`.
        XCTAssertEqual(try params("p.day=mon&p.n=2&p.on=true&p.list=%5B1%2C2%5D"), #"{"day":"mon","list":[1,2],"n":2,"on":true}"#)
        XCTAssertEqual(try params("p.q=%22quoted%22"), #"{"q":"quoted"}"#)
        // params= first, each p. over it; names keep their case.
        XCTAssertEqual(try params("params=%7B%22a%22%3A1%2C%22b%22%3A2%7D&p.b=3&P.Day=x"), #"{"a":1,"b":3,"Day":"x"}"#)
        XCTAssertEqual(try params("Params=%7B%7D"), "{}")
        XCTAssertNil(try params("timeout=5"))
    }

    func testBadParameters() {
        XCTAssertEqual(error("ganymede://run?path=/a&params=%5B1%5D"), .badValue("params", "[1]"))
        XCTAssertEqual(error("ganymede://run?path=/a&params=nope"), .badValue("params", "nope"))
        XCTAssertEqual(error("ganymede://run?path=/a&p.=1"), .badValue("parameter name", "p."))
        XCTAssertEqual(error("ganymede://run?path=/a&cell=x&p.a=1"), .cellWithParameters)
    }

    // MARK: Paths

    func testPaths() {
        let root = URL(fileURLWithPath: "/srv/notebooks", isDirectory: true)
        let home = URL(fileURLWithPath: "/Users/me", isDirectory: true)
        XCTAssertEqual(AppURL.fileURL("/a/b.ipynb", root: root, home: home).path, "/a/b.ipynb")
        XCTAssertEqual(AppURL.fileURL("~/b.ipynb", root: root, home: home).path, "/Users/me/b.ipynb")
        XCTAssertEqual(AppURL.fileURL("~", root: root, home: home).path, "/Users/me")
        XCTAssertEqual(AppURL.fileURL("x/b.ipynb", root: root, home: home).path, "/srv/notebooks/x/b.ipynb")
        XCTAssertEqual(AppURL.fileURL("/a/../c/./b.ipynb", root: root, home: home).path, "/c/b.ipynb")
    }

    // MARK: Answers

    func testAddingKeepsTheCallersQueryAndEncodesValues() throws {
        let base = try XCTUnwrap(URL(string: "shortcuts://x-callback-url/done?id=7"))
        let url = AppURL.adding([
            URLQueryItem(name: "status", value: "ok"),
            URLQueryItem(name: "output", value: "a&b=c+d #e\n"),
        ], to: base)
        XCTAssertEqual(url.absoluteString, "shortcuts://x-callback-url/done?id=7&status=ok&output=a%26b%3Dc%2Bd%20%23e%0A")
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(items.last?.value, "a&b=c+d #e\n")
    }

    func testAddingToABaseWithNoQuery() throws {
        let base = try XCTUnwrap(URL(string: "raycast://done"))
        XCTAssertEqual(AppURL.adding([URLQueryItem(name: "path", value: "/a b")], to: base).absoluteString, "raycast://done?path=%2Fa%20b")
    }

    func testErrorItems() {
        let items = AppURL.errorItems(AppURLError.missing("path"))
        XCTAssertEqual(items.map(\.name), ["errorCode", "errorMessage"])
        XCTAssertEqual(items[0].value, "2")
        XCTAssertEqual(items[1].value, "The URL needs “path”.")
        XCTAssertEqual(AppURL.errorItems(AppURLError.cancelled)[0].value, "3")
        XCTAssertEqual(AppURL.errorItems(NotebookActionError.notFound("/a"))[0].value, "1")
    }

    func testOutputText() throws {
        let cells = [
            try XCTUnwrap(NotebookCell(json: [
                "id": "a", "cell_type": "code",
                "outputs": [
                    ["output_type": "stream", "name": "stdout", "text": "one\n"],
                    ["output_type": "stream", "name": "stdout", "text": "two"],
                ],
            ])),
            try XCTUnwrap(NotebookCell(json: [
                "id": "b", "cell_type": "code",
                "outputs": [["output_type": "execute_result", "data": ["text/plain": "42"]]],
            ])),
        ]
        XCTAssertEqual(AppURL.outputText(cells), "one\ntwo\n42")
    }

    // MARK: Always allow

    @MainActor
    func testPermissions() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let permissions = URLRunPermissions(defaults: defaults)
        let a = URL(fileURLWithPath: "/tmp/x/../a.ipynb")
        XCTAssertFalse(permissions.allows(a, sendingTo: nil))
        permissions.allow(a, sendingTo: nil)
        permissions.allow(a, sendingTo: nil)
        XCTAssertTrue(permissions.allows(URL(fileURLWithPath: "/tmp/a.ipynb"), sendingTo: nil))
        XCTAssertEqual(permissions.paths.count, 1)
        // Allowed with no callback, or for Shortcuts: a page's callback still asks.
        XCTAssertFalse(permissions.allows(a, sendingTo: "https://evil.example"))
        permissions.allow(a, sendingTo: "shortcuts://x-callback-url")
        XCTAssertTrue(permissions.allows(a, sendingTo: "shortcuts://x-callback-url"))
        XCTAssertFalse(permissions.allows(a, sendingTo: "https://evil.example"))
        XCTAssertEqual(permissions.paths.count, 2)
        let parts = permissions.paths.map(URLRunPermissions.parts)
        XCTAssertEqual(Set(parts.compactMap(\.destination)), ["shortcuts://x-callback-url"])
        // Runs with parameters are allowed on their own.
        XCTAssertFalse(permissions.allows(a, sendingTo: nil, withParameters: true))
        XCTAssertFalse(permissions.allows(a, sendingTo: "shortcuts://x-callback-url", withParameters: true))
        permissions.allow(a, sendingTo: "shortcuts://x-callback-url", withParameters: true)
        XCTAssertTrue(permissions.allows(a, sendingTo: "shortcuts://x-callback-url", withParameters: true))
        XCTAssertFalse(permissions.allows(a, sendingTo: nil, withParameters: true))
        let withParams = permissions.paths.map(URLRunPermissions.parts).filter(\.withParameters)
        XCTAssertEqual(withParams.count, 1)
        XCTAssertEqual(withParams.first?.destination, "shortcuts://x-callback-url")
        // Kept across launches.
        XCTAssertTrue(URLRunPermissions(defaults: defaults).allows(a, sendingTo: nil))
        permissions.revokeAll()
        XCTAssertFalse(permissions.allows(a, sendingTo: nil))
        XCTAssertFalse(URLRunPermissions(defaults: defaults).allows(a, sendingTo: "shortcuts://x-callback-url"))
    }

    // MARK: Always allow follows the file (#584)

    /// The files' stamps, as the test sets them: a path with none has no file.
    private final class Files {
        var stamps: [String: String] = [:]
        func stamp(_ path: String) -> String? { stamps[path] }
    }

    /// `url`'s path as `URLRunPermissions` keys it.
    private func pathKey(_ url: URL) -> String {
        url.standardizedFileURL.resolvingSymlinksInPath().path
    }

    /// `url`'s path as the server names it in a write report.
    private func serverPath(_ url: URL) -> String {
        FileStamp.canonical(pathKey(url))
    }

    /// Without a log, unless the test gives one: tests don't share the app's.
    @MainActor
    private func makePermissions(_ files: Files, _ defaults: UserDefaults, log: ServerWriteLog? = nil) -> URLRunPermissions {
        URLRunPermissions(defaults: defaults, stamp: files.stamp, log: log)
    }

    @MainActor
    func testAnAnswerIsForgottenWhenTheFileChangesOutsideTheApp() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        files.stamps[pathKey(a)] = "10:1:100"
        let permissions = makePermissions(files, defaults)
        permissions.allow(a, sendingTo: nil)
        XCTAssertTrue(permissions.allows(a, sendingTo: nil))
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [pathKey(a): "10:1:100"])
        // Replaced by rename: the same size and time, another inode.
        files.stamps[pathKey(a)] = "10:1:101"
        XCTAssertFalse(permissions.allows(a, sendingTo: nil), "asks again")
        XCTAssertTrue(permissions.paths.isEmpty, "and is no longer listed")
        XCTAssertEqual(defaults.stringArray(forKey: URLRunPermissions.defaultsKey), [])
        XCTAssertEqual((defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String])?.isEmpty, true)
        // Allowing it again keeps the new file's answer.
        permissions.allow(a, sendingTo: nil)
        XCTAssertTrue(permissions.allows(a, sendingTo: nil))
    }

    @MainActor
    func testAnUnchangedFileKeepsItsAnswerAcrossLaunches() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        files.stamps[pathKey(a)] = "10:1:100"
        makePermissions(files, defaults).allow(a, sendingTo: "shortcuts://x-callback-url", withParameters: true)
        XCTAssertTrue(makePermissions(files, defaults).allows(a, sendingTo: "shortcuts://x-callback-url", withParameters: true))
        files.stamps[pathKey(a)] = "11:2:100"
        XCTAssertFalse(makePermissions(files, defaults).allows(a, sendingTo: "shortcuts://x-callback-url", withParameters: true),
                       "the stamp was kept with the answer")
    }

    @MainActor
    func testTheServersWriteKeepsTheAnswersOfThatFileOnly() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        let b = URL(fileURLWithPath: "/tmp/b.ipynb")
        files.stamps = [pathKey(a): "10:1:100", pathKey(b): "20:1:200"]
        let permissions = makePermissions(files, defaults)
        permissions.allow(a, sendingTo: nil)
        permissions.allow(a, sendingTo: AppURL.shortcutsDestination)
        permissions.allow(b, sendingTo: nil)
        // The server saved both: each is a rename over the file. Only a's is reported.
        files.stamps = [pathKey(a): "12:5:101", pathKey(b): "22:5:201"]
        permissions.serverWrote(path: serverPath(a), before: "10:1:100", after: "12:5:101")
        XCTAssertTrue(permissions.allows(a, sendingTo: nil))
        XCTAssertTrue(permissions.allows(a, sendingTo: AppURL.shortcutsDestination), "every key of the file")
        let stamps = defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String]
        XCTAssertEqual(stamps?.filter { URLRunPermissions.parts($0.key).path == pathKey(a) }.values.sorted(), ["12:5:101", "12:5:101"])
        XCTAssertEqual(stamps?[pathKey(b)], "20:1:200", "b's stays as it was")
        XCTAssertFalse(permissions.allows(b, sendingTo: nil), "b was changed and not reported: outside")
        // An outside change after the write is still seen.
        files.stamps[pathKey(a)] = "12:6:102"
        XCTAssertFalse(permissions.allows(a, sendingTo: nil))
    }

    /// The report is recorded on the server's thread at once; the stores
    /// hear of it a main-actor hop later. A check in between keeps the answer.
    @MainActor
    func testACheckBeforeTheMainActorHearsOfTheServersWriteKeepsTheAnswer() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let log = ServerWriteLog()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        files.stamps[pathKey(a)] = "10:1:100"
        let permissions = makePermissions(files, defaults, log: log)
        permissions.allow(a, sendingTo: nil)
        files.stamps[pathKey(a)] = "12:5:101"
        log.record(path: serverPath(a), before: "10:1:100", after: "12:5:101")
        XCTAssertTrue(permissions.allows(a, sendingTo: nil), "the log explains the new stamp")
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [pathKey(a): "12:5:101"], "and the key is restamped")
        // The same without the log is an outside change.
        let other = makePermissions(files, defaults)
        files.stamps[pathKey(a)] = "13:6:102"
        XCTAssertFalse(other.allows(a, sendingTo: nil))
    }

    @MainActor
    func testTwoServerWritesInARowKeepTheAnswer() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let log = ServerWriteLog()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        files.stamps[pathKey(a)] = "1:1:1"
        let permissions = makePermissions(files, defaults, log: log)
        permissions.allow(a, sendingTo: nil)
        // A to B to C, the check coming when the row still has A.
        log.record(path: serverPath(a), before: "1:1:1", after: "2:2:2")
        log.record(path: serverPath(a), before: "2:2:2", after: "3:3:3")
        files.stamps[pathKey(a)] = "3:3:3"
        XCTAssertTrue(permissions.allows(a, sendingTo: nil))
        // The main actor hears them late and in the other order: the row
        // has C by then, and neither report moves it back.
        permissions.serverWrote(path: serverPath(a), before: "2:2:2", after: "3:3:3")
        permissions.serverWrote(path: serverPath(a), before: "1:1:1", after: "2:2:2")
        XCTAssertTrue(permissions.allows(a, sendingTo: nil))
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [pathKey(a): "3:3:3"])
    }

    /// The main actor can hear two reports in the other order: the second
    /// one then finds a row that isn't at its `before`. Without the log the
    /// row is left behind; with it, the check follows the chain.
    @MainActor
    func testReportsHeardOutOfOrderAreFollowedByTheLog() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        files.stamps[pathKey(a)] = "1:1:1"
        let permissions = makePermissions(files, defaults)
        permissions.allow(a, sendingTo: nil)
        files.stamps[pathKey(a)] = "3:3:3"
        // B to C is heard first and finds the row at A; then A to B moves it to B.
        permissions.serverWrote(path: serverPath(a), before: "2:2:2", after: "3:3:3")
        permissions.serverWrote(path: serverPath(a), before: "1:1:1", after: "2:2:2")
        XCTAssertFalse(permissions.allows(a, sendingTo: nil), "no log: the row is at B and the file is at C")
        // With the log, the same file and a row at A are kept.
        let log = ServerWriteLog()
        log.record(path: serverPath(a), before: "2:2:2", after: "3:3:3")
        log.record(path: serverPath(a), before: "1:1:1", after: "2:2:2")
        files.stamps[pathKey(a)] = "1:1:1"
        let logged = makePermissions(files, defaults, log: log)
        logged.allow(a, sendingTo: nil)
        files.stamps[pathKey(a)] = "3:3:3"
        XCTAssertTrue(logged.allows(a, sendingTo: nil))
    }

    /// An outside change, then a server autosave: the server's write starts
    /// from a stamp the answer doesn't have, so it is not the app's.
    @MainActor
    func testAServerWriteAfterAnOutsideChangeDoesNotRestamp() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let log = ServerWriteLog()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        files.stamps[pathKey(a)] = "1:1:1"
        let permissions = makePermissions(files, defaults, log: log)
        permissions.allow(a, sendingTo: nil)
        // git replaced the file (X), then the server saved it (Y).
        files.stamps[pathKey(a)] = "9:9:9"
        log.record(path: serverPath(a), before: "9:9:9", after: "8:8:8")
        files.stamps[pathKey(a)] = "8:8:8"
        permissions.serverWrote(path: serverPath(a), before: "9:9:9", after: "8:8:8")
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [pathKey(a): "1:1:1"], "not restamped")
        XCTAssertFalse(permissions.allows(a, sendingTo: nil), "dropped at the next check")
    }

    @MainActor
    func testAFileTheServerCreatedDoesNotKeepAStampedAnswer() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let log = ServerWriteLog()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        files.stamps[pathKey(a)] = "1:1:1"
        let permissions = makePermissions(files, defaults, log: log)
        permissions.allow(a, sendingTo: nil)
        // Deleted, then made again by the server: a new file at the path.
        files.stamps[pathKey(a)] = "5:5:5"
        log.record(path: serverPath(a), before: nil, after: "5:5:5")
        permissions.serverWrote(path: serverPath(a), before: nil, after: "5:5:5")
        XCTAssertFalse(permissions.allows(a, sendingTo: nil))
    }

    @MainActor
    func testAServerWriteGivesAnAnswerWithNoStampTheNewOne() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        defaults.set([pathKey(a)], forKey: URLRunPermissions.defaultsKey)
        let permissions = makePermissions(files, defaults)
        permissions.serverWrote(path: serverPath(a), before: nil, after: "5:5:5")
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [pathKey(a): "5:5:5"])
        files.stamps[pathKey(a)] = "5:5:5"
        XCTAssertTrue(permissions.allows(a, sendingTo: nil))
    }

    @MainActor
    func testAReportWithNoAfterOrNoKeyChangesNothing() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        let b = URL(fileURLWithPath: "/tmp/b.ipynb")
        files.stamps[pathKey(a)] = "1:1:1"
        let permissions = makePermissions(files, defaults)
        permissions.allow(a, sendingTo: nil)
        // Marked so a save shows: the stamps are written only when something changed.
        defaults.removeObject(forKey: URLRunPermissions.stampsKey)
        permissions.serverWrote(path: serverPath(a), before: "1:1:1", after: nil)
        permissions.serverWrote(path: serverPath(b), before: "1:1:1", after: "2:2:2")
        permissions.serverWrote(path: serverPath(a), before: "1:1:1", after: "1:1:1")
        XCTAssertNil(defaults.object(forKey: URLRunPermissions.stampsKey), "nothing saved")
    }

    /// The key spells the path through links; the server reports it by
    /// `realpath`, which on the Mac keeps `/private` where
    /// `resolvingSymlinksInPath` drops it.
    @MainActor
    func testAReportIsMatchedToAKeyWhateverTheLinksSpelling() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("AppURLTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let real = folder.appendingPathComponent("real.ipynb")
        try Data("{}".utf8).write(to: real)
        let link = folder.appendingPathComponent("link.ipynb")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: real)
        let files = Files()
        files.stamps[pathKey(link)] = "1:1:1"
        let permissions = makePermissions(files, defaults)
        permissions.allow(link, sendingTo: nil)
        files.stamps[pathKey(link)] = "2:2:2"
        let reported = AppKernels.canonicalPath(real)
        permissions.serverWrote(path: reported, before: "1:1:1", after: "2:2:2")
        XCTAssertTrue(permissions.allows(link, sendingTo: nil), "the report names the file; the key was kept by the link")
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [pathKey(link): "2:2:2"])
    }

    /// Answers kept before stamps, and answers kept while the file wasn't
    /// there, take the file's stamp when they are first checked.
    @MainActor
    func testAnAnswerWithNoStampTakesTheFilesOnFirstUse() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        defaults.set([pathKey(a)], forKey: URLRunPermissions.defaultsKey)
        let permissions = makePermissions(files, defaults)
        XCTAssertEqual(permissions.paths, [pathKey(a)], "what an older version stored still loads")
        XCTAssertTrue(permissions.allows(a, sendingTo: nil), "no file: kept")
        XCTAssertNil(defaults.dictionary(forKey: URLRunPermissions.stampsKey)?[pathKey(a)])
        files.stamps[pathKey(a)] = "10:1:100"
        XCTAssertTrue(permissions.allows(a, sendingTo: nil), "the file appeared: trusted, and stamped")
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [pathKey(a): "10:1:100"])
        files.stamps[pathKey(a)] = "10:1:101"
        XCTAssertFalse(permissions.allows(a, sendingTo: nil))
    }

    @MainActor
    func testPruneStaleForgetsEveryChangedFile() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        let b = URL(fileURLWithPath: "/tmp/b.ipynb")
        let c = URL(fileURLWithPath: "/tmp/c.ipynb")
        files.stamps = [pathKey(a): "1:1:1", pathKey(b): "2:2:2", pathKey(c): "3:3:3"]
        let permissions = makePermissions(files, defaults)
        for url in [a, b, c] { permissions.allow(url, sendingTo: nil) }
        files.stamps[pathKey(a)] = "1:1:9"
        files.stamps[pathKey(b)] = nil
        permissions.pruneStale()
        XCTAssertEqual(
            permissions.paths.map { URLRunPermissions.parts($0).path }, [pathKey(b), pathKey(c)],
            "a changed; b is not there, which is not a change; c is as it was")
        XCTAssertEqual(URLRunPermissions(defaults: defaults).paths.count, 2, "kept")
    }

    @MainActor
    func testRevokingForgetsTheStampToo() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        let b = URL(fileURLWithPath: "/tmp/b.ipynb")
        files.stamps = [pathKey(a): "1:1:1", pathKey(b): "2:2:2"]
        let permissions = makePermissions(files, defaults)
        permissions.allow(a, sendingTo: nil)
        permissions.allow(b, sendingTo: nil)
        permissions.revoke(try XCTUnwrap(permissions.paths.first))
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [pathKey(b): "2:2:2"])
        permissions.revokeAll()
        XCTAssertEqual((defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String])?.isEmpty, true)
    }

    /// `KeptAnswers.serverWrote` is what the app's observer calls: the links,
    /// the ledger and the folder grants all move to the file's new stamp.
    @MainActor
    func testTheServersWriteMovesTheStampInTheLinksTheLedgerAndTheFolders() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        let notebook = pathKey(a)
        files.stamps[notebook] = "1:1:1"
        let links = makePermissions(files, defaults)
        links.allow(a, sendingTo: nil)
        let ledgerStore = UserDefaultsLedgerStore(key: "ledger", defaults: defaults)
        let ledger = PermissionLedger(store: ledgerStore, stamp: files.stamp, log: nil)
        ledger.record(.always, notebook: notebook, capability: "location")
        let folderStore = UserDefaultsFolderStore(key: "folders", defaults: defaults)
        folderStore.save([FolderGrant(id: "F1", notebook: notebook, name: "Data", writable: false, bookmark: Data([1]), stamp: "1:1:1")])
        let folders = FolderGrants(store: folderStore, stamp: files.stamp, log: nil)

        files.stamps[notebook] = "2:2:2"
        KeptAnswers.serverWrote(
            path: serverPath(a), before: "1:1:1", after: "2:2:2", links: links, ledger: ledger, folders: folders)
        XCTAssertEqual(defaults.dictionary(forKey: URLRunPermissions.stampsKey) as? [String: String], [notebook: "2:2:2"])
        XCTAssertEqual(ledgerStore.load().map(\.stamp), ["2:2:2"])
        XCTAssertEqual(folderStore.load().map(\.stamp), ["2:2:2"])
        // A report for another file moves none of them.
        KeptAnswers.serverWrote(
            path: "/tmp/other.ipynb", before: "2:2:2", after: "3:3:3", links: links, ledger: ledger, folders: folders)
        XCTAssertEqual(ledgerStore.load().map(\.stamp), ["2:2:2"])
        XCTAssertEqual(folderStore.load().map(\.stamp), ["2:2:2"])
    }

    /// The app's stores are made with the default log, which is the one the
    /// server's observer records into.
    @MainActor
    func testTheStoresDefaultToTheSharedLog() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let files = Files()
        let a = URL(fileURLWithPath: "/tmp/\(UUID().uuidString).ipynb")
        let notebook = pathKey(a)
        files.stamps[notebook] = "1:1:1"
        let links = URLRunPermissions(defaults: defaults, stamp: files.stamp)
        links.allow(a, sendingTo: nil)
        let ledgerStore = UserDefaultsLedgerStore(key: "ledger", defaults: defaults)
        let ledger = PermissionLedger(store: ledgerStore, stamp: files.stamp)
        ledger.record(.always, notebook: notebook, capability: "location")
        let folderStore = UserDefaultsFolderStore(key: "folders", defaults: defaults)
        folderStore.save([FolderGrant(id: "F1", notebook: notebook, name: "Data", writable: false, bookmark: Data([1]), stamp: "1:1:1")])
        let folders = FolderGrants(store: folderStore, stamp: files.stamp)

        files.stamps[notebook] = "2:2:2"
        ServerWriteLog.shared.record(path: serverPath(a), before: "1:1:1", after: "2:2:2")
        XCTAssertTrue(links.allows(a, sendingTo: nil))
        XCTAssertEqual(ledger.answer(notebook: notebook, capability: "location"), .always)
        XCTAssertEqual(folders.grants.map(\.id), ["F1"])
    }

    // MARK: Asking first (#586)

    func testNewAsksOutsideSettingsFolders() {
        let notes = URL(fileURLWithPath: "/Users/a/Notes", isDirectory: true)
        func file(_ path: String) -> URL { URL(fileURLWithPath: path) }
        XCTAssertFalse(AppURL.newNeedsConfirmation(folder: notes, template: nil, trusted: [notes]))
        XCTAssertFalse(AppURL.newNeedsConfirmation(folder: file("/Users/a/Notes/Daily"), template: file("/Users/a/Notes/t.ipynb"), trusted: [notes]))
        XCTAssertTrue(AppURL.newNeedsConfirmation(folder: file("/Users/a/Desktop"), template: nil, trusted: [notes]))
        XCTAssertTrue(AppURL.newNeedsConfirmation(folder: file("/Users/a/NotesOld"), template: nil, trusted: [notes]), "a sibling with the same prefix")
        XCTAssertTrue(AppURL.newNeedsConfirmation(folder: file("/Users/a/Notes/../Desktop"), template: nil, trusted: [notes]))
        XCTAssertTrue(AppURL.newNeedsConfirmation(folder: notes, template: file("/etc/secret.ipynb"), trusted: [notes]), "a template from outside")
        XCTAssertTrue(AppURL.newNeedsConfirmation(folder: notes, template: nil, trusted: []))
    }

    @MainActor
    func testShortcutsRunsAreKeptApartFromLinks() throws {
        let suite = "AppURLTests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        let permissions = URLRunPermissions(defaults: defaults)
        let a = URL(fileURLWithPath: "/tmp/a.ipynb")
        permissions.allow(a, sendingTo: AppURL.shortcutsDestination)
        XCTAssertTrue(permissions.allows(a, sendingTo: AppURL.shortcutsDestination))
        XCTAssertFalse(permissions.allows(a, sendingTo: nil))
        XCTAssertFalse(permissions.allows(a, sendingTo: "shortcuts://x-callback-url"))
        XCTAssertFalse(permissions.allows(a, sendingTo: AppURL.shortcutsDestination, withParameters: true))
    }
}
