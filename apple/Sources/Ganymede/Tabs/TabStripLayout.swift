import CoreGraphics
import Foundation

/// Pure geometry and truncation rules for the custom Mac tab strip (#903),
/// matching `docs/design/mac-visual-redesign/boards/E-Tabs.png` and
/// `E-Mac.png` and testable at real window widths (1280 and 1728 wide).
enum TabStripLayout {
    static let stripHeight: CGFloat = 46
    static let activeTabHeight: CGFloat = 40
    static let inactiveNotebookHeight: CGFloat = 32
    static let inactiveCapsuleHeight: CGFloat = 30
    static let tabSpacing: CGFloat = 4
    static let leadingPadding: CGFloat = 12
    static let trailingPadding: CGFloat = 14
    static let newTabButtonSize: CGFloat = 30
    static let separatorWidth: CGFloat = 1
    static let separatorHorizontalMargin: CGFloat = 6

    static let activeCornerRadius: CGFloat = 11
    static let inactiveNotebookCornerRadius: CGFloat = 9
    static let inactiveTerminalCornerRadius: CGFloat = 7
    static let topEdgeHeight: CGFloat = 1.5

    static let activeMinWidth: CGFloat = 160
    static let activeTerminalMinWidth: CGFloat = 104
    static let activeMaxWidth: CGFloat = 260
    static let inactiveNotebookMinWidth: CGFloat = 96
    static let inactiveNotebookMaxWidth: CGFloat = 200
    static let inactiveMachineMinWidth: CGFloat = 84
    static let inactiveMachineMaxWidth: CGFloat = 160
    static let inactiveTerminalMinWidth: CGFloat = 74
    static let inactiveTerminalMaxWidth: CGFloat = 150

    struct ItemFrame: Equatable {
        let id: UUID
        let width: CGFloat
        let minWidth: CGFloat
        let maxWidth: CGFloat
        let truncatesTitle: Bool
    }

    struct Result: Equatable {
        let items: [ItemFrame]
        /// Index of the tab immediately preceding the document/environment
        /// separator, or `nil` when all tabs belong to one group.
        let separatorAfterIndex: Int?
        let contentWidth: CGFloat
        let scrollAreaWidth: CGFloat
        let overflows: Bool
        let availableWidth: CGFloat

        func item(for id: UUID) -> ItemFrame? {
            items.first { $0.id == id }
        }
    }

    /// Computes the detail-column width from a window's full width, sidebar
    /// visibility, and optional inspector width.
    static func detailWidth(
        windowWidth: CGFloat,
        sidebarShown: Bool,
        sidebarWidth: CGFloat = 240,
        inspectorShown: Bool = false,
        inspectorWidth: CGFloat = 280
    ) -> CGFloat {
        let afterSidebar = sidebarShown ? max(0, windowWidth - sidebarWidth) : windowWidth
        return inspectorShown ? max(0, afterSidebar - inspectorWidth) : afterSidebar
    }

    /// Default character-width estimator when no `NSFont` measurement closure
    /// is supplied (used on iOS builds and deterministic unit tests).
    static func defaultTextWidth(_ title: String, isSelected: Bool, isMonospace: Bool) -> CGFloat {
        let perChar: CGFloat
        if isMonospace {
            perChar = isSelected ? 7.9 : 7.3
        } else {
            perChar = isSelected ? 7.6 : 6.9
        }
        return ceil(CGFloat(title.count) * perChar)
    }

