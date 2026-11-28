import CoreGraphics
import XCTest

/// Unit tests for the iPad visual redesign (#914): Split View `< 600pt`
/// rules, kernel chip compactness, touch tab folding, display titles, inline
/// outline visibility, and WCAG AA contrast over iPad sidebar tints.
final class IPadChromeTests: XCTestCase {
    private static let minimumAAContrast = 4.5

    // MARK: - Split View (< 600pt)

    func testNarrowSplitViewThresholdAt600Points() {
        XCTAssertFalse(IPadLayout.isNarrowSplitView(width: 0))
        XCTAssertFalse(IPadLayout.isNarrowSplitView(width: -10))
        XCTAssertTrue(IPadLayout.isNarrowSplitView(width: 430))
        XCTAssertTrue(IPadLayout.isNarrowSplitView(width: 599))
        XCTAssertFalse(IPadLayout.isNarrowSplitView(width: 600))
        XCTAssertFalse(IPadLayout.isNarrowSplitView(width: 1024))
    }

    func testToolbarModeAndControlPlacementFollowSplitViewWidth() {
        XCTAssertEqual(IPadLayout.toolbarMode(for: 520), .compact)
        XCTAssertTrue(IPadLayout.showsRunInKernelMenu(width: 520))
        XCTAssertFalse(IPadLayout.showsStandaloneRunPill(width: 520))
        XCTAssertFalse(IPadLayout.showsStandaloneShareButton(width: 520))

        XCTAssertEqual(IPadLayout.toolbarMode(for: 600), .full)
        XCTAssertFalse(IPadLayout.showsRunInKernelMenu(width: 600))
        XCTAssertTrue(IPadLayout.showsStandaloneRunPill(width: 600))
        XCTAssertTrue(IPadLayout.showsStandaloneShareButton(width: 600))
    }

    func testSidebarAutoHidesInPortraitOrNarrowSplitView() {
        // Portrait iPad -> hides
        XCTAssertTrue(IPadLayout.shouldAutoHideSidebar(width: 820, height: 1180))
        // Landscape Split View half width (540 x 820) -> hides
        XCTAssertTrue(IPadLayout.shouldAutoHideSidebar(width: 540, height: 820))
        // Landscape Split View wide-aspect narrow window (580 x 500) -> hides (< 600pt)
        XCTAssertTrue(IPadLayout.shouldAutoHideSidebar(width: 580, height: 500))
        // Full landscape iPad -> stays visible
        XCTAssertFalse(IPadLayout.shouldAutoHideSidebar(width: 1180, height: 820))
        XCTAssertFalse(IPadLayout.shouldAutoHideSidebar(width: 1366, height: 1024))
        // Initial unmeasured frame -> stays visible
        XCTAssertFalse(IPadLayout.shouldAutoHideSidebar(width: 0, height: 0))
    }

    // MARK: - Kernel Chip Compactness & Labels

    func testKernelChipFullVsDotOnlyAndVoiceOverLabels() {
        let idle = HeaderStatus(
            savedOn: "This iPad",
            runsOn: "Studio Mac",
            dirty: false,
            locked: false,
            kernel: "TypeScript (cdp-kernel)",
            language: "typescript",
            kernelMissing: false,
            status: "idle"
        )
        XCTAssertEqual(IPadLayout.kernelChipText(for: idle), "TypeScript · Studio Mac")
        XCTAssertEqual(
            IPadLayout.kernelChipDisplay(width: 900, header: idle),
            .full(text: "TypeScript · Studio Mac", saveNote: nil)
        )
        XCTAssertEqual(IPadLayout.kernelChipDisplay(width: 520, header: idle), .dotOnly)
        XCTAssertEqual(idle.dotLabel, "Kernel idle")
        XCTAssertTrue(idle.full.contains("Runs on Studio Mac"))

        let busyEdited = HeaderStatus(
            savedOn: "This iPad",
            runsOn: "This iPad",
            dirty: true,
            locked: false,
            kernel: "TypeScript (cdp-kernel)",
            language: "typescript",
            kernelMissing: false,
            status: "busy"
        )
        XCTAssertEqual(IPadLayout.kernelChipText(for: busyEdited), "TypeScript · This iPad · Running")
        XCTAssertEqual(
            IPadLayout.kernelChipDisplay(width: 700, header: busyEdited),
            .full(text: "TypeScript · This iPad · Running", saveNote: "Edited")
        )
        XCTAssertEqual(IPadLayout.kernelChipDisplay(width: 480, header: busyEdited), .dotOnly)
        XCTAssertEqual(busyEdited.dotLabel, "Kernel busy")

        let missing = HeaderStatus(
            savedOn: "This iPad",
            runsOn: "This iPad",
            dirty: false,
            locked: false,
            kernel: "julia",
            language: "julia",
            kernelMissing: true,
            status: "none"
        )
        XCTAssertEqual(IPadLayout.kernelChipText(for: missing), "julia not installed · Choose Kernel")
        XCTAssertEqual(missing.dotLabel, "Kernel not installed")
    }

