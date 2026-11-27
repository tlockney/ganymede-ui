import XCTest

/// The navigator's tabs for a place (#758): the Mac's and the iPad's.
final class NavigatorTabTests: XCTestCase {
    private let id = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"

    func testTheMacHasFindInPlaceOfSearchAndOutline() {
        XCTAssertEqual(
            NavigatorTab.tabs(for: .thisDevice, on: .mac),
            [.files, .find, .running, .recents, .journals])
        XCTAssertEqual(
            NavigatorTab.tabs(for: .machine(id), on: .mac),
            [.files, .find, .running, .journals])
        let tabs = NavigatorTab.tabs(for: .thisDevice, on: .mac)
        XCTAssertFalse(tabs.contains(.search))
        XCTAssertFalse(tabs.contains(.outline))
    }

    func testTheIPadKeepsSearchAndOutlineAndNoFind() {
        XCTAssertEqual(
            NavigatorTab.tabs(for: .thisDevice, on: .iPad),
            [.files, .search, .running, .outline, .recents, .journals])
        XCTAssertEqual(
            NavigatorTab.tabs(for: .machine(id), on: .iPad),
            [.files, .search, .running, .outline, .journals])
        XCTAssertFalse(NavigatorTab.tabs(for: .thisDevice, on: .iPad).contains(.find))
    }

    func testAMachineHasNoRecents() {
        for platform in [NavigatorTab.SidebarPlatform.mac, .iPad] {
            XCTAssertFalse(NavigatorTab.tabs(for: .machine(id), on: platform).contains(.recents), "\(platform)")
        }
    }

    func testAStoredSearchOrOutlineShowsAsFindOnAMacWindow() {
        let mac = NavigatorTab.tabs(for: .thisDevice, on: .mac)
        XCTAssertEqual(NavigatorTab.shown(.search, in: mac), .find)
        XCTAssertEqual(NavigatorTab.shown(.outline, in: mac), .find)
        XCTAssertEqual(NavigatorTab.shown(.files, in: mac), .files)
        // A machine's window has no Recents: the stored tab is Files.
        XCTAssertEqual(
            NavigatorTab.shown(.recents, in: NavigatorTab.tabs(for: .machine(id), on: .mac)), .files)
        // The iPad keeps showing its own Search and Outline.
        let iPad = NavigatorTab.tabs(for: .thisDevice, on: .iPad)
        XCTAssertEqual(NavigatorTab.shown(.search, in: iPad), .search)
        XCTAssertEqual(NavigatorTab.shown(.outline, in: iPad), .outline)
        // Find isn't an iPad tab.
        XCTAssertEqual(NavigatorTab.shown(.find, in: iPad), .files)
    }

    /// The Find tab's sections (#879).
    func testFindShowsTheOutlineUntilTheFieldHasAQuery() {
        XCTAssertEqual(FindLayout.sections(query: "", hasNotebook: true), [.outline])
        XCTAssertEqual(FindLayout.sections(query: "  \n ", hasNotebook: true), [.outline])
        XCTAssertEqual(FindLayout.sections(query: "plume", hasNotebook: true), [.notebook, .files])
        XCTAssertEqual(FindLayout.sections(query: "plume", hasNotebook: false), [.files])
        XCTAssertEqual(FindLayout.normalized("  plume  "), "plume")
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
        XCTAssertFalse(NavigatorTab.sidebarColumnShown(.hidden, portrait: false, compact: false))
        XCTAssertFalse(NavigatorTab.sidebarColumnShown(.hidden, portrait: true, compact: false))
        XCTAssertFalse(NavigatorTab.sidebarColumnShown(.automatic, portrait: true, compact: false))
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.automatic, portrait: false, compact: false))
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.shown, portrait: true, compact: false))
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.shown, portrait: false, compact: false))
    }

    func testACompactIPadWindowLeavesItToTheSidebar() {
        // One stack: the sidebar's own appear and disappear say whether it shows.
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.hidden, portrait: true, compact: true))
        XCTAssertTrue(NavigatorTab.sidebarColumnShown(.automatic, portrait: true, compact: true))
    }

    /// The capsule's tooltips and the Running tab's value (#873).
    func testEachTabNamesItselfAndItsKey() {
        XCTAssertEqual(NavigatorTab.files.help, "Files (⌘1)")
        XCTAssertEqual(NavigatorTab.find.help, "Find (⌘2)")
        XCTAssertEqual(NavigatorTab.running.help, "Running (⌘3)")
        XCTAssertEqual(NavigatorTab.journals.help, "Journals (⌘6)")
    }

    func testTheRunningTabsValueSaysHowManyRun() {
        XCTAssertEqual(NavigatorTab.runningValue(0), "")
        XCTAssertEqual(NavigatorTab.runningValue(1), "1 running")
        XCTAssertEqual(NavigatorTab.runningValue(2), "2 running")
    }

    func testTheSplitViewsShowAndHideAreReadBack() {
        XCTAssertEqual(SidebarColumns(.all), .shown)
        XCTAssertEqual(SidebarColumns(.doubleColumn), .shown)
        XCTAssertEqual(SidebarColumns(.detailOnly), .hidden)
        XCTAssertEqual(SidebarColumns.shown.visibility, .all)
        XCTAssertEqual(SidebarColumns.hidden.visibility, .detailOnly)
        // On iPadOS `.automatic == .detailOnly` holds, so only the Mac's
        // run of this test tells these two apart.
        XCTAssertEqual(SidebarColumns.automatic.visibility, .automatic)
    }
}
