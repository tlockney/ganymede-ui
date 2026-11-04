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
