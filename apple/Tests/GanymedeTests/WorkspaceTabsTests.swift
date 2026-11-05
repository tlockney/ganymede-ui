#if os(macOS)
import AppKit
import XCTest

/// Notebook, file and terminal windows as tabs of one window (#247).
@MainActor
final class WorkspaceTabsTests: XCTestCase {
    private func window() -> NSWindow {
        NSWindow(contentRect: NSRect(x: 0, y: 0, width: 200, height: 100), styleMask: [.titled], backing: .buffered, defer: true)
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
}
#endif
