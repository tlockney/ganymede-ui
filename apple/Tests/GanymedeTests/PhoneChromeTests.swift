import XCTest

/// Unit tests for the iPhone visual redesign's state, stepper, outline sheet,
/// compact kernel chip, and header contrast helpers (#915).
final class PhoneChromeTests: XCTestCase {
    private static let minimumAAContrast = 4.5

    // MARK: - Display Title

    func testDisplayTitlePrefersMetadataTitleThenStripsDatePrefix() {
        XCTAssertEqual(
            PhoneChromeState.displayTitle(
                path: "journals/2026-11-09-fremont-bridge.ipynb",
                metadataTitle: "Fremont Bridge",
                isMachine: false,
                machineName: nil,
                rootName: "Notebooks"
            ),
            "Fremont Bridge"
        )
        XCTAssertEqual(
            PhoneChromeState.displayTitle(
                path: "journals/2026-11-09-fremont-bridge.ipynb",
                metadataTitle: nil,
                isMachine: false,
                machineName: nil,
                rootName: "Notebooks"
            ),
            "fremont-bridge"
        )
        XCTAssertEqual(
            PhoneChromeState.displayTitle(
                path: nil,
                metadataTitle: nil,
                isMachine: true,
                machineName: "Studio Mac",
                rootName: "Notebooks"
            ),
            "Studio Mac"
        )
        XCTAssertEqual(
            PhoneChromeState.displayTitle(
                path: nil,
                metadataTitle: nil,
                isMachine: false,
                machineName: nil,
                rootName: "Documents"
            ),
            "Documents"
        )
    }

    // MARK: - Compact Kernel Chip

    func testCompactKernelChipFormatsShortLanguageAndRunsOn() {
        let header = HeaderStatus(
            savedOn: "This iPhone",
            runsOn: "Studio Mac",
            dirty: false,
            locked: false,
            kernel: "TypeScript (cdp-kernel)",
            language: "typescript",
            kernelMissing: false,
            status: "idle"
        )
        let chip = PhoneKernelChipState.make(header: header)
        XCTAssertEqual(chip.label, "TS · Studio Mac")
        XCTAssertEqual(chip.kind, .idle)
        XCTAssertFalse(chip.needsAttention)
        XCTAssertEqual(chip.dotAccessibilityLabel, "Kernel idle")
        XCTAssertEqual(chip.buttonAccessibilityLabel, header.full)
        XCTAssertNil(chip.saveNote)
    }

    func testCompactKernelChipHandlesPythonBusyEditedAndMissingKernel() {
        let busy = HeaderStatus(
            savedOn: "This iPhone",
            runsOn: "This iPhone",
            dirty: true,
            locked: false,
            kernel: "Python 3",
            language: "python",
            kernelMissing: false,
            status: "busy"
        )
        let busyChip = PhoneKernelChipState.make(header: busy)
        XCTAssertEqual(busyChip.label, "Py · This iPhone")
        XCTAssertEqual(busyChip.kind, .working)
        XCTAssertEqual(busyChip.dotAccessibilityLabel, "Kernel busy")
        XCTAssertEqual(busyChip.saveNote, "Edited")

        let missing = HeaderStatus(
            savedOn: "This iPhone",
            runsOn: "This iPhone",
            dirty: false,
            locked: false,
            kernel: "julia",
            language: "julia",
            kernelMissing: true,
            status: "none"
        )
        let missingChip = PhoneKernelChipState.make(header: missing)
        XCTAssertEqual(missingChip.label, "julia not installed")
        XCTAssertEqual(missingChip.kind, .missing)
        XCTAssertTrue(missingChip.needsAttention)
        XCTAssertEqual(missingChip.dotAccessibilityLabel, "Kernel not installed")
        XCTAssertEqual(missingChip.buttonAccessibilityLabel, missing.full)
    }

    func testShortLanguageFallsBackCleanly() {
        XCTAssertEqual(PhoneKernelChipState.shortLanguage("javascript", fallbackKernel: nil), "JS")
        XCTAssertEqual(PhoneKernelChipState.shortLanguage("sql", fallbackKernel: nil), "SQL")
        XCTAssertEqual(PhoneKernelChipState.shortLanguage("wolfram", fallbackKernel: nil), "Wolfram")
        XCTAssertEqual(PhoneKernelChipState.shortLanguage(nil, fallbackKernel: "Deno"), "Deno")
        XCTAssertEqual(PhoneKernelChipState.shortLanguage(" ", fallbackKernel: nil), "No kernel")
    }

    // MARK: - Bottom Bar (Notebook vs Journal vs Hidden)

    func testBottomBarHiddenWithoutNotebookOrForDataFile() {
        var empty = PageState()
        XCTAssertEqual(PhoneBottomBarState.make(state: empty).mode, .hidden)

        empty.path = "data/riders.csv"
        XCTAssertEqual(PhoneBottomBarState.make(state: empty).mode, .hidden)
    }

