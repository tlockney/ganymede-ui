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
            "kernelVersionLine": "cdp-kernel 0.14.0 · node 24.11.0",
            "kernelMissing": false,
            "locked": true,
            "trusted": true,
            "hostGrants": true,
            "publish": true,
            "runParams": true,
            "accessWanted": ["notebooks.run"],
            "cellType": "markdown",
            "journal": true,
            "kernels": [["name": "cdp", "displayName": "TypeScript", "device": true]],
            "backend": ["label": "Ganymede", "detail": "local server"],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.path, "moons/Io.ipynb")
        XCTAssertEqual(state?.kernelVersionLine, "cdp-kernel 0.14.0 · node 24.11.0")
        XCTAssertEqual(state?.locked, true)
        XCTAssertEqual(state?.hostGrants, true)
        XCTAssertEqual(state?.publish, true)
        XCTAssertEqual(state?.runParams, true)
        XCTAssertEqual(state?.accessWanted, ["notebooks.run"])
        XCTAssertEqual(state?.dirty, true)
        XCTAssertEqual(state?.isBusy, true)
        XCTAssertEqual(state?.hasKernel, true)
        XCTAssertEqual(state?.cellType, "markdown")
        XCTAssertEqual(state?.journal, true)
        XCTAssertEqual(state?.journalToggleTitle, "Open as Notebook")
        XCTAssertEqual(state?.hasNotebook, true)
        XCTAssertEqual(state?.editsCells, false, "the journal hides the cells")
        XCTAssertEqual(state?.kernels, [PageState.Kernel(name: "cdp", displayName: "TypeScript", device: true)])
        XCTAssertEqual(state?.backend?.detail, "local server")
        XCTAssertEqual(state?.sessions, [])
    }

    func testReadsTheNotebookTitle() {
        let body: [String: Any] = [
            "path": "moons/Io.ipynb", "title": "Io moons", "dirty": false,
            "kernelMissing": false, "trusted": true, "kernels": [Any](), "backend": NSNull(),
        ]
        XCTAssertEqual(PageState(body: body)?.title, "Io moons")
        // Absent from a page older than #867, and from a notebook without one.
        var older = body
        older["title"] = nil
        XCTAssertEqual(PageState(body: older)?.path, "moons/Io.ipynb", "decoded")
        XCTAssertNil(PageState(body: older)?.title)
        var none = body
        none["title"] = NSNull()
        XCTAssertEqual(PageState(body: none)?.path, "moons/Io.ipynb", "decoded")
        XCTAssertNil(PageState(body: none)?.title)
    }

    func testReadsTheRunningSessions() {
        let body: [String: Any] = [
            "path": "moons/Io.ipynb", "dirty": false, "status": "idle", "kernel": "cdp",
            "kernelDisplayName": "TypeScript", "kernelMissing": false, "trusted": true,
            "cellType": "code", "kernels": [Any](), "backend": NSNull(),
            "running": [
                ["id": "s1", "path": "moons/Io.ipynb", "kernel": "TypeScript", "state": "busy", "kernelId": "k1"],
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
        XCTAssertEqual(state?.kernelID, "k1", "the open notebook's")
        XCTAssertNil(state?.sessions.last?.kernelID, "absent from an older page")
    }

    func testMarksKernelsThatOfferDevice() {
        let marked = PageState.Kernel(name: "cdp-browser", displayName: "TypeScript (in app)", device: true)
        XCTAssertEqual(marked.pickerName, "TypeScript (in app) ◆")
        XCTAssertEqual(marked.pickerLabel, "TypeScript (in app), offers the device API")
        // A page older than #648 sends no `device`, and false is the same.
        for device in [nil, false] as [Bool?] {
            let plain = PageState.Kernel(name: "python3", displayName: "Python 3", device: device)
            XCTAssertEqual(plain.pickerName, "Python 3")
            XCTAssertEqual(plain.pickerLabel, "Python 3")
        }
    }

    func testReadsAKernelWithNoDeviceField() {
        let body: [String: Any] = [
            "path": "Io.ipynb", "dirty": false, "status": "idle", "kernel": "py",
            "kernelDisplayName": "Python", "kernelMissing": false, "trusted": true,
            "cellType": "code", "backend": NSNull(), "running": [Any](),
            "kernels": [["name": "py", "displayName": "Python"]],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.kernels, [PageState.Kernel(name: "py", displayName: "Python")])
        XCTAssertEqual(state?.kernels.first?.device, nil)
    }

    func testNamesWhereAKernelRuns() {
        let body: [String: Any] = [
            "path": "Io.ipynb", "dirty": false, "status": "idle", "kernel": "py",
            "kernelDisplayName": "Python", "kernelMissing": false, "trusted": true,
            "cellType": "code", "backend": NSNull(), "running": [Any](),
            "kernels": [
                ["name": "py", "displayName": "Python", "gateway": "workmbp"],
                ["name": "cdp", "displayName": "TypeScript", "device": true, "gateway": "workmbp"],
                ["name": "js", "displayName": "JavaScript"],
            ],
            "kernelsRemote": ["name": "workmbp", "reachable": true],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.kernels.map(\.pickerName),
                       ["Python · workmbp", "TypeScript · workmbp ◆", "JavaScript"])
        XCTAssertEqual(state?.kernels.map(\.pickerLabel),
                       ["Python · workmbp", "TypeScript · workmbp, offers the device API", "JavaScript"])
        XCTAssertEqual(state?.kernelsRemote, PageState.Remote(name: "workmbp", reachable: true, error: nil))
        XCTAssertNil(state?.notAnswering(), "it answers")
    }

    func testSaysWhenTheRemoteIsntAnswering() {
        let body: [String: Any] = [
            "path": "Io.ipynb", "dirty": false, "status": "none", "kernelMissing": true,
            "trusted": true, "cellType": "code", "backend": NSNull(), "running": [Any](),
            "kernels": [Any](),
            "kernelsRemote": ["name": "workmbp", "reachable": false, "error": "gateway: error sending request"],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.notAnswering(), "workmbp isn’t answering: gateway: error sending request")
        XCTAssertEqual(state?.notAnswering(machine: "m5air"),
                       "m5air runs kernels on workmbp, which isn’t answering")
        XCTAssertEqual(state?.notAnswering(machine: ""), "workmbp isn’t answering: gateway: error sending request")
    }

    func testNoRemoteLineWithoutARemoteOrAnError() throws {
        let local: [String: Any] = [
            "path": "Io.ipynb", "dirty": false, "kernelMissing": false,
            "trusted": true, "kernels": [Any](),
        ]
        let here = try XCTUnwrap(PageState(body: local))
        XCTAssertNil(here.notAnswering(), "a page whose kernels run here, or older than #832")
        for remote in [
            ["name": "workmbp", "reachable": false],
            ["name": "workmbp", "reachable": false, "error": ""],
        ] as [[String: Any]] {
            var body = local
            body["kernelsRemote"] = remote
            let state = try XCTUnwrap(PageState(body: body), "\(remote)")
            XCTAssertNil(state.notAnswering(), "\(remote)")
        }
    }

    func testReadsTheKernelsMemory() {
        let body: [String: Any] = [
            "path": "Io.ipynb", "dirty": false, "status": "idle", "kernel": "cdp",
            "kernelDisplayName": "TypeScript", "kernelMissing": false, "trusted": true,
            "cellType": "code", "kernels": [Any](), "backend": NSNull(),
            "running": [
                ["id": "s1", "path": "Io.ipynb", "kernel": "TypeScript", "state": "idle",
                 "kernelId": "k1", "memory": 61_865_984],
                ["id": "s2", "path": "Europa.ipynb", "kernel": "TypeScript", "state": "idle",
                 "kernelId": "k2", "memory": NSNull()],
                // A page from before #241 sends none.
                ["id": "s3", "path": "Callisto.ipynb", "kernel": NSNull(), "state": NSNull()],
            ],
        ]
        let sessions = PageState(body: body)?.sessions ?? []
        XCTAssertEqual(sessions.map(\.memory), [61_865_984, nil, nil])
        XCTAssertNotNil(sessions[0].memoryLabel)
        XCTAssertTrue(sessions[0].memoryLabel?.contains("MB") ?? false, sessions[0].memoryLabel ?? "")
        XCTAssertNil(sessions[1].memoryLabel)
    }

    func testTellsThePageToWatchMemoryOnlyAtTheEdges() {
        var watch = MemoryWatch()
        XCTAssertNil(watch.onReload, "nobody watches")
        XCTAssertEqual(watch.change(watching: true), "on", "the Running list shows")
        XCTAssertNil(watch.change(watching: true), "the popover too: already on")
        XCTAssertEqual(watch.onReload, "on")
        XCTAssertNil(watch.change(watching: false), "the popover closes: the list still shows")
        XCTAssertEqual(watch.change(watching: false), "off")
        XCTAssertNil(watch.change(watching: false), "an extra stop changes nothing")
        XCTAssertEqual(watch.watchers, 0)
        XCTAssertEqual(watch.change(watching: true), "on")
    }

    func testReadsTheOutline() {
        var body: [String: Any] = [
            "path": "Io.ipynb", "dirty": false, "status": "idle", "kernel": "cdp",
            "kernelDisplayName": "TypeScript", "kernelMissing": false, "trusted": true,
            "cellType": "code", "kernels": [Any](), "backend": NSNull(),
            "outline": [
                ["level": 1, "text": "Io", "cell": 0],
                ["level": 2, "text": "Volcanoes & plumes", "cell": 3],
            ],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.headings, [
            PageState.Heading(level: 1, text: "Io", cell: 0),
            PageState.Heading(level: 2, text: "Volcanoes & plumes", cell: 3),
        ])
        // A page from before #212 sends none.
        body["outline"] = nil
        XCTAssertEqual(PageState(body: body)?.headings, [])
    }

    func testReadsTheVariables() throws {
        var body: [String: Any] = [
            "path": "Io.ipynb", "dirty": false, "status": "idle", "kernel": "cdp",
            "kernelDisplayName": "TypeScript", "kernelMissing": false, "trusted": true,
            "cellType": "code", "kernels": [Any](), "backend": NSNull(),
            "variables": [
                "state": "ready", "message": NSNull(),
                "rows": [
                    ["name": "a", "type": "object", "value": "{…}", "path": ["a"], "depth": 0,
                     "expandable": true, "expanded": true],
                    ["name": "x", "type": "number", "value": "1", "path": ["a", "x"], "depth": 1,
                     "expandable": false, "expanded": false],
                ],
            ],
        ]
        let variables = try XCTUnwrap(PageState(body: body)?.variables)
        XCTAssertEqual(variables.state, "ready")
        XCTAssertNil(variables.message)
        XCTAssertEqual(variables.rows.map(\.name), ["a", "x"])
        XCTAssertEqual(variables.rows[1].depth, 1)
        XCTAssertNotEqual(variables.rows[0].id, variables.rows[1].id)
        // The `toggle-variable` argument is the row's path as JSON.
        let path = PageState.variablePath(variables.rows[1])
        XCTAssertEqual(try JSONSerialization.jsonObject(with: Data(path.utf8)) as? [String], ["a", "x"])
        // Null while the inspector doesn't show them, and absent from an
        // older page.
        body["variables"] = NSNull()
        XCTAssertNotNil(PageState(body: body))
        XCTAssertNil(PageState(body: body)?.variables)
        body["variables"] = nil
        XCTAssertNil(PageState(body: body)?.variables)
    }

    func testReadsTheConsoleAndRecentConsoles() throws {
        var body: [String: Any] = [
            "path": NSNull(), "dirty": false, "status": NSNull(), "kernel": NSNull(),
            "kernelDisplayName": NSNull(), "kernelMissing": false, "trusted": true,
            "cellType": NSNull(), "kernels": [Any](), "backend": NSNull(), "running": [Any](),
        ]
        // A page older than #735 posts neither: nothing to rename.
        XCTAssertNil(PageState(body: body)?.console)
        XCTAssertNil(PageState(body: body)?.consoles)
        XCTAssertEqual(PageState(body: body)?.canRename, false)

        body["console"] = ["id": "0f8fad5b-d9cb-469f-a165-70867728950e", "name": "Orbits"]
        body["consoles"] = [
            ["id": "a", "name": "Orbits", "folder": "moons"],
            ["id": "b", "name": "Console 2", "folder": ""],
        ]
        let state = PageState(body: body)
        XCTAssertEqual(state?.console?.name, "Orbits")
        // File > Rename… names the console though no notebook is open.
        XCTAssertEqual(state?.hasNotebook, false)
        XCTAssertEqual(state?.canRename, true)
        XCTAssertEqual(state?.consoles?.map(\.menuTitle), ["Orbits · moons", "Console 2 · /"])
        XCTAssertEqual(state?.consoles?.map(\.id), ["a", "b"])

        body["console"] = NSNull()
        XCTAssertNil(PageState(body: body)?.console)
        body["path"] = "Io.ipynb"
        XCTAssertEqual(PageState(body: body)?.canRename, true)
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
        // A CSV, TSV, JSON or Parquet file opens in the page on any server (#671).
        let data = PageState.Search.Match(path: "moons/Io.CSV", name: "Io.CSV", type: "file", snippet: nil)
        XCTAssertTrue(data.isData)
        XCTAssertTrue(data.opensInPage)
        XCTAssertTrue(search.opens(data))
        XCTAssertFalse(file.isData)
        XCTAssertFalse(file.opensInPage)
        XCTAssertFalse(matches[0].isData)
        XCTAssertTrue(matches[0].opensInPage)
        let folder = PageState.Search.Match(path: "a.csv", name: "a.csv", type: "directory", snippet: nil)
        XCTAssertFalse(folder.isData)
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

    func testStatusLabelsNameTheKernelState() {
        XCTAssertEqual(PageState.statusLabel("busy"), "Running")
        XCTAssertEqual(PageState.statusLabel("autorestarting"), "Restarting")
        XCTAssertEqual(PageState.statusLabel("none"), "Starts when you run a cell")
        XCTAssertEqual(PageState.statusLabel(nil), "Starts when you run a cell")
    }

    /// A page older than #812 doesn't send `locked`.
    func testLockedIsAbsentFromAnOlderPage() {
        let body: [String: Any] = [
            "path": "Io.ipynb", "dirty": false, "status": "idle", "kernel": "cdp",
            "kernelDisplayName": "TypeScript", "kernelMissing": false, "trusted": true,
            "cellType": "code", "kernels": [Any](), "backend": NSNull(),
        ]
        XCTAssertNil(PageState(body: body)?.locked)
    }

    /// A data file open in the page has no kernel or cells: the notebook
    /// menus disable (#671).
    func testADataFileIsNotANotebook() {
        var state = PageState()
        state.path = "Io.ipynb"
        XCTAssertTrue(state.hasNotebook)
        XCTAssertFalse(state.showsData)
        for path in ["moons/Io.csv", "a.TSV", "a.json", "dir/a.parquet"] {
            state.path = path
            XCTAssertFalse(state.hasNotebook, path)
            XCTAssertTrue(state.showsData, path)
        }
        state.path = "notes.md"
        XCTAssertTrue(state.hasNotebook)
        state.path = nil
        XCTAssertFalse(state.hasNotebook)
        XCTAssertFalse(state.showsData)
    }
}
