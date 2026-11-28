import CoreGraphics
import Foundation
import SwiftUI

/// Pure layout, Split View, palette, and tab-folding rules for the iPad
/// visual redesign (#914, Step 7 of #844). Kept free of UIKit and AppKit
/// imports so both `GanymedeTests` (macOS) and `GanymedeTests-iOS` cover it.
enum IPadLayout {
    /// Width below which iPad Split View switches to compact chrome
    /// (`E-Touch2.png` left): the sidebar hides behind its button, extra tabs
    /// fold into `+N tabs ⌄`, and the kernel chip shrinks to its status dot.
    static let narrowSplitThreshold: CGFloat = 600

    /// Minimum touch target height for iPad navigator and strip controls.
    static let minimumTouchTarget: CGFloat = 44

    /// Touch tab strip geometry.
    static let tabStripHeight: CGFloat = 44
    static let activeTabHeight: CGFloat = 38
    static let inactiveTabHeight: CGFloat = 32

    /// Whether a detail or window width is in narrow Split View (`< 600pt`).
    /// Non-positive widths (before the first geometry pass) stay full-width
    /// so the toolbar does not flash compact chrome on launch.
    static func isNarrowSplitView(width: CGFloat) -> Bool {
        width > 0 && width < narrowSplitThreshold
    }

    enum ToolbarMode: Equatable {
        case full
        case compact
    }

    static func toolbarMode(for width: CGFloat) -> ToolbarMode {
        isNarrowSplitView(width: width) ? .compact : .full
    }

    /// How the iPad toolbar draws the kernel chip at a given width.
    enum KernelChipDisplay: Equatable {
        case full(text: String, saveNote: String?)
        case dotOnly
    }

    /// Words inside the full-width iPad kernel chip (`E-Touch.png`):
    /// language and where it runs ("TypeScript · Studio Mac"), appending the
    /// live state only while the kernel is not idle ("Running", "Starting").
    static func kernelChipText(for header: HeaderStatus) -> String {
        if header.kernelMissing { return header.chipLead }
        return [header.chipLead, header.stateText].compactMap { $0 }.joined(separator: " · ")
    }

    static func kernelChipDisplay(width: CGFloat, header: HeaderStatus) -> KernelChipDisplay {
        if isNarrowSplitView(width: width) {
            return .dotOnly
        }
        return .full(text: kernelChipText(for: header), saveNote: header.saveNote)
    }

    /// In narrow Split View (`< 600pt`), Run moves into the kernel dot menu so
    /// `Notebook | Journal` stays visible and nothing gets squeezed.
    static func showsRunInKernelMenu(width: CGFloat) -> Bool {
        isNarrowSplitView(width: width)
    }

    static func showsStandaloneRunPill(width: CGFloat) -> Bool {
        !isNarrowSplitView(width: width)
    }

    static func showsStandaloneShareButton(width: CGFloat) -> Bool {
        !isNarrowSplitView(width: width)
    }

    /// Whether the sidebar should start hidden behind its button and dismiss
    /// after opening a notebook: portrait orientation or narrow Split View.
    static func shouldAutoHideSidebar(width: CGFloat, height: CGFloat) -> Bool {
        if width <= 0 || height <= 0 { return false }
        return width < height || isNarrowSplitView(width: width)
    }

    /// Short display title for the iPad toolbar (#867, #914): uses
    /// `WindowTarget.displayName` (`metadata.title`, else first `#` heading,
    /// else file stem without `YYYY-MM-DD-`) when a file is open, otherwise
    /// the machine's name or notebook folder name.
    static func displayTitle(
        path: String?,
        metadataTitle: String?,
        isMachine: Bool,
        machineName: String?,
        folderName: String
    ) -> String {
        if let path, !path.isEmpty {
            let stem = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
            return WindowTarget.displayName(fileStem: stem, metadataTitle: metadataTitle)
        }
        if isMachine {
            if let name = machineName?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty {
                return name
            }
            return "Machine"
        }
        return folderName
    }

    /// Header label for the pinned inline outline card at the iPad sidebar's
    /// foot (`E-Touch.png`).
    static func inlineOutlineHeader(isJournal: Bool) -> String {
        isJournal ? "IN THIS JOURNAL" : "IN THIS NOTEBOOK"
    }

    /// Whether the pinned inline outline card shows at the foot of the sidebar.
    static func showsInlineOutline(tabbed: Bool, hasNotebook: Bool, headingCount: Int) -> Bool {
        tabbed && hasNotebook && headingCount > 0
    }
}