    func testBottomBarNotebookModeStepperBoundsAndCommands() {
        var state = makeSampleNotebookState(activeCell: 0, cellCount: 14)
        let atStart = PhoneBottomBarState.make(state: state)
        XCTAssertEqual(atStart.mode, .notebook)
        XCTAssertEqual(atStart.stepperLabel, "1 / 14")
        XCTAssertEqual(atStart.stepperAccessibilityLabel, "Cell 1 of 14")
        XCTAssertNil(atStart.previousCellIndex)
        XCTAssertEqual(atStart.nextCellIndex, 1)
        XCTAssertFalse(atStart.canStepPrevious)
        XCTAssertTrue(atStart.canStepNext)
        XCTAssertNil(PhoneBottomBarState.goToCellArgument(for: atStart.previousCellIndex))
        XCTAssertEqual(PhoneBottomBarState.goToCellArgument(for: atStart.nextCellIndex), "1")
        XCTAssertTrue(atStart.canRun)
        XCTAssertTrue(atStart.canOpenRunMenu)
        XCTAssertFalse(atStart.showsInterrupt)

        state.activeCell = 2
        state.status = "busy"
        let inMiddle = PhoneBottomBarState.make(state: state)
        XCTAssertEqual(inMiddle.stepperLabel, "3 / 14")
        XCTAssertEqual(inMiddle.stepperAccessibilityLabel, "Cell 3 of 14")
        XCTAssertEqual(inMiddle.currentSectionTitle, "Riders per day, by year")
        XCTAssertEqual(inMiddle.previousCellIndex, 1)
        XCTAssertEqual(inMiddle.nextCellIndex, 3)
        XCTAssertTrue(inMiddle.canStepPrevious)
        XCTAssertTrue(inMiddle.canStepNext)
        XCTAssertTrue(inMiddle.showsInterrupt)

        state.activeCell = 13
        let atEnd = PhoneBottomBarState.make(state: state)
        XCTAssertEqual(atEnd.stepperLabel, "14 / 14")
        XCTAssertEqual(atEnd.stepperAccessibilityLabel, "Cell 14 of 14")
        XCTAssertEqual(atEnd.previousCellIndex, 12)
        XCTAssertNil(atEnd.nextCellIndex)
        XCTAssertTrue(atEnd.canStepPrevious)
        XCTAssertFalse(atEnd.canStepNext)

        state.activeCell = 0
        state.cellCount = 1
        let single = PhoneBottomBarState.make(state: state)
        XCTAssertEqual(single.stepperLabel, "1 / 1")
        XCTAssertFalse(single.canStepPrevious)
        XCTAssertFalse(single.canStepNext)
    }

    func testBottomBarJournalModeShowsSectionNavigation() {
        var state = makeSampleNotebookState(activeCell: 2, cellCount: 14)
        state.journal = true
        let bar = PhoneBottomBarState.make(state: state)
        XCTAssertEqual(bar.mode, .journal)
        XCTAssertEqual(bar.journalSectionEyebrow, "Section 2 of 3")
        XCTAssertEqual(bar.journalSectionTitle, "Riders per day, by year")
        XCTAssertEqual(bar.journalBarAccessibilityLabel, "Section 2 of 3, Riders per day, by year")
        XCTAssertFalse(bar.canRun)
        XCTAssertFalse(bar.canStepPrevious)
        XCTAssertFalse(bar.canStepNext)
        XCTAssertTrue(bar.canOpenRunMenu)

        // Before the first heading or without headings: still legible.
        state.outline = []
        let noHeadings = PhoneBottomBarState.make(state: state)
        XCTAssertEqual(noHeadings.journalSectionEyebrow, "Outline")
        XCTAssertEqual(noHeadings.journalSectionTitle, "No headings")
    }

    // MARK: - Outline Sheet

