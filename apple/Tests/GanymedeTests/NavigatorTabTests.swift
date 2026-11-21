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

    // MARK: Journals poll (#762)

    func testTheIPadPollsJournalsOnlyOnItsTabWithTheSidebarAndColumnShown() {
        XCTAssertTrue(NavigatorTab.showsJournals(tabbed: true, tab: .journals, listShown: true, columnShown: true))
        XCTAssertFalse(
            NavigatorTab.showsJournals(tabbed: true, tab: .journals, listShown: true, columnShown: false),
            "column collapsed")
        XCTAssertFalse(
            NavigatorTab.showsJournals(tabbed: true, tab: .journals, listShown: false, columnShown: true),
            "sidebar gone")
        XCTAssertFalse(NavigatorTab.showsJournals(tabbed: true, tab: .files, listShown: true, columnShown: true))
    }

    func testTheIPhonePollsJournalsWhileItsListShowsWhateverTheTabOrColumn() {
        for tab in NavigatorTab.allCases {
            for column in [true, false] {
                XCTAssertTrue(
                    NavigatorTab.showsJournals(tabbed: false, tab: tab, listShown: true, columnShown: column), "\(tab)")
                XCTAssertFalse(
                    NavigatorTab.showsJournals(tabbed: false, tab: tab, listShown: false, columnShown: column), "\(tab)")
            }
        }
    }

    func testTheIPadsSidebarColumnIsHiddenWhenCollapsedOrAutomaticInPortrait() {
        XCTAssertFalse(NavigatorTab.sidebarColumnShown(.detailOnly, portrait: false, compact: false))
        XCTAssertFalse(NavigatorTab.sidebarColumnShown(.detailOnly, portrait: true, compact: false))
        XCTAssertFalse(NavigatorTab.sidebarColumnShown(.automatic, portrait: true, compact: false))
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.automatic, portrait: false, compact: false))
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.all, portrait: true, compact: false))
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.doubleColumn, portrait: false, compact: false))
    }

    func testACompactIPadWindowLeavesItToTheSidebar() {
        // One stack: the sidebar's own appear and disappear say whether it shows.
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.detailOnly, portrait: true, compact: true))
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.automatic, portrait: true, compact: true))
    }
}
