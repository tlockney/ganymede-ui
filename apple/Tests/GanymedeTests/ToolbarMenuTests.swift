import XCTest

/// The toolbar's menus on the Mac (#892): the More menu's Terminal Panel
/// item names what pressing it does, as View › Terminal Panel does.
final class ToolbarMenuTests: XCTestCase {
    func testTheTerminalPanelItemShowsThePanelWhileItIsHidden() {
        XCTAssertEqual(ToolbarMenu.terminalPanelTitle(shown: false), "Show Terminal Panel")
    }

    func testTheTerminalPanelItemHidesThePanelWhileItShows() {
        XCTAssertEqual(ToolbarMenu.terminalPanelTitle(shown: true), "Hide Terminal Panel")
    }
}
