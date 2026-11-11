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

    func testNew() throws {
        let url = try parse("ganymede://new?dir=~/notes&name=Today&template=~/t.ipynb")
        XCTAssertEqual(url.command, .new(dir: "~/notes", name: "Today", template: "~/t.ipynb"))
        XCTAssertEqual(try parse("ganymede://new?dir=/tmp").command, .new(dir: "/tmp", name: nil, template: nil))
    }

    func testRunDefaults() throws {
        let url = try parse("ganymede://run?path=/a.ipynb")
        XCTAssertEqual(url.command, .run(path: "/a.ipynb", cell: nil, restart: true, timeout: 600))
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
        XCTAssertEqual(error("ganymede://new?name=x"), .missing("dir"))
        XCTAssertEqual(error("ganymede://run?path=/a&restart=maybe"), .badValue("restart", "maybe"))
        XCTAssertEqual(error("ganymede://run?path=/a&timeout=0"), .badValue("timeout", "0"))
        XCTAssertEqual(error("ganymede://run?path=/a&timeout=9999"), .badValue("timeout", "9999"))
        XCTAssertEqual(error("ganymede://x-callback-url/open?path=/a&x-success=file%3A%2F%2F%2Ftmp"), .badValue("x-success", "file:///tmp"))
        XCTAssertEqual(error("ganymede://x-callback-url/open?path=/a&x-error=nothing"), .badValue("x-error", "nothing"))
    }

    func testParametersAreNotYetSupported() {
        XCTAssertEqual(error("ganymede://run?path=/a&p.day=1"), .parametersUnsupported)
        XCTAssertEqual(error("ganymede://run?path=/a&params=%7B%7D"), .parametersUnsupported)
        XCTAssertEqual(error("ganymede://run?path=/a&P.day=1"), .parametersUnsupported)
        XCTAssertEqual(error("ganymede://run?path=/a&Params=%7B%7D"), .parametersUnsupported)
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
        // Kept across launches.
        XCTAssertTrue(URLRunPermissions(defaults: defaults).allows(a, sendingTo: nil))
        permissions.revokeAll()
        XCTAssertFalse(permissions.allows(a, sendingTo: nil))
        XCTAssertFalse(URLRunPermissions(defaults: defaults).allows(a, sendingTo: "shortcuts://x-callback-url"))
    }
}
