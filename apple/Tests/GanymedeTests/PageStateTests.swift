import XCTest

/// What the page tells the app's toolbar and menus (#205).
final class PageStateTests: XCTestCase {
    func testReadsTheState() {
        let body: [String: Any] = [
            "path": "moons/Io.ipynb",
            "dirty": NSNumber(value: true),
            "status": "busy",
            "kernel": "cdp",
            "kernelDisplayName": "TypeScript",
            "kernelMissing": false,
            "trusted": true,
            "cellType": "markdown",
            "kernels": [["name": "cdp", "displayName": "TypeScript"]],
            "backend": ["label": "Ganymede", "detail": "local server"],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.path, "moons/Io.ipynb")
        XCTAssertEqual(state?.dirty, true)
        XCTAssertEqual(state?.isBusy, true)
        XCTAssertEqual(state?.hasKernel, true)
        XCTAssertEqual(state?.cellType, "markdown")
        XCTAssertEqual(state?.kernels, [PageState.Kernel(name: "cdp", displayName: "TypeScript")])
        XCTAssertEqual(state?.backend?.detail, "local server")
        XCTAssertEqual(state?.sessions, [])
    }

    func testReadsTheRunningSessions() {
        let body: [String: Any] = [
            "path": "moons/Io.ipynb", "dirty": false, "status": "idle", "kernel": "cdp",
            "kernelDisplayName": "TypeScript", "kernelMissing": false, "trusted": true,
            "cellType": "code", "kernels": [Any](), "backend": NSNull(),
            "running": [
                ["id": "s1", "path": "moons/Io.ipynb", "kernel": "TypeScript", "state": "busy"],
                ["id": "s2", "path": "Europa.ipynb", "kernel": NSNull(), "state": NSNull()],
            ],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.sessions.map(\.id), ["s1", "s2"])
        XCTAssertEqual(state?.sessions.first?.state, "busy")
        XCTAssertEqual(state?.sessions.last?.title, "Europa")
        XCTAssertNil(state?.sessions.last?.kernel)
        XCTAssertEqual(state?.isRunning("Europa.ipynb"), true)
        XCTAssertEqual(state?.isRunning("Callisto.ipynb"), false)
        XCTAssertEqual(state?.otherSessions.map(\.id), ["s2"])
    }

    func testReadsTheSearchAndRecents() throws {
        let body: [String: Any] = [
            "path": NSNull(), "dirty": false, "status": NSNull(), "kernel": NSNull(),
            "kernelDisplayName": NSNull(), "kernelMissing": false, "trusted": true,
            "cellType": NSNull(), "kernels": [Any](), "backend": NSNull(), "running": [Any](),
            "recents": ["moons/Io.ipynb", "Europa.ipynb"],
            "search": [
                "query": "io",
                "matches": [
                    ["path": "moons/Io.ipynb", "name": "Io.ipynb", "type": "notebook", "snippet": NSNull()],
                    ["path": "Callisto.ipynb", "name": "Callisto.ipynb", "type": "notebook", "snippet": "io = 1"],
                    ["path": "io", "name": "io", "type": "directory", "snippet": NSNull()],
                ],
                "searching": false, "truncated": true, "error": NSNull(),
            ],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.recents, ["moons/Io.ipynb", "Europa.ipynb"])
        let matches = state?.search?.matches ?? []
        XCTAssertEqual(matches.map(\.title), ["Io", "Callisto", "io"])
        XCTAssertEqual(matches.map(\.folder), ["moons", "", ""])
        XCTAssertEqual(matches[1].snippet, "io = 1")
        XCTAssertTrue(matches[2].isDirectory)
        XCTAssertEqual(state?.search?.truncated, true)
        // Without opensFiles (another server), only notebooks open.
        let search = try XCTUnwrap(state?.search)
        XCTAssertEqual(matches.map { search.opens($0) }, [true, true, false])
        var own = search
        own.opensFiles = true
        let file = PageState.Search.Match(path: "notes.md", name: "notes.md", type: "file", snippet: nil)
        XCTAssertTrue(own.opens(file))
        XCTAssertFalse(search.opens(file))
        XCTAssertFalse(own.opens(matches[2]))
    }

    func testBuildsTheFileMovedArgument() throws {
        let moved = try JSONSerialization.jsonObject(
            with: Data(PageState.fileMoved(from: "Io.ipynb", to: "moons/Io.ipynb").utf8)) as? [String: Any]
        XCTAssertEqual(moved?["from"] as? String, "Io.ipynb")
        XCTAssertEqual(moved?["to"] as? String, "moons/Io.ipynb")
        let deleted = try JSONSerialization.jsonObject(
            with: Data(PageState.fileMoved(from: "moons", to: nil).utf8)) as? [String: Any]
        XCTAssertTrue(deleted?["to"] is NSNull)
    }

    func testBuildsTheSearchRequest() throws {
        let request = PageState.searchRequest("io \"x\"", in: "moons", contents: true)
        let value = try JSONSerialization.jsonObject(with: Data(request.utf8)) as? [String: Any]
        XCTAssertEqual(value?["query"] as? String, "io \"x\"")
        XCTAssertEqual(value?["dir"] as? String, "moons")
        XCTAssertEqual(value?["contents"] as? Bool, true)
    }

    func testNoNotebookOpen() {
        let body: [String: Any] = [
            "path": NSNull(), "dirty": false, "status": NSNull(), "kernel": NSNull(),
            "kernelDisplayName": NSNull(), "kernelMissing": false, "trusted": true,
            "cellType": NSNull(), "kernels": [Any](), "backend": NSNull(),
        ]
        let state = PageState(body: body)
        XCTAssertNotNil(state)
        XCTAssertEqual(state?.hasNotebook, false)
        XCTAssertEqual(state?.hasKernel, false)
        // A page older than #240 sends neither.
        XCTAssertNil(state?.search)
        XCTAssertNil(state?.recents)
    }

    func testIgnoresOtherMessages() {
        XCTAssertNil(PageState(body: "idle"))
        XCTAssertNil(PageState(body: ["kernels": "none"]))
    }

    func testCommandScriptsQuoteTheirArguments() {
        XCTAssertEqual(
            PageCommand.script("run-all"),
            #"window.ganymede ? window.ganymede.command(...["run-all"]) : false"#
        )
        XCTAssertEqual(
            PageCommand.script("open", arg: #"a "b"\c.ipynb"#),
            #"window.ganymede ? window.ganymede.command(...["open","a \"b\"\\c.ipynb"]) : false"#
        )
    }

    func testSubtitleNamesTheKernelAndItsState() {
        var state = PageState()
        XCTAssertEqual(state.subtitle, "")
        state.path = "Io.ipynb"
        XCTAssertEqual(state.subtitle, "No kernel · Starts when you run a cell")
        state.kernelDisplayName = "TypeScript"
        state.status = "busy"
        XCTAssertEqual(state.subtitle, "TypeScript · Running")
        state.kernelMissing = true
        state.kernelDisplayName = "Python 3"
        state.status = "none"
        XCTAssertEqual(state.subtitle, "Python 3 (not installed) · Starts when you run a cell")
    }
}
