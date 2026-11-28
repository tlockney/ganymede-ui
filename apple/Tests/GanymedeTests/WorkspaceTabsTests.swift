#if os(macOS)
import AppKit
import XCTest

/// Notebook, file and terminal windows as tabs of one window (#247).
@MainActor
final class WorkspaceTabsTests: XCTestCase {
    private var defaultsSuiteName = ""

    override func setUp() {
        super.setUp()
        defaultsSuiteName = "WorkspaceTabsTests.\(UUID().uuidString)"
        WorkspaceTabs.defaults = UserDefaults(suiteName: defaultsSuiteName)!
    }

    override func tearDown() {
        WorkspaceTabs.defaults = .standard
        if !defaultsSuiteName.isEmpty {
            UserDefaults.standard.removePersistentDomain(forName: defaultsSuiteName)
        }
        super.tearDown()
    }

    private func window() -> NSWindow {
        NSWindow(contentRect: NSRect(x: 0, y: 0, width: 200, height: 100), styleMask: [.titled], backing: .buffered, defer: true)
    }

    func testMarksTheTabWhileTheKernelIsBusy() {
        let w = window()
        XCTAssertNil(w.tab.accessoryView)
        WorkspaceTabs.markBusy(w, true)
        let dot = w.tab.accessoryView
        XCTAssertNotNil(dot)
        // Busy again keeps the same mark.
        WorkspaceTabs.markBusy(w, true)
        XCTAssertTrue(w.tab.accessoryView === dot)
        WorkspaceTabs.markBusy(w, false)
        XCTAssertNil(w.tab.accessoryView)
    }

    func testAJoinedWindowPrefersTabsWithTheSharedIdentifier() {
        let w = window()
        WorkspaceTabs.join(w)
        XCTAssertEqual(w.tabbingIdentifier, WorkspaceTabs.identifier)
        XCTAssertEqual(w.tabbingMode, .preferred)
    }

    func testAWindowOpenedAloneRefusesTabsOnlyAsItOpens() {
        let alone = window()
        WorkspaceTabs.join(alone, alone: true)
        XCTAssertEqual(alone.tabbingMode, .disallowed)
        let next = window()
        WorkspaceTabs.join(next)
        XCTAssertEqual(next.tabbingMode, .preferred)
        // After it has opened, the lone window takes tabs again.
        let opened = expectation(description: "next run loop")
        DispatchQueue.main.async { opened.fulfill() }
        wait(for: [opened], timeout: 1)
        XCTAssertEqual(alone.tabbingMode, .preferred)
    }

    func testNewTabAlwaysOpensAWindowAndLeavesItsRequestForIt() {
        var opened: [String] = []
        let folder = URL(fileURLWithPath: "/tmp/moons")
        WorkspaceTabs.open(target: .folder(folder), alone: true) { opened.append($0) }
        XCTAssertEqual(opened, [WorkspaceTabs.sceneID], "by id, so never an existing window")
        let request = WorkspaceTabs.pending
        XCTAssertEqual(request?.target, .folder(folder))
        XCTAssertEqual(request?.alone, true)
        WorkspaceTabs.take(request!)
        XCTAssertNil(WorkspaceTabs.pending, "taken by the window it opened")
    }

