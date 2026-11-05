import XCTest

@MainActor
final class InspectorControllerTests: XCTestCase {
    func testShowsAndHides() {
        let inspector = InspectorController()
        XCTAssertFalse(inspector.isShown)
        inspector.toggle()
        XCTAssertTrue(inspector.isShown)
        XCTAssertEqual(inspector.tab, .outline)
        inspector.toggle()
        XCTAssertFalse(inspector.isShown)
    }

    func testShowsATab() {
        let inspector = InspectorController()
        inspector.show(.variables)
        XCTAssertTrue(inspector.isShown)
        XCTAssertEqual(inspector.tab, .variables)
    }

    func testAsksForVariablesOnlyWhileShowingThem() {
        let inspector = InspectorController()
        inspector.tab = .variables
        XCTAssertFalse(inspector.wantsVariables, "hidden")
        inspector.isShown = true
        XCTAssertTrue(inspector.wantsVariables)
        inspector.tab = .outline
        XCTAssertFalse(inspector.wantsVariables, "on the Outline")
    }

    func testKeepsItsWidthWithinLimits() {
        let inspector = InspectorController()
        XCTAssertEqual(inspector.width, InspectorController.defaultWidth)
        inspector.resize(to: 100, available: 1200)
        XCTAssertEqual(inspector.width, InspectorController.minWidth)
        inspector.resize(to: 900, available: 1200)
        XCTAssertEqual(inspector.width, InspectorController.maxWidth)
        // A narrow window leaves the notebook its room.
        inspector.resize(to: 400, available: 700)
        XCTAssertEqual(inspector.width, 700 - InspectorController.notebookRoom)
        // Never under the minimum, however narrow.
        inspector.resize(to: 400, available: 300)
        XCTAssertEqual(inspector.width, InspectorController.minWidth)
        inspector.resize(to: 300, available: .infinity)
        XCTAssertEqual(inspector.width, 300)
    }

    func testTabsKeepTheirStoredNames() {
        // `@SceneStorage("inspector.tab")` keeps the raw value.
        XCTAssertEqual(InspectorTab(rawValue: "variables"), .variables)
        XCTAssertEqual(InspectorTab(rawValue: "outline"), .outline)
        XCTAssertNil(InspectorTab(rawValue: "agent"))
    }
}
