import CoreGraphics
import Foundation

/// Pure filtering, responsive grid layout, and keyboard navigation helpers for
/// the `Window > Show All Tabs` (`⇧⌘\`) visual tab-grid overlay, plus `⌘1`–`⌘9`
/// tab shortcut resolution (#905).
struct TabOverviewItem: Identifiable, Equatable {
    let id: UUID
    let descriptor: WorkspaceTabDescriptor
    let isDirty: Bool
    let isSelected: Bool
    /// Zero-based index in the window's tab strip.
    let index: Int

    /// Display shortcut hint (`⌘1`–`⌘8`, or `⌘9` for the last tab when there are >= 9 tabs).
    func shortcutLabel(totalCount: Int) -> String? {
        if index < 8 {
            return "⌘\(index + 1)"
        }
        if totalCount >= 9 && index == totalCount - 1 {
            return "⌘9"
        }
        return nil
    }
}

enum TabOverviewNavigation {
    enum Direction: Equatable {
        case up
        case down
        case left
        case right
    }

    /// Filters `items` case-insensitively across title, tooltip/path, kind,
    /// language badge code, and kernel status label.
    static func filter(_ items: [TabOverviewItem], query: String) -> [TabOverviewItem] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return items }
        return items.filter { item in
            let d = item.descriptor
            if d.title.localizedCaseInsensitiveContains(needle) { return true }
            if d.toolTip.localizedCaseInsensitiveContains(needle) { return true }
            if d.kind.rawValue.localizedCaseInsensitiveContains(needle) { return true }
            if let badge = d.badge?.code, badge.localizedCaseInsensitiveContains(needle) { return true }
            if let kernel = d.kernelLabel, kernel.localizedCaseInsensitiveContains(needle) { return true }
            if item.isDirty, "edited".localizedCaseInsensitiveContains(needle) { return true }
            return false
        }
    }

    /// Computes how many cards fit per row for `width`.
    static func columnCount(
        forWidth width: CGFloat,
        minCardWidth: CGFloat = 220,
        spacing: CGFloat = 14,
        horizontalPadding: CGFloat = 48
    ) -> Int {
        let usable = max(0, width - horizontalPadding)
        guard usable > minCardWidth else { return 1 }
        return max(1, min(4, Int(floor((usable + spacing) / (minCardWidth + spacing)))))
    }

    /// Moves keyboard focus across a row-major grid of `columns` columns.
    static func moveSelection(
        current: UUID?,
        in items: [TabOverviewItem],
        direction: Direction,
        columns: Int
    ) -> UUID? {
        guard !items.isEmpty else { return nil }
        let cols = max(1, columns)
        guard let current, let index = items.firstIndex(where: { $0.id == current }) else {
            return items[0].id
        }
        let target: Int
        switch direction {
        case .left:
            target = max(0, index - 1)
        case .right:
            target = min(items.count - 1, index + 1)
        case .up:
            target = index >= cols ? index - cols : index
        case .down:
            target = index + cols < items.count ? index + cols : items.count - 1
        }
        return items[target].id
    }
}

/// Pure `⌘1`–`⌘9` workspace tab shortcut index resolver (#905):
/// `⌘1`–`⌘8` select tabs 1–8 (0-based 0–7 if present); `⌘9` selects the last tab.
enum TabShortcutResolver {
    static func targetIndex(forDigit digit: Int, tabCount: Int) -> Int? {
        guard tabCount > 0 else { return nil }
        switch digit {
        case 1...8:
            let idx = digit - 1
            return idx < tabCount ? idx : nil
        case 9:
            return tabCount - 1
        default:
            return nil
        }
    }

    /// Recognizes `⌃Tab` and `⌃⇧Tab` tab-cycling keys from raw key event fields.
    enum CycleAction: Equatable {
        case next
        case previous
    }

    /// Matches Tab (`keyCode == 48`) with Control alone (`.next`) or
    /// Control+Shift (`.previous`), ignoring Command or Option combinations.
    static func matchTabCycle(
        keyCode: UInt16,
        control: Bool,
        shift: Bool,
        command: Bool,
        option: Bool
    ) -> CycleAction? {
        guard keyCode == 48, control, !command, !option else { return nil }
        return shift ? .previous : .next
    }
}