    func testAnUntakenRequestLapses() {
        WorkspaceTabs.open(target: .folder(URL(fileURLWithPath: "/tmp")), alone: true) { _ in }
        XCTAssertNotNil(WorkspaceTabs.pending)
        let lapsed = expectation(description: "lapsed")
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            lapsed.fulfill()
        }
        wait(for: [lapsed], timeout: 5)
        XCTAssertNil(WorkspaceTabs.pending)
    }

    func testJoiningTwiceChangesNothing() {
        let w = window()
        WorkspaceTabs.join(w)
        w.tabbingMode = .disallowed
        WorkspaceTabs.join(w)
        XCTAssertEqual(w.tabbingMode, .disallowed)
    }

    /// ⌘W closes the active tab only, and closing the last one leaves the
    /// app running (#407).
    func testCloseClosesOnlyTheActiveTab() {
        func tab() -> NSWindow {
            let w = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 200, height: 100), styleMask: [.titled, .closable], backing: .buffered, defer: false)
            w.isReleasedWhenClosed = false
            w.tabbingIdentifier = WorkspaceTabs.identifier
            return w
        }
        let first = tab()
        let second = tab()
        first.orderFront(nil)
        first.addTabbedWindow(second, ordered: .above)
        XCTAssertEqual(first.tabbedWindows?.count, 2)
        WorkspaceTabs.close(second)
        XCTAssertFalse(second.isVisible)
        XCTAssertTrue(first.isVisible, "the other tab stays open")
        XCTAssertEqual(first.tabbedWindows?.count ?? 1, 1)
        WorkspaceTabs.close(first)
        XCTAssertFalse(first.isVisible)
        XCTAssertFalse(WorkspaceTabs.quitsAfterLastTab)
    }

    /// Closing the last tab opens a window on the start screen (#407):
    /// a new one, on the folder, never one already showing it.
    func testOpenStartOpensANewWindowOnTheFolder() {
        var opened: [String] = []
        WorkspaceTabs.useOpener { opened.append($0) }
        defer { WorkspaceTabs.useOpener(nil) }
        let folder = URL(fileURLWithPath: "/tmp/moons")
        WorkspaceTabs.openStart(folder: folder)
        XCTAssertEqual(opened, [WorkspaceTabs.sceneID])
        XCTAssertEqual(WorkspaceTabs.pending?.target, .folder(folder))
        WorkspaceTabs.take(WorkspaceTabs.pending!)
    }

    /// The last notebook window to close asks for a start window on its
    /// own folder (#416); one closing while another is open asks nothing.
    func testTheLastWindowAsksForAStartWindowOnItsFolder() {
        let windows = OpenWindows()
        let projA = URL(fileURLWithPath: "/tmp/projA")
        let notebook = window()
        let other = window()
        windows.note(notebook, folder: projA, start: false)
        windows.add(other)
        XCTAssertEqual(windows.closing(other), .none, "the notebook is still open")
        XCTAssertEqual(windows.closing(notebook), .some(projA))
        XCTAssertFalse(windows.any)
    }

    /// Closing the start screen when it is the last window opens no other,
    /// so the app can be left with none (#416).
    func testClosingTheStartScreenOpensNoOther() {
        let windows = OpenWindows()
        let start = window()
        windows.note(start, folder: URL(fileURLWithPath: "/tmp"), start: true)
        XCTAssertEqual(windows.closing(start), .none)
        XCTAssertFalse(windows.any)
    }

    /// Hidden windows still count (#416): AppKit reports none visible
    /// while the app is hidden, which made a start window open beside them.
    func testAWindowThatIsNotVisibleStillCounts() {
        let windows = OpenWindows()
        let hidden = window()
        let closing = window()
        XCTAssertFalse(hidden.isVisible)
        windows.add(hidden)
        windows.note(closing, folder: nil, start: false)
        XCTAssertEqual(windows.closing(closing), .none)
        XCTAssertTrue(windows.any)
    }

    /// The Settings window and others that never joined don't count.
    func testOnlyTheAppsOwnWindowsCount() {
        let windows = OpenWindows()
        let settings = window()
        XCTAssertEqual(windows.closing(settings), .none)
        XCTAssertFalse(windows.any)
    }

    /// When the Step 6 custom tab strip toggle is enabled (#903), windows opt
    /// out of AppKit window tabbing and `close` routes to the registered
    /// in-window tab host first before closing the window.
    func testCustomTabStripOptInDisablesAppKitTabbingAndRoutesClose() {
        XCTAssertFalse(WorkspaceTabs.isCustomStripEnabled)
        WorkspaceTabs.defaults.set(true, forKey: SettingsTab.customTabsKey)
        XCTAssertTrue(WorkspaceTabs.isCustomStripEnabled)

        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 200, height: 100),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        w.isReleasedWhenClosed = false
        WorkspaceTabs.join(w)
        XCTAssertEqual(w.tabbingMode, .disallowed)

        var closedInPlace = 0
        var shouldCloseInPlace = true
        WorkspaceTabs.registerCustomTabHost(
            for: w,
            actions: WorkspaceTabs.CustomTabActions(
                closeActiveTab: {
                    guard shouldCloseInPlace else { return false }
                    closedInPlace += 1
                    return true
                },
                openNewTab: { _ in false },
                selectNextTab: {},
                selectPreviousTab: {}
            )
        )
        defer { WorkspaceTabs.unregisterCustomTabHost(for: w) }

        w.orderFront(nil)
        WorkspaceTabs.close(w)
        XCTAssertEqual(closedInPlace, 1)
        XCTAssertTrue(w.isVisible, "closing an in-window tab keeps the window open")

        shouldCloseInPlace = false
        WorkspaceTabs.close(w)
        XCTAssertFalse(w.isVisible, "closing the last tab closes the window")
    }

    // MARK: Focus existing tab from sidebar (#884)

    func testOpenOrFocusBringsExistingTabForwardWithoutReplacingFrontTab() {
        func tab() -> NSWindow {
            let w = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 200, height: 100),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            w.isReleasedWhenClosed = false
            w.tabbingIdentifier = WorkspaceTabs.identifier
            return w
        }
        let dir = URL(fileURLWithPath: "/tmp/work", isDirectory: true)
        let nb399 = dir.appendingPathComponent("nb399.ipynb")
        let other = dir.appendingPathComponent("other.ipynb")
        let third = dir.appendingPathComponent("third.ipynb")

        let first = tab()
        let second = tab()
        defer {
            WorkspaceTabs.windows.closing(first)
            WorkspaceTabs.windows.closing(second)
            first.close()
            second.close()
        }
        first.orderFront(nil)
        first.addTabbedWindow(second, ordered: .above)
        second.makeKeyAndOrderFront(nil)
        XCTAssertTrue(first.tabGroup?.selectedWindow === second)

        WorkspaceTabs.note(first, target: .file(nb399), folder: dir, start: false)
        WorkspaceTabs.note(second, target: .file(other), folder: dir, start: false)

        let frontPage = PageModel()
        WorkspaceTabs.openOrFocus(.file(nb399), serverPath: "tmp/work/nb399.ipynb", in: frontPage)
        XCTAssertTrue(first.tabGroup?.selectedWindow === first, "existing nb399 tab should come forward")
        XCTAssertEqual(frontPage.pendingCount, 0, "front tab should not load a second copy")

        WorkspaceTabs.openOrFocus(.file(third), serverPath: "tmp/work/third.ipynb", in: frontPage)
        XCTAssertEqual(frontPage.pendingCount, 1, "unopened notebook opens in the current tab")
        XCTAssertTrue(first.tabGroup?.selectedWindow === first)
    }

    func testOpenWindowsTracksInPlaceNavigationPreferenceAndClosing() throws {
        let fm = FileManager.default
        let base = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let realDir = base.appendingPathComponent("real", isDirectory: true)
        try fm.createDirectory(at: realDir, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: base) }
        let linkDir = base.appendingPathComponent("link", isDirectory: true)
        try fm.createSymbolicLink(at: linkDir, withDestinationURL: realDir)
        let nb399 = realDir.appendingPathComponent("nb399.ipynb")
        try Data("{}".utf8).write(to: nb399)
        let nb399Link = linkDir.appendingPathComponent("nb399.ipynb")
        let other = realDir.appendingPathComponent("other.ipynb")

        let windows = OpenWindows()
        let w1 = window()
        let w2 = window()
        let machineWin = window()

        // Started as a folder window, then opened nb399 in place.
        windows.note(w1, target: .folder(realDir), folder: realDir, start: true)
        XCTAssertNil(windows.window(showing: .file(nb399)))
        windows.note(w1, target: .file(nb399), folder: realDir, start: false)
        XCTAssertTrue(windows.window(showing: .file(nb399Link)) === w1)

        // Machine target of the same relative path stays distinct from local file.
        let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"
        let machineTarget = try XCTUnwrap(WindowTarget.machine(id, path: "/nb399.ipynb", isFolder: false))
        windows.note(machineWin, target: machineTarget, folder: nil, start: false)
        XCTAssertTrue(windows.window(showing: machineTarget) === machineWin)
        XCTAssertTrue(windows.window(showing: .file(URL(fileURLWithPath: "/nb399.ipynb"))) == nil)

        // Preferred window wins when multiple match; otherwise ordered list decides.
        windows.note(w2, target: .file(nb399), folder: realDir, start: false)
        XCTAssertTrue(windows.window(showing: .file(nb399), preferring: w2, ordered: [w1, w2]) === w2)
        XCTAssertTrue(windows.window(showing: .file(nb399), preferring: nil, ordered: [w1, w2]) === w1)

        // Navigating away or closing stops matching nb399.
        windows.note(w1, target: .file(other), folder: realDir, start: false)
        XCTAssertTrue(windows.window(showing: .file(nb399)) === w2)
        _ = windows.closing(w2)
        XCTAssertNil(windows.window(showing: .file(nb399)))
    }

    func testOpenOrFocusTabSkipsOpeningNewWindowWhenAlreadyOpen() {
        let dir = URL(fileURLWithPath: "/tmp/work", isDirectory: true)
        let nb399 = dir.appendingPathComponent("nb399.ipynb")
        let other = dir.appendingPathComponent("other.ipynb")
        let existing = window()
        defer { WorkspaceTabs.windows.closing(existing) }
        WorkspaceTabs.note(existing, target: .file(nb399), folder: dir, start: false)

        var opened: [WindowTarget] = []
        WorkspaceTabs.openOrFocusTab(.file(nb399)) { opened.append($0) }
        XCTAssertTrue(opened.isEmpty)

        WorkspaceTabs.openOrFocusTab(.file(other)) { opened.append($0) }
        XCTAssertEqual(opened, [.file(other)])
    }
}
#endif
