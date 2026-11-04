#if os(macOS)
import AppKit
import XCTest

/// Notebook, file and terminal windows as tabs of one window (#247).
@MainActor
final class WorkspaceTabsTests: XCTestCase {
    private func window() -> NSWindow {
        NSWindow(contentRect: NSRect(x: 0, y: 0, width: 200, height: 100), styleMask: [.titled], backing: .buffered, defer: true)
    }

    override func tearDown() {
        WorkspaceTabs.nextOpensAlone = false
        super.tearDown()
    }

    func testAJoinedWindowPrefersTabsWithTheSharedIdentifier() {
        let w = window()
        WorkspaceTabs.join(w)
        XCTAssertEqual(w.tabbingIdentifier, WorkspaceTabs.identifier)
        XCTAssertEqual(w.tabbingMode, .preferred)
    }

    func testNewWindowOpensAloneOnceThenAcceptsTabs() {
        WorkspaceTabs.nextOpensAlone = true
        let alone = window()
        WorkspaceTabs.join(alone)
        XCTAssertEqual(alone.tabbingMode, .disallowed)
        XCTAssertFalse(WorkspaceTabs.nextOpensAlone, "only the next window")
        let next = window()
        WorkspaceTabs.join(next)
        XCTAssertEqual(next.tabbingMode, .preferred)
        // After it has opened, the lone window takes tabs again.
        let opened = expectation(description: "next run loop")
        DispatchQueue.main.async { opened.fulfill() }
        wait(for: [opened], timeout: 1)
        XCTAssertEqual(alone.tabbingMode, .preferred)
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
