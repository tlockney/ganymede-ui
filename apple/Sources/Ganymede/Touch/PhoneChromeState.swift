import Foundation
import SwiftUI

/// Pure state and palette helpers for the iPhone notebook chrome (#915),
/// kept free of UIKit so both `GanymedeTests` and `GanymedeTests-iOS` can
/// exercise them.
enum PhoneChromeState {
    /// The iPhone navigation bar's display title: the notebook's
    /// `metadata.title` (or first level-1 heading, as the page reports it),
    /// else its file name without a leading `YYYY-MM-DD-` date prefix; without
    /// a notebook, the machine's name or folder name.
    static func displayTitle(
        path: String?,
        metadataTitle: String?,
        isMachine: Bool,
        machineName: String?,
        rootName: String
    ) -> String {
        if let path, !path.isEmpty {
            let stem = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
            return WindowTarget.displayName(fileStem: stem, metadataTitle: metadataTitle)
        }
        if isMachine {
            return machineName.flatMap { $0.isEmpty ? nil : $0 } ?? "Machine"
        }
        return rootName
    }
}

/// The iPhone header's navy-to-orange gradient strip palette (#915), using
/// `SidebarRGB` so unit tests verify WCAG AA (>= 4.5:1) text contrast across
/// both gradient endpoints in light and dark appearance.
enum PhoneHeaderPalette {
    /// Navy sky (#2B3A67) at the leading edge in dark mode.
    static let darkLeading = SidebarRGB(red: 0.168627, green: 0.227451, blue: 0.403922)
    /// Navy sky warmed with subtle Orbit Orange tint (#3D2F3A) at the trailing edge in dark mode.
    static let darkTrailing = SidebarRGB(red: 0.239216, green: 0.184314, blue: 0.227451)
    /// Moon cream (#F4E9D8) for dark-mode header titles.
    static let darkTitleInk = SidebarPalette.darkBrand
    /// Cool slate (#B8BDD1) for dark-mode header captions and chips.
    static let darkSubtitleInk = SidebarPalette.darkCaption

    /// Warm cream with a soft navy tint (#EDEAE2) at the leading edge in light mode.
    static let lightLeading = SidebarRGB(red: 0.929412, green: 0.917647, blue: 0.886275)
    /// Warm cream with a subtle apricot warmth (#F5EAE0) at the trailing edge in light mode.
    static let lightTrailing = SidebarRGB(red: 0.960784, green: 0.917647, blue: 0.878431)
    /// Deep navy (#1B2036) for light-mode header titles.
    static let lightTitleInk = SidebarPalette.lightInk
    /// Navy-slate (#3E4663) for light-mode header captions and chips.
    static let lightSubtitleInk = SidebarPalette.lightCaption

    static func gradientColors(for colorScheme: ColorScheme) -> [Color] {
        colorScheme == .dark
            ? [darkLeading.color, darkTrailing.color]
            : [lightLeading.color, lightTrailing.color]
    }

    static func leadingColor(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? darkLeading.color : lightLeading.color
    }

    static func titleColor(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? darkTitleInk.color : lightTitleInk.color
    }

    static func subtitleColor(for colorScheme: ColorScheme) -> Color {
        colorScheme == .dark ? darkSubtitleInk.color : lightSubtitleInk.color
    }
}

/// Compact kernel chip view-model for the iPhone header strip (#915):
/// `dot · TS · Studio Mac` / `dot · TS · This iPhone`, keeping the full
/// status line and dot status for VoiceOver.
struct PhoneKernelChipState: Equatable {
    var label: String
    var kind: HeaderStatus.ChipKind
    var needsAttention: Bool
    var dotAccessibilityLabel: String
    var buttonAccessibilityLabel: String
    var saveNote: String?

    private static let shortLanguageNames = [
        "typescript": "TS",
        "javascript": "JS",
        "python": "Py",
        "julia": "Jl",
        "rust": "Rs",
        "sql": "SQL",
        "r": "R",
        "go": "Go",
        "bash": "Bash",
    ]

    /// Compact language badge for the narrow iPhone header strip.
    static func shortLanguage(_ language: String?, fallbackKernel: String?) -> String {
        if let raw = language?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty {
            if let short = shortLanguageNames[raw.lowercased()] { return short }
            return HeaderStatus.languageName(raw) ?? raw
        }
        return fallbackKernel ?? "No kernel"
    }

    static func make(header: HeaderStatus) -> PhoneKernelChipState {
        let label: String
        if header.kernelMissing {
            label = "\(header.kernel ?? "Kernel") not installed"
        } else {
            let lang = shortLanguage(header.language, fallbackKernel: header.kernel)
            label = [lang, header.runsOn].compactMap { $0 }.joined(separator: " · ")
        }
        return PhoneKernelChipState(
            label: label,
            kind: header.chipKind,
            needsAttention: header.needsAttention,
            dotAccessibilityLabel: header.dotLabel,
            buttonAccessibilityLabel: header.full,
            saveNote: header.saveNote
        )
    }
}