    // MARK: - Display Title & Inline Outline

    func testDisplayTitlePrefersMetadataThenStripsDatePrefix() {
        XCTAssertEqual(
            IPadLayout.displayTitle(
                path: "journals/2026-11-09-fremont-bridge.ipynb",
                metadataTitle: "Fremont Bridge",
                isMachine: false,
                machineName: nil,
                folderName: "Ganymede"
            ),
            "Fremont Bridge"
        )
        XCTAssertEqual(
            IPadLayout.displayTitle(
                path: "journals/2026-11-09-fremont-bridge.ipynb",
                metadataTitle: nil,
                isMachine: false,
                machineName: nil,
                folderName: "Ganymede"
            ),
            "fremont-bridge"
        )
        XCTAssertEqual(
            IPadLayout.displayTitle(
                path: nil,
                metadataTitle: nil,
                isMachine: true,
                machineName: "Studio Mac",
                folderName: "Ganymede"
            ),
            "Studio Mac"
        )
        XCTAssertEqual(
            IPadLayout.displayTitle(
                path: nil,
                metadataTitle: nil,
                isMachine: false,
                machineName: nil,
                folderName: "Notebooks"
            ),
            "Notebooks"
        )
    }

    func testInlineOutlineVisibilityAndHeader() {
        XCTAssertEqual(IPadLayout.inlineOutlineHeader(isJournal: true), "IN THIS JOURNAL")
        XCTAssertEqual(IPadLayout.inlineOutlineHeader(isJournal: false), "IN THIS NOTEBOOK")

        XCTAssertTrue(IPadLayout.showsInlineOutline(tabbed: true, hasNotebook: true, headingCount: 3))
        XCTAssertFalse(IPadLayout.showsInlineOutline(tabbed: false, hasNotebook: true, headingCount: 3))
        XCTAssertFalse(IPadLayout.showsInlineOutline(tabbed: true, hasNotebook: false, headingCount: 3))
        XCTAssertFalse(IPadLayout.showsInlineOutline(tabbed: true, hasNotebook: true, headingCount: 0))
    }

    // MARK: - Touch Tab Strip Building & Folding

    func testTabStripVisibility() {
        XCTAssertFalse(IPadTabStripModel.shouldShow(hasNotebook: false, place: .thisDevice))
        XCTAssertTrue(IPadTabStripModel.shouldShow(hasNotebook: true, place: .thisDevice))
        XCTAssertTrue(IPadTabStripModel.shouldShow(hasNotebook: false, place: .machine("studio")))
        XCTAssertTrue(IPadTabStripModel.shouldShow(hasNotebook: true, place: .machine("studio")))
    }