/// Accessible colour tokens for iPad sidebar and chrome accents (#914, #878).
/// Paired with `SidebarRGB` so unit tests verify WCAG AA contrast (>= 4.5:1)
/// in both light and dark appearances.
enum IPadPalette {
    /// Orbit orange (#F9A03F) for the current section on dark navy glass.
    static let currentOutlineDark = SidebarRGB(red: 0.976471, green: 0.627451, blue: 0.247059)
    /// Deep burnt orange (#945000) for the current section on light warm cream,
    /// clearing >= 4.5:1 contrast over the translucent sidebar surface.
    static let currentOutlineLight = SidebarRGB(red: 0.580392, green: 0.313725, blue: 0.0)

    /// Quiet neutral highlight on the open notebook/journal/recent row,
    /// replacing the bright `Color.accentColor.opacity(0.18)` wash.
    static let openRowDark = SidebarRGB(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.11)
    static let openRowLight = SidebarRGB(red: 0.105882, green: 0.125490, blue: 0.211765, alpha: 0.08)

    static func currentOutlineColor(for scheme: ColorScheme) -> Color {
        scheme == .dark ? currentOutlineDark.color : currentOutlineLight.color
    }

    static func openRowBackground(for scheme: ColorScheme) -> Color {
        scheme == .dark ? openRowDark.color : openRowLight.color
    }
}

// MARK: - Touch Tab Strip Model

/// Action performed when tapping a tab in the iPad touch tab strip (#914).
/// Single-WebView safe: notebook tabs call `page.run("open", arg:)` and place
/// tabs call `switchPlace(_:)`.
enum IPadTabAction: Equatable, Hashable {
    case notebook(path: String)
    case place(Place)
}

/// Pure view-independent description of one item in the iPad touch tab strip.
struct IPadTabItem: Identifiable, Equatable {
    let id: String
    var kind: WorkspaceTabKind
    var title: String
    var badge: TabLanguageBadge?
    var kernelKind: HeaderStatus.ChipKind?
    var kernelLabel: String?
    var machineSymbol: String
    var isSelected: Bool
    var isRunning: Bool
    var action: IPadTabAction

    var group: WorkspaceTabGroup {
        switch kind {
        case .notebook, .editor: .document
        case .machine, .terminal: .environment
        }
    }

    var topEdgeTone: WorkspaceTabTone {
        switch kind {
        case .notebook, .editor: .orange
        case .machine: .blue
        case .terminal: .neutral
        }
    }

    var accessibilityLabel: String {
        switch kind {
        case .notebook: title
        case .machine: "Machine \(title)"
        case .terminal: "Terminal \(title)"
        case .editor: "File \(title)"
        }
    }

    var accessibilityValue: String {
        if let kernelLabel { return kernelLabel }
        if isRunning { return "Kernel running" }
        return ""
    }
}

/// Visible vs folded tabs for the iPad touch tab strip at a given width.
struct IPadTabStripSnapshot: Equatable {
    let visibleTabs: [IPadTabItem]
    let foldedTabs: [IPadTabItem]

    var foldedCount: Int { foldedTabs.count }
    var isFolded: Bool { !foldedTabs.isEmpty }

    /// Label on the narrow-width overflow menu button (`+3 tabs`), or `nil`
    /// when no tabs are folded.
    var foldedMenuTitle: String? {
        guard !foldedTabs.isEmpty else { return nil }
        return "+\(foldedTabs.count) \(foldedTabs.count == 1 ? "tab" : "tabs")"
    }
}

/// Pure builder and narrow-width folder for the iPad touch tab strip (#914).
enum IPadTabStripModel {
    /// Shows whenever a notebook is open or the scene is viewing a connected
    /// machine.
    static func shouldShow(hasNotebook: Bool, place: Place) -> Bool {
        hasNotebook || place.isMachine
    }