/// Pure view-model for the iPhone floating glass bottom bar (#915), switching
/// between Notebook mode (Outline, cell stepper, Run + Interrupt) and Journal
/// mode (compact section navigation bar).
struct PhoneBottomBarState: Equatable {
    enum Mode: Equatable {
        case hidden
        case notebook
        case journal
    }

    var mode: Mode
    var stepperLabel: String?
    var stepperAccessibilityLabel: String
    var currentSectionTitle: String?
    var previousCellIndex: Int?
    var nextCellIndex: Int?
    var canStepPrevious: Bool
    var canStepNext: Bool
    var canRun: Bool
    var canOpenRunMenu: Bool
    var showsInterrupt: Bool
    var journalSectionEyebrow: String
    var journalSectionTitle: String
    var journalBarAccessibilityLabel: String

    /// The `go-to-cell` command argument for a cell index, or nil when out of bounds.
    static func goToCellArgument(for index: Int?) -> String? {
        index.map(String.init)
    }

    static func make(state: PageState) -> PhoneBottomBarState {
        guard state.hasNotebook else {
            return PhoneBottomBarState(
                mode: .hidden,
                stepperLabel: nil,
                stepperAccessibilityLabel: "No cells",
                currentSectionTitle: nil,
                previousCellIndex: nil,
                nextCellIndex: nil,
                canStepPrevious: false,
                canStepNext: false,
                canRun: false,
                canOpenRunMenu: false,
                showsInterrupt: false,
                journalSectionEyebrow: "Outline",
                journalSectionTitle: "No headings",
                journalBarAccessibilityLabel: "Outline"
            )
        }

        let isJournal = state.journal == true
        let mode: Mode = isJournal ? .journal : .notebook

        let stepperAccessibilityLabel: String
        if let active = state.activeCell, let count = state.cellCount, count > 0, active >= 0, active < count {
            stepperAccessibilityLabel = "Cell \(active + 1) of \(count)"
        } else {
            stepperAccessibilityLabel = "No cells"
        }

        let headings = state.headings
        let journalSectionEyebrow: String
        let journalSectionTitle: String
        if headings.isEmpty {
            journalSectionEyebrow = "Outline"
            journalSectionTitle = "No headings"
        } else if let idx = state.currentHeadingIndex, headings.indices.contains(idx) {
            journalSectionEyebrow = "Section \(idx + 1) of \(headings.count)"
            journalSectionTitle = headings[idx].text
        } else {
            journalSectionEyebrow = "\(headings.count) \(headings.count == 1 ? "section" : "sections")"
            journalSectionTitle = headings[0].text
        }

        let journalBarAccessibilityLabel = "\(journalSectionEyebrow), \(journalSectionTitle)"

        return PhoneBottomBarState(
            mode: mode,
            stepperLabel: state.cellStepperLabel,
            stepperAccessibilityLabel: stepperAccessibilityLabel,
            currentSectionTitle: state.currentHeading?.text,
            previousCellIndex: state.previousCellIndex,
            nextCellIndex: state.nextCellIndex,
            canStepPrevious: state.editsCells && state.previousCellIndex != nil,
            canStepNext: state.editsCells && state.nextCellIndex != nil,
            canRun: state.editsCells,
            canOpenRunMenu: state.hasNotebook,
            showsInterrupt: state.isBusy,
            journalSectionEyebrow: journalSectionEyebrow,
            journalSectionTitle: journalSectionTitle,
            journalBarAccessibilityLabel: journalBarAccessibilityLabel
        )
    }
}

/// Pure view-model for the iPhone Outline sheet (#915): summary subtitle,
/// numbered sections with accessible status dots, and quick-insert footer state.
struct PhoneOutlineSheetState: Equatable {
    struct Row: Identifiable, Equatable {
        /// 0-based heading index in `PageState.headings`.
        var id: Int
        /// 1-based section number shown beside the heading.
        var number: Int
        var level: Int
        var indentLevel: Int
        var text: String
        /// Target cell index for `go-to-cell`.
        var cell: Int
        var status: PageState.SectionStatus

        var statusAccessibilityLabel: String { status.accessibilityLabel }
        var rowAccessibilityLabel: String { "\(number). \(text), \(status.accessibilityLabel)" }
        var goToCellArgument: String { String(cell) }
    }

    var summaryText: String?
    var rows: [Row]
    var canRunMenu: Bool
    var canInsertCells: Bool
    var emptyMessage: String

    var isEmpty: Bool { rows.isEmpty }

    static func make(state: PageState) -> PhoneOutlineSheetState {
        let headings = state.headings
        let topLevel = headings.map(\.level).min() ?? 1
        let rows = headings.enumerated().map { index, heading in
            Row(
                id: index,
                number: index + 1,
                level: heading.level,
                indentLevel: max(0, heading.level - topLevel),
                text: heading.text,
                cell: heading.cell,
                status: state.sectionStatus(at: index)
            )
        }
        return PhoneOutlineSheetState(
            summaryText: state.outlineSummary,
            rows: rows,
            canRunMenu: state.hasNotebook,
            canInsertCells: state.editsCells,
            emptyMessage: state.hasNotebook ? "No headings in this notebook" : "No notebook open"
        )
    }
}