    func testTabStripBuildsActiveNotebookRecentsAndMachinesAndFoldsUnder600() {
        var state = PageState()
        state.path = "2026-11-09-fremont-bridge.ipynb"
        state.title = "Fremont Bridge"
        state.kernelLanguage = "typescript"
        state.status = "idle"
        state.recents = [
            "2026-11-09-fremont-bridge.ipynb",
            "2026-11-09-oklahoma-quakes.ipynb",
            "04-duckdb.ipynb",
        ]
        state.running = [
            PageState.Session(
                id: "s1",
                path: "2026-11-09-oklahoma-quakes.ipynb",
                kernel: "TypeScript (cdp-kernel)",
                state: "idle",
                kernelID: "k1",
                memory: nil
            ),
        ]

        let places: [PlaceEntry] = [
            PlaceEntry(place: .thisDevice, title: "This iPad"),
            PlaceEntry(place: .machine("studio"), title: "Studio Mac"),
        ]

        let tabs = IPadTabStripModel.buildTabs(
            state: state,
            place: .thisDevice,
            machineName: nil,
            places: places
        )

        XCTAssertEqual(tabs.count, 4)
        XCTAssertEqual(tabs[0].title, "Fremont Bridge")
        XCTAssertTrue(tabs[0].isSelected)
        XCTAssertEqual(tabs[0].topEdgeTone, .orange)
        XCTAssertEqual(tabs[0].badge?.code, "TS")
        XCTAssertEqual(tabs[0].kernelLabel, "Kernel idle")
        XCTAssertEqual(tabs[0].action, .notebook(path: "2026-11-09-fremont-bridge.ipynb"))

        XCTAssertEqual(tabs[1].title, "oklahoma-quakes")
        XCTAssertFalse(tabs[1].isSelected)
        XCTAssertTrue(tabs[1].isRunning)
        XCTAssertEqual(tabs[1].badge?.code, "TS")
        XCTAssertEqual(tabs[1].kernelLabel, "Kernel running")

        XCTAssertEqual(tabs[2].title, "04-duckdb")
        XCTAssertFalse(tabs[2].isRunning)

        XCTAssertEqual(tabs[3].kind, .machine)
        XCTAssertEqual(tabs[3].title, "Studio Mac")
        XCTAssertEqual(tabs[3].topEdgeTone, .blue)
        XCTAssertEqual(tabs[3].action, .place(.machine("studio")))

        // Full width (>= 600pt): all tabs visible, none folded.
        let wide = IPadTabStripModel.layout(tabs: tabs, availableWidth: 820)
        XCTAssertEqual(wide.visibleTabs.count, 4)
        XCTAssertTrue(wide.foldedTabs.isEmpty)
        XCTAssertFalse(wide.isFolded)
        XCTAssertNil(wide.foldedMenuTitle)

        // Narrow Split View (< 600pt): active tab + "+3 tabs" menu.
        let narrow = IPadTabStripModel.layout(tabs: tabs, availableWidth: 520)
        XCTAssertEqual(narrow.visibleTabs.map(\.title), ["Fremont Bridge"])
        XCTAssertEqual(narrow.foldedCount, 3)
        XCTAssertTrue(narrow.isFolded)
        XCTAssertEqual(narrow.foldedMenuTitle, "+3 tabs")
        XCTAssertEqual(narrow.foldedTabs.map(\.title), ["oklahoma-quakes", "04-duckdb", "Studio Mac"])
    }

    func testTabStripSingularFoldedLabelAndActiveMachineTab() {
        let places: [PlaceEntry] = [
            PlaceEntry(place: .thisDevice, title: "This iPad"),
            PlaceEntry(place: .machine("m4mini"), title: "m4mini"),
        ]
        let tabs = IPadTabStripModel.buildTabs(
            state: PageState(),
            place: .machine("m4mini"),
            machineName: "m4mini",
            places: places
        )
        XCTAssertEqual(tabs.count, 2)
        XCTAssertEqual(tabs[0].kind, .machine)
        XCTAssertTrue(tabs[0].isSelected)
        XCTAssertEqual(tabs[0].topEdgeTone, .blue)
        XCTAssertEqual(tabs[1].title, "This iPad")
        XCTAssertEqual(tabs[1].machineSymbol, "ipad")

        let narrow = IPadTabStripModel.layout(tabs: tabs, availableWidth: 500)
        XCTAssertEqual(narrow.foldedMenuTitle, "+1 tab")
    }

    func testLanguageInferenceFromSessionKernelNames() {
        XCTAssertEqual(IPadTabStripModel.inferLanguage(fromKernelDisplayName: "TypeScript (cdp-kernel)"), "typescript")
        XCTAssertEqual(IPadTabStripModel.inferLanguage(fromKernelDisplayName: "Python 3 (ipykernel)"), "python")
        XCTAssertEqual(IPadTabStripModel.inferLanguage(fromKernelDisplayName: "DuckDB SQL"), "sql")
        XCTAssertNil(IPadTabStripModel.inferLanguage(fromKernelDisplayName: nil))
        XCTAssertNil(IPadTabStripModel.inferLanguage(fromKernelDisplayName: ""))
    }

    // MARK: - Sidebar Caption & Current Outline Contrast (>= 4.5:1)

    func testSidebarCaptionAndCurrentOutlineClearWCAGAAInLightAndDark() {
        let lightSurface = SidebarPalette.lightTint.composited(
            over: SidebarRGB(red: 0.984314, green: 0.976471, blue: 0.960784)
        )
        let darkSurface = SidebarPalette.darkTint.composited(
            over: SidebarRGB(red: 0.094118, green: 0.109804, blue: 0.184314)
        )

        XCTAssertGreaterThanOrEqual(
            SidebarPalette.lightCaption.contrastRatio(against: lightSurface),
            Self.minimumAAContrast
        )
        XCTAssertGreaterThanOrEqual(
            SidebarPalette.darkCaption.contrastRatio(against: darkSurface),
            Self.minimumAAContrast
        )
        XCTAssertGreaterThanOrEqual(
            IPadPalette.currentOutlineLight.contrastRatio(against: lightSurface),
            Self.minimumAAContrast
        )
        XCTAssertGreaterThanOrEqual(
            IPadPalette.currentOutlineDark.contrastRatio(against: darkSurface),
            Self.minimumAAContrast
        )
    }
}
