#if os(macOS)
import AppKit
import XCTest

/// Notebook, file and terminal windows as tabs of one window (#247).
@MainActor
final class WorkspaceTabsTests: XCTestCase {
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
        WorkspaceTabs.open(folder: folder, alone: true) { opened.append($0) }
        XCTAssertEqual(opened, [WorkspaceTabs.sceneID], "by id, so never an existing window")
        let request = WorkspaceTabs.pending
        XCTAssertEqual(request?.folder, folder)
        XCTAssertEqual(request?.alone, true)
        WorkspaceTabs.take(request!)
        XCTAssertNil(WorkspaceTabs.pending, "taken by the window it opened")
    }

    func testAnUntakenRequestLapses() {
        WorkspaceTabs.open(folder: URL(fileURLWithPath: "/tmp"), alone: true) { _ in }
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
        XCTAssertTrue(WorkspaceTabs.anyOpen(in: [first, second], except: second))
        XCTAssertFalse(WorkspaceTabs.anyOpen(in: [first, second], except: first), "first is the last tab")
        WorkspaceTabs.close(first)
        XCTAssertFalse(first.isVisible)
        XCTAssertFalse(WorkspaceTabs.anyOpen(in: [first, second]))
        XCTAssertFalse(WorkspaceTabs.quitsAfterLastTab)
    }

    /// Closing the last tab opens a window on the start screen (#407):
    /// a new one, on the folder, never one already showing it.
    func testOpenStartOpensANewWindowOnTheFolder() {
        var opened: [String] = []
        WorkspaceTabs.useOpener { opened.append($0) }
        let folder = URL(fileURLWithPath: "/tmp/moons")
        WorkspaceTabs.openStart(folder: folder)
        XCTAssertEqual(opened, [WorkspaceTabs.sceneID])
        XCTAssertEqual(WorkspaceTabs.pending?.folder, folder)
        WorkspaceTabs.take(WorkspaceTabs.pending!)
    }

    func testOnlyTheAppsOwnWindowsCount() {
        let settings = window()
        settings.orderFront(nil)
        defer { settings.orderOut(nil) }
        XCTAssertTrue(settings.isVisible)
        XCTAssertFalse(WorkspaceTabs.anyOpen(in: [settings]))
    }
}
#endif
