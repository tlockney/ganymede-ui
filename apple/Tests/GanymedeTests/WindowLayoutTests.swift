import XCTest

final class WindowLayoutTests: XCTestCase {
    func testFillsAndRestores() {
        var layout = WindowLayout()
        XCTAssertNil(layout.filled)
        layout.toggle(.panel)
        XCTAssertEqual(layout.filled, .panel)
        // Another area's control moves the fill to it.
        layout.toggle(.inspector)
        XCTAssertEqual(layout.filled, .inspector)
        // Its own control restores.
        layout.toggle(.inspector)
        XCTAssertNil(layout.filled)
        layout.toggle(.notebook)
        layout.restore()
        XCTAssertNil(layout.filled)
    }

    func testShowsTheFilledAreaAndFoldsTheOthers() {
        var layout = WindowLayout()
        XCTAssertTrue(layout.shows(.panel, normally: true))
        XCTAssertFalse(layout.shows(.inspector, normally: false))
        XCTAssertFalse(layout.folds(.panel))
        layout.toggle(.panel)
        XCTAssertTrue(layout.shows(.panel, normally: false), "filled, even when it was hidden")
        XCTAssertFalse(layout.shows(.notebook, normally: true))
        XCTAssertFalse(layout.shows(.inspector, normally: true))
        XCTAssertTrue(layout.folds(.notebook))
        XCTAssertTrue(layout.folds(.inspector))
        XCTAssertFalse(layout.folds(.panel))
    }

    func testShowingOrHidingAnotherAreaRestores() {
        var layout = WindowLayout()
        layout.noteChange(of: .panel, shown: true)
        XCTAssertNil(layout.filled, "nothing to restore")

        layout.toggle(.panel)
        // Filling the panel shows it: it stays filled.
        layout.noteChange(of: .panel, shown: true)
        XCTAssertEqual(layout.filled, .panel)
        // ⌃` hides it: the layout comes back.
        layout.noteChange(of: .panel, shown: false)
        XCTAssertNil(layout.filled)

        layout.toggle(.notebook)
        // ⌥⌘0 shows the inspector over a filled notebook: it shows.
        layout.noteChange(of: .inspector, shown: true)
        XCTAssertNil(layout.filled)
    }
}
