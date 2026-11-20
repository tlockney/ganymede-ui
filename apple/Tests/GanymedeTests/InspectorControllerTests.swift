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

    // MARK: Only on a notebook tab (#729)

    private func state(path: String?) -> PageState {
        var state = PageState()
        state.path = path
        return state
    }

    func testAnUnavailableInspectorKeepsTheChoiceAndStaysOffScreen() {
        let inspector = InspectorController()
        inspector.show(.variables)
        XCTAssertTrue(inspector.isVisible)
        XCTAssertTrue(inspector.wantsVariables)
        // A console tab: hidden, and the page isn't asked for variables.
        inspector.available = false
        XCTAssertTrue(inspector.isShown, "the choice is kept for the notebook tab")
        XCTAssertFalse(inspector.isVisible)
        XCTAssertFalse(inspector.wantsVariables)
        // Back on a notebook it comes back as it was.
        inspector.available = true
        XCTAssertTrue(inspector.isVisible)
        XCTAssertEqual(inspector.tab, .variables)
    }

    func testAnInspectorThatWasHiddenStaysHiddenOnANotebook() {
        let inspector = InspectorController()
        inspector.available = true
        XCTAssertFalse(inspector.isVisible)
    }

    func testOnlyANotebookTabHasAnInspector() {
        let notebook = WindowTarget.file(URL(fileURLWithPath: "/tmp/a.ipynb"))
        let console = WindowTarget.console(folder: URL(fileURLWithPath: "/tmp", isDirectory: true), id: UUID())
        let folder = WindowTarget.folder(URL(fileURLWithPath: "/tmp", isDirectory: true))
        func shows(_ state: PageState, _ reported: Bool, _ target: WindowTarget) -> Bool {
            InspectorController.showsNotebook(state: state, pageReported: reported, target: target)
        }
        // Once the page has posted its state, it says.
        XCTAssertTrue(shows(state(path: "tmp/a.ipynb"), true, notebook))
        XCTAssertFalse(shows(state(path: nil), true, folder), "the start screen")
        XCTAssertFalse(shows(state(path: nil), true, console))
        XCTAssertFalse(shows(state(path: "tmp/data.csv"), true, notebook), "a data file")
        // The state wins over the target, which follows the page late.
        XCTAssertFalse(shows(state(path: nil), true, notebook))
    }

    func testAWindowOpenedOnANotebookKeepsItsInspectorWhileThePageLoads() {
        let loading = PageState()
        func shows(_ target: WindowTarget) -> Bool {
            InspectorController.showsNotebook(state: loading, pageReported: false, target: target)
        }
        XCTAssertTrue(shows(.file(URL(fileURLWithPath: "/tmp/a.ipynb"))))
        XCTAssertFalse(shows(.file(URL(fileURLWithPath: "/tmp/data.CSV"))))
        XCTAssertFalse(shows(.file(URL(fileURLWithPath: "/tmp/data.parquet"))))
        XCTAssertFalse(shows(.folder(URL(fileURLWithPath: "/tmp", isDirectory: true))))
        XCTAssertFalse(shows(.console(folder: URL(fileURLWithPath: "/tmp", isDirectory: true), id: UUID())))
    }
}