    func testOutlineSheetStatusesAndVoiceOverLabels() {
        let state = makeSampleNotebookState(activeCell: 2, cellCount: 14)
        let sheet = PhoneOutlineSheetState.make(state: state)

        XCTAssertFalse(sheet.isEmpty)
        XCTAssertEqual(sheet.summaryText, state.outlineSummary)
        XCTAssertTrue(sheet.canRunMenu)
        XCTAssertTrue(sheet.canInsertCells)
        XCTAssertEqual(sheet.rows.count, 3)

        XCTAssertEqual(sheet.rows[0].number, 1)
        XCTAssertEqual(sheet.rows[0].status, .ran)
        XCTAssertEqual(sheet.rows[0].statusAccessibilityLabel, "Section ran")
        XCTAssertEqual(sheet.rows[0].rowAccessibilityLabel, "1. What does the counter cover?, Section ran")
        XCTAssertEqual(sheet.rows[0].goToCellArgument, "0")

        XCTAssertEqual(sheet.rows[1].number, 2)
        XCTAssertEqual(sheet.rows[1].status, .current)
        XCTAssertEqual(sheet.rows[1].statusAccessibilityLabel, "Current section")
        XCTAssertEqual(sheet.rows[1].rowAccessibilityLabel, "2. Riders per day, by year, Current section")
        XCTAssertEqual(sheet.rows[1].goToCellArgument, "2")

        XCTAssertEqual(sheet.rows[2].number, 3)
        XCTAssertEqual(sheet.rows[2].status, .notRun)
        XCTAssertEqual(sheet.rows[2].statusAccessibilityLabel, "Section not run")
        XCTAssertEqual(sheet.rows[2].rowAccessibilityLabel, "3. Weather, Section not run")
        XCTAssertEqual(sheet.rows[2].goToCellArgument, "10")
        XCTAssertEqual(sheet.rows[2].indentLevel, 1)
    }

    func testOutlineSheetEmptyStateKeepsSummaryAndActionsAndDisablesInsertInJournal() {
        var state = makeSampleNotebookState(activeCell: 0, cellCount: 4)
        state.outline = []
        let notebookEmpty = PhoneOutlineSheetState.make(state: state)
        XCTAssertTrue(notebookEmpty.isEmpty)
        XCTAssertEqual(notebookEmpty.emptyMessage, "No headings in this notebook")
        XCTAssertNotNil(notebookEmpty.summaryText)
        XCTAssertTrue(notebookEmpty.canRunMenu)
        XCTAssertTrue(notebookEmpty.canInsertCells)

        state.journal = true
        let journalEmpty = PhoneOutlineSheetState.make(state: state)
        XCTAssertTrue(journalEmpty.canRunMenu)
        XCTAssertFalse(journalEmpty.canInsertCells)
    }

    // MARK: - Header & Caption Contrast

    func testPhoneHeaderGradientMeetsWCAGAAInDarkAndLight() {
        for (name, bg) in [
            ("dark leading", PhoneHeaderPalette.darkLeading),
            ("dark trailing", PhoneHeaderPalette.darkTrailing),
        ] {
            XCTAssertGreaterThanOrEqual(
                PhoneHeaderPalette.darkTitleInk.contrastRatio(against: bg),
                Self.minimumAAContrast,
                "Dark title ink over \(name)"
            )
            XCTAssertGreaterThanOrEqual(
                PhoneHeaderPalette.darkSubtitleInk.contrastRatio(against: bg),
                Self.minimumAAContrast,
                "Dark subtitle ink over \(name)"
            )
        }

        for (name, bg) in [
            ("light leading", PhoneHeaderPalette.lightLeading),
            ("light trailing", PhoneHeaderPalette.lightTrailing),
        ] {
            XCTAssertGreaterThanOrEqual(
                PhoneHeaderPalette.lightTitleInk.contrastRatio(against: bg),
                Self.minimumAAContrast,
                "Light title ink over \(name)"
            )
            XCTAssertGreaterThanOrEqual(
                PhoneHeaderPalette.lightSubtitleInk.contrastRatio(against: bg),
                Self.minimumAAContrast,
                "Light subtitle ink over \(name)"
            )
        }
    }

    func testSidebarCaptionMeetsWCAGAAOverPhoneListAndSheetSurfaces() {
        let lightSurface = SidebarRGB(red: 0.984314, green: 0.976471, blue: 0.960784) // WindowBackground light
        let darkSurface = SidebarRGB(red: 0.094118, green: 0.109804, blue: 0.184314) // WindowBackground dark

        XCTAssertGreaterThanOrEqual(
            SidebarPalette.lightCaption.contrastRatio(against: lightSurface),
            Self.minimumAAContrast
        )
        XCTAssertGreaterThanOrEqual(
            SidebarPalette.darkCaption.contrastRatio(against: darkSurface),
            Self.minimumAAContrast
        )
    }

    // MARK: - Fixtures

    private func makeSampleNotebookState(activeCell: Int, cellCount: Int) -> PageState {
        var state = PageState()
        state.path = "2026-11-09-fremont-bridge.ipynb"
        state.title = "Fremont Bridge"
        state.status = "idle"
        state.activeCell = activeCell
        state.cellCount = cellCount
        state.ranCellCount = min(12, cellCount)
        state.outline = [
            PageState.Heading(level: 2, text: "What does the counter cover?", cell: 0, ran: true),
            PageState.Heading(level: 2, text: "Riders per day, by year", cell: 2, ran: true),
            PageState.Heading(level: 3, text: "Weather", cell: 10, ran: false),
        ]
        return state
    }
}
