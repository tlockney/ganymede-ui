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

    /// The page's answer (#879): only the field's own query's may show.
    func testAFindAnswerShowsOnlyUnderItsOwnQuery() {
        let plume = find("plume", cells: [1])
        XCTAssertEqual(FindLayout.answer(for: "  plume ", in: plume), plume)
        XCTAssertNil(FindLayout.answer(for: "volcano", in: plume))
        XCTAssertNil(FindLayout.answer(for: "plume", in: nil))
        XCTAssertNil(FindLayout.answer(for: "  ", in: plume), "an empty field shows the outline")
    }

    /// A page loaded again forgets what it was asked, as it forgets
    /// `inspect-variables`: the field's query goes to it again.
    func testAPageLoadedAgainIsAskedTheFieldsQueryAgain() {
        XCTAssertFalse(FindLayout.shouldReask(query: "  plume  ", find: find("plume", cells: [1])))
        XCTAssertFalse(FindLayout.shouldReask(query: "", find: nil))
        XCTAssertFalse(FindLayout.shouldReask(query: " \n ", find: find("plume", cells: [1])))
        // The reloaded page's state has no answer; nor has one that still
        // has to answer a newer query.
        XCTAssertTrue(FindLayout.shouldReask(query: "plume", find: nil))
        XCTAssertTrue(FindLayout.shouldReask(query: "plume", find: find("volcano", cells: [])))
    }

    /// What the list says over no rows (#879): "No matches" waits for the
    /// page, which may still have rows to send.
    func testTheListSaysSearchingUntilTheNotebookHasAnswered() {
        let nothing = find("plume", cells: [])
        let row = find("plume", cells: [2])
        // An empty field shows the outline: nothing to say.
        XCTAssertEqual(status(query: "  ", hasNotebook: true, find: nil, searchingFiles: true), .none)
        // The page hasn't answered for this query yet.
        XCTAssertEqual(status(query: "plume", hasNotebook: true, find: nil, searchingFiles: false), .searching)
        XCTAssertEqual(
            status(query: "plume", hasNotebook: true, find: find("volcano", cells: []), searchingFiles: false),
            .searching, "another query's answer")
        // Files that matched are rows, so nothing is said over them.
        XCTAssertEqual(status(query: "plume", hasNotebook: true, find: nil, searchingFiles: false, fileMatches: 2), .none)
        XCTAssertEqual(status(query: "plume", hasNotebook: true, find: row, searchingFiles: true), .none)
        // Answered with nothing, and the files still going: still searching.
        XCTAssertEqual(status(query: "plume", hasNotebook: true, find: nothing, searchingFiles: true), .searching)
        XCTAssertEqual(status(query: "plume", hasNotebook: true, find: nothing, searchingFiles: false), .nothing(stoppedEarly: false))
        XCTAssertEqual(
            status(query: "plume", hasNotebook: false, find: nil, searchingFiles: false, stoppedEarly: true),
            .nothing(stoppedEarly: true), "no notebook: the files alone answer")
    }

    /// The page's answer for `query`, matching the cells in `cells`.
    private func find(_ query: String, cells: [Int]) -> PageState.NotebookFind {
        PageState.NotebookFind(
            query: query,
            matches: cells.map { .init(cell: $0, heading: nil, snippet: "plume") }, more: 0)
    }

    private func status(
        query: String, hasNotebook: Bool, find: PageState.NotebookFind?,
        searchingFiles: Bool, fileMatches: Int = 0, stoppedEarly: Bool = false
    ) -> FindLayout.Status {
        FindLayout.status(
            query: query, hasNotebook: hasNotebook, find: find,
            searchingFiles: searchingFiles, fileMatches: fileMatches, stoppedEarly: stoppedEarly)
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

    /// The capsule's tooltips and shortcuts (#873, #905): Mac uses `⌥⌘1`–`⌥⌘6`
    /// so `⌘1`–`⌘9` switch workspace tabs, while iPad keeps `⌘1`–`⌘6`.
    func testEachTabNamesItselfAndItsKey() {
        XCTAssertEqual(NavigatorTab.files.help(for: .mac), "Files (⌥⌘1)")
        XCTAssertEqual(NavigatorTab.find.help(for: .mac), "Find (⌥⌘2)")
        XCTAssertEqual(NavigatorTab.running.help(for: .mac), "Running (⌥⌘3)")
        XCTAssertEqual(NavigatorTab.recents.help(for: .mac), "Recents (⌥⌘5)")
        XCTAssertEqual(NavigatorTab.journals.help(for: .mac), "Journals (⌥⌘6)")
        XCTAssertEqual(NavigatorTab.shortcutModifiers(for: .mac), [.command, .option])

        XCTAssertEqual(NavigatorTab.files.help(for: .iPad), "Files (⌘1)")
        XCTAssertEqual(NavigatorTab.search.help(for: .iPad), "Search (⌘2)")
        XCTAssertEqual(NavigatorTab.running.help(for: .iPad), "Running (⌘3)")
        XCTAssertEqual(NavigatorTab.outline.help(for: .iPad), "Outline (⌘4)")
        XCTAssertEqual(NavigatorTab.journals.help(for: .iPad), "Journals (⌘6)")
        XCTAssertEqual(NavigatorTab.shortcutModifiers(for: .iPad), .command)

        #if os(macOS)
        XCTAssertEqual(NavigatorTab.files.help, "Files (⌥⌘1)")
        XCTAssertEqual(NavigatorTab.find.help, "Find (⌥⌘2)")
        XCTAssertEqual(NavigatorTab.running.help, "Running (⌥⌘3)")
        XCTAssertEqual(NavigatorTab.journals.help, "Journals (⌥⌘6)")
        #else
        XCTAssertEqual(NavigatorTab.files.help, "Files (⌘1)")
        XCTAssertEqual(NavigatorTab.search.help, "Search (⌘2)")
        XCTAssertEqual(NavigatorTab.running.help, "Running (⌘3)")
        XCTAssertEqual(NavigatorTab.journals.help, "Journals (⌘6)")
        #endif
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