    /// Builds the ordered list of iPad tabs: the active notebook or machine
    /// first, then recent/running notebooks on this place, then connected
    /// machines (and this device when currently on a machine).
    static func buildTabs(
        state: PageState,
        place: Place,
        machineName: String?,
        places: [PlaceEntry],
        maxRecentNotebooks: Int = 4
    ) -> [IPadTabItem] {
        var items: [IPadTabItem] = []

        if state.hasNotebook, let activePath = state.path {
            let stem = URL(fileURLWithPath: activePath).deletingPathExtension().lastPathComponent
            let title = WindowTarget.displayName(fileStem: stem, metadataTitle: state.title)
            let isConsole = state.console != nil
            let ext = (activePath as NSString).pathExtension
            let badge = TabLanguageBadge.resolve(
                language: state.kernelLanguage,
                isConsole: isConsole,
                pathExtension: ext.isEmpty ? "ipynb" : ext
            )
            let header = HeaderStatus.make(state: state, savedOn: "", runsOn: nil)
            let kernelKind: HeaderStatus.ChipKind? = {
                guard let header else { return nil }
                return state.kernelMissing ? .missing : header.chipKind
            }()

            items.append(IPadTabItem(
                id: "active:\(activePath)",
                kind: .notebook,
                title: title,
                badge: badge,
                kernelKind: kernelKind,
                kernelLabel: header?.dotLabel,
                machineSymbol: "desktopcomputer",
                isSelected: true,
                isRunning: state.isRunning(activePath),
                action: .notebook(path: activePath)
            ))
        } else if place.isMachine {
            let name = machineName?.trimmingCharacters(in: .whitespacesAndNewlines)
            let shown = (name?.isEmpty == false ? name! : "Machine")
            items.append(IPadTabItem(
                id: "active-place:\(place.mountPath)",
                kind: .machine,
                title: shown,
                badge: nil,
                kernelKind: nil,
                kernelLabel: nil,
                machineSymbol: WorkspaceTabDescriptor.machineSymbol(for: shown),
                isSelected: true,
                isRunning: false,
                action: .place(place)
            ))
        }

        // Inactive notebook chips from recents + running sessions (excluding
        // the currently active notebook).
        var seenPaths = Set<String>()
        if let activePath = state.path {
            seenPaths.insert(activePath)
        }
        var candidatePaths: [String] = []
        for path in (state.recents ?? []) where !path.isEmpty {
            if seenPaths.insert(path).inserted {
                candidatePaths.append(path)
            }
        }
        for session in state.sessions where !session.path.isEmpty {
            if seenPaths.insert(session.path).inserted {
                candidatePaths.append(session.path)
            }
        }

        for path in candidatePaths.prefix(max(0, maxRecentNotebooks)) {
            let stem = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
            let title = WindowTarget.displayName(fileStem: stem, metadataTitle: nil)
            let session = state.sessions.first { $0.path == path }
            let running = session != nil
            let inferredLanguage = inferLanguage(fromKernelDisplayName: session?.kernel)
            let ext = (path as NSString).pathExtension
            let badge = TabLanguageBadge.resolve(
                language: inferredLanguage,
                isConsole: false,
                pathExtension: ext.isEmpty ? "ipynb" : ext
            )
            let kernelKind: HeaderStatus.ChipKind? = running
                ? (session?.state == "busy" ? .working : .idle)
                : nil
            let kernelLabel: String? = running
                ? (session?.state == "busy" ? "Kernel busy" : "Kernel running")
                : nil

            items.append(IPadTabItem(
                id: "nb:\(path)",
                kind: .notebook,
                title: title,
                badge: badge,
                kernelKind: kernelKind,
                kernelLabel: kernelLabel,
                machineSymbol: "desktopcomputer",
                isSelected: false,
                isRunning: running,
                action: .notebook(path: path)
            ))
        }

        // Outlined machine capsules: every other place in `places`.
        for entry in places where entry.place != place {
            let symbol = entry.place.isMachine
                ? WorkspaceTabDescriptor.machineSymbol(for: entry.title)
                : "ipad"
            items.append(IPadTabItem(
                id: "place:\(entry.place.mountPath)",
                kind: .machine,
                title: entry.title,
                badge: nil,
                kernelKind: nil,
                kernelLabel: nil,
                machineSymbol: symbol,
                isSelected: false,
                isRunning: false,
                action: .place(entry.place)
            ))
        }

        return items
    }

    /// Computes which tabs stay visible in the strip and which fold into the
    /// `+N tabs ⌄` menu at `availableWidth`.
    static func layout(tabs: [IPadTabItem], availableWidth: CGFloat) -> IPadTabStripSnapshot {
        guard !tabs.isEmpty else {
            return IPadTabStripSnapshot(visibleTabs: [], foldedTabs: [])
        }
        if IPadLayout.isNarrowSplitView(width: availableWidth) {
            let activeIndex = tabs.firstIndex(where: \.isSelected) ?? 0
            let active = tabs[activeIndex]
            let rest = tabs.enumerated().compactMap { $0.offset == activeIndex ? nil : $0.element }
            return IPadTabStripSnapshot(visibleTabs: [active], foldedTabs: rest)
        }
        return IPadTabStripSnapshot(visibleTabs: tabs, foldedTabs: [])
    }

    /// Infers a language key from a running session's kernel display name
    /// (e.g. "TypeScript (cdp-kernel)" -> "typescript", "Python 3" -> "python").
    static func inferLanguage(fromKernelDisplayName name: String?) -> String? {
        guard let raw = name?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !raw.isEmpty
        else { return nil }
        if raw.contains("typescript") { return "typescript" }
        if raw.contains("python") { return "python" }
        if raw.contains("javascript") { return "javascript" }
        if raw.contains("sql") || raw.contains("duckdb") { return "sql" }
        if raw.contains("julia") { return "julia" }
        if raw.contains("rust") { return "rust" }
        return nil
    }
}