    /// Computes tab widths, truncation flags, separator position, and scroll
    /// container bounds for `tabs` inside a detail area of `containerWidth`.
    static func compute(
        tabs: [WorkspaceTabDescriptor],
        selectedID: UUID?,
        containerWidth: CGFloat,
        textWidth: (String, Bool, Bool) -> CGFloat = defaultTextWidth
    ) -> Result {
        let availableWidth = max(0, containerWidth - leadingPadding - trailingPadding)
        guard !tabs.isEmpty else {
            return Result(
                items: [],
                separatorAfterIndex: nil,
                contentWidth: 0,
                scrollAreaWidth: 0,
                overflows: false,
                availableWidth: availableWidth
            )
        }

        let separatorAfterIndex = boundaryIndex(in: tabs)
        let separatorSlot = separatorAfterIndex != nil
            ? (separatorWidth + separatorHorizontalMargin * 2)
            : 0

        struct Draft {
            let id: UUID
            let minWidth: CGFloat
            let maxWidth: CGFloat
            let naturalWidth: CGFloat
            var width: CGFloat
        }

        var drafts: [Draft] = tabs.map { tab in
            let isSelected = tab.id == selectedID
            let bounds = widthBounds(for: tab, isSelected: isSelected)
            let chrome = horizontalChrome(for: tab, isSelected: isSelected)
            let text = textWidth(tab.title, isSelected, tab.kind == .terminal)
            let natural = ceil(chrome + text)
            let clamped = min(bounds.max, max(bounds.min, natural))
            return Draft(
                id: tab.id,
                minWidth: bounds.min,
                maxWidth: bounds.max,
                naturalWidth: natural,
                width: clamped
            )
        }

        let gapCount = CGFloat(max(0, tabs.count - 1))
        let fixedOverhead = gapCount * tabSpacing + separatorSlot
        let plusReserve = tabSpacing + newTabButtonSize
        let maxTabsBudget = max(0, availableWidth - plusReserve)

        func sumWidths() -> CGFloat {
            drafts.reduce(0) { $0 + $1.width } + fixedOverhead
        }

        var contentWidth = sumWidths()
        if contentWidth > maxTabsBudget {
            // Compress unselected tabs first, preserving the selected tab's
            // legible width before squeezing it down to its floor.
            let excess = contentWidth - maxTabsBudget
            let unselectedIndices = drafts.indices.filter { drafts[$0].id != selectedID }
            let unselectedSlack = unselectedIndices.reduce(CGFloat(0)) {
                $0 + max(0, drafts[$1].width - drafts[$1].minWidth)
            }
            if unselectedSlack > 0 {
                let take = min(excess, unselectedSlack)
                let ratio = take / unselectedSlack
                for i in unselectedIndices {
                    let slack = max(0, drafts[i].width - drafts[i].minWidth)
                    drafts[i].width = floor(drafts[i].width - slack * ratio)
                }
            }
            contentWidth = sumWidths()
            if contentWidth > maxTabsBudget, let selectedIndex = drafts.firstIndex(where: { $0.id == selectedID }) {
                let slack = max(0, drafts[selectedIndex].width - drafts[selectedIndex].minWidth)
                let take = min(contentWidth - maxTabsBudget, slack)
                drafts[selectedIndex].width -= take
                contentWidth = sumWidths()
            }
        }

        let overflows = contentWidth > maxTabsBudget
        let scrollAreaWidth = overflows ? maxTabsBudget : contentWidth

        let items = drafts.map { draft in
            ItemFrame(
                id: draft.id,
                width: draft.width,
                minWidth: draft.minWidth,
                maxWidth: draft.maxWidth,
                truncatesTitle: draft.naturalWidth > draft.width
            )
        }

        return Result(
            items: items,
            separatorAfterIndex: separatorAfterIndex,
            contentWidth: contentWidth,
            scrollAreaWidth: scrollAreaWidth,
            overflows: overflows,
            availableWidth: availableWidth
        )
    }

    private static func boundaryIndex(in tabs: [WorkspaceTabDescriptor]) -> Int? {
        guard let lastDoc = tabs.lastIndex(where: { $0.group == .document }),
              lastDoc + 1 < tabs.count,
              tabs[(lastDoc + 1)...].contains(where: { $0.group == .environment })
        else { return nil }
        return lastDoc
    }

    private static func widthBounds(
        for tab: WorkspaceTabDescriptor,
        isSelected: Bool
    ) -> (min: CGFloat, max: CGFloat) {
        if isSelected {
            let minW = tab.kind == .terminal ? activeTerminalMinWidth : activeMinWidth
            return (minW, activeMaxWidth)
        }
        switch tab.kind {
        case .notebook, .editor:
            return (inactiveNotebookMinWidth, inactiveNotebookMaxWidth)
        case .machine:
            return (inactiveMachineMinWidth, inactiveMachineMaxWidth)
        case .terminal:
            return (inactiveTerminalMinWidth, inactiveTerminalMaxWidth)
        }
    }

    private static func horizontalChrome(
        for tab: WorkspaceTabDescriptor,
        isSelected: Bool
    ) -> CGFloat {
        let padding: CGFloat = isSelected ? 36 : 24
        let leading: CGFloat = {
            switch tab.kind {
            case .notebook, .editor:
                guard tab.badge != nil else { return 0 }
                return isSelected ? (18 + 9) : (15 + 8)
            case .machine:
                return isSelected ? (16 + 8) : (16 + 7)
            case .terminal:
                return isSelected ? (18 + 8) : (16 + 7)
            }
        }()
        let trailing: CGFloat = {
            guard tab.kernelKind != nil else { return 0 }
            let dotWidth: CGFloat = tab.kernelKind == .working ? 10 : 7
            let gap: CGFloat = isSelected ? 9 : 8
            return dotWidth + gap
        }()
        return padding + leading + trailing
    }
}
