import XCTest

/// The navigator's tabs for a place (#758): the Mac's and the iPad's.
final class NavigatorTabTests: XCTestCase {
    private let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"

    func testThisDeviceHasEveryTab() {
        XCTAssertEqual(NavigatorTab.tabs(for: .thisDevice), NavigatorTab.allCases)
    }

    func testAMachineHasNoRecentsButKeepsJournalsFilesSearchRunningAndOutline() {
        let tabs = NavigatorTab.tabs(for: .machine(id))
        XCTAssertFalse(tabs.contains(.recents))
        for tab in [NavigatorTab.files, .search, .running, .outline, .journals] {
            XCTAssertTrue(tabs.contains(tab), "\(tab)")
        }
    }

    func testJournalsIsInEveryPlacesTabs() {
        for place in [Place.thisDevice, .machine(id)] {
            XCTAssertTrue(NavigatorTab.tabs(for: place).contains(.journals), "\(place)")
        }
    }
}
