import XCTest

/// A notebook window's bottom panel of terminals (#248).
@MainActor
final class PanelControllerTests: XCTestCase {
    private let here = TerminalTarget.local(folder: URL(fileURLWithPath: "/Users/me/Jupiter"))

    func testShowingAnEmptyPanelStartsATerminal() {
        let panel = PanelController()
        panel.toggle(startingOn: here)
        XCTAssertTrue(panel.isShown)
        XCTAssertEqual(panel.terminals.map(\.target), [here])
        XCTAssertEqual(panel.selection, panel.terminals.first?.id)
    }

    func testHidingKeepsTheTerminalsAndShowingAgainAddsNone() {
        let panel = PanelController()
        panel.toggle(startingOn: here)
        panel.toggle(startingOn: here)
        XCTAssertFalse(panel.isShown)
        XCTAssertEqual(panel.terminals.count, 1)
        panel.toggle(startingOn: here)
        XCTAssertTrue(panel.isShown)
        XCTAssertEqual(panel.terminals.count, 1)
    }

    func testANewTerminalIsSelectedAndShowsThePanel() {
        let panel = PanelController()
        let first = panel.add(here)
        panel.isShown = false
        let second = panel.add(.server(UUID()))
        XCTAssertTrue(panel.isShown)
        XCTAssertEqual(panel.terminals.map(\.id), [first.id, second.id])
        XCTAssertEqual(panel.selection, second.id)
    }

    func testClosingTheSelectedTerminalSelectsItsNeighbour() {
        let panel = PanelController()
        let a = panel.add(here)
        let b = panel.add(here)
        let c = panel.add(here)
        panel.selection = b.id
        panel.close(b.id)
        XCTAssertEqual(panel.selection, c.id, "the one to its right")
        panel.close(c.id)
        XCTAssertEqual(panel.selection, a.id, "the last one: the one to its left")
    }

    func testClosingAnotherTerminalKeepsTheSelection() {
        let panel = PanelController()
        let a = panel.add(here)
        let b = panel.add(here)
        panel.close(a.id)
        XCTAssertEqual(panel.selection, b.id)
    }

    func testClosingTheLastTerminalHidesThePanel() {
        let panel = PanelController()
        let a = panel.add(here)
        panel.close(a.id)
        XCTAssertFalse(panel.isShown)
        XCTAssertNil(panel.selection)
        XCTAssertTrue(panel.terminals.isEmpty)
    }

    func testTheKernelLogShowsOverTheTerminalsWithoutStartingOne() {
        let panel = PanelController()
        panel.showLog()
        XCTAssertTrue(panel.isShown)
        XCTAssertTrue(panel.showsLog)
        XCTAssertTrue(panel.terminals.isEmpty, "the log needs no terminal")
        panel.toggle(startingOn: here)
        panel.toggle(startingOn: here)
        XCTAssertTrue(panel.terminals.isEmpty, "showing it again keeps the log")
        let a = panel.add(here)
        XCTAssertFalse(panel.showsLog, "a new terminal is on show")
        panel.showLog()
        panel.close(a.id)
        XCTAssertTrue(panel.isShown, "the log stays when the last terminal closes")
        let b = panel.add(here)
        panel.showLog()
        panel.select(b.id)
        XCTAssertFalse(panel.showsLog)
        XCTAssertEqual(panel.selection, b.id)
    }

    func testTheHeightStaysBetweenTheMinimumAndRoomForTheNotebook() {
        let panel = PanelController()
        panel.resize(to: 40, available: 800)
        XCTAssertEqual(panel.height, PanelController.minHeight)
        panel.resize(to: 900, available: 800)
        XCTAssertEqual(panel.height, 800 - PanelController.notebookRoom)
        panel.resize(to: 300, available: 800)
        XCTAssertEqual(panel.height, 300)
        // A window too short for both keeps the panel at its minimum.
        panel.resize(to: 300, available: 200)
        XCTAssertEqual(panel.height, PanelController.minHeight)
    }

    func testAStoredHeightBelowTheMinimumIsRaised() {
        let panel = PanelController()
        panel.resize(to: 10, available: .infinity)
        XCTAssertEqual(panel.height, PanelController.minHeight)
    }
}
