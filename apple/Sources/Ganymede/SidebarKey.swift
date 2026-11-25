import Foundation
import SwiftUI

/// The keys the Files sidebar acts on itself (#787); Up and Down are the
/// list's own.
enum SidebarKey: Equatable {
    case `return`, right, left

    /// The key a press stands for, or nil for another key or one pressed
    /// with ⌘, ⌥, ⌃ or ⇧. Caps Lock, and the numeric-keypad and function
    /// flags the arrow keys carry, don't count.
    init?(key: KeyEquivalent, modifiers: EventModifiers) {
        guard modifiers.isDisjoint(with: [.command, .option, .control, .shift]) else { return nil }
        if key == .return {
            self = .return
        } else if key == .rightArrow {
            self = .right
        } else if key == .leftArrow {
            self = .left
        } else {
            return nil
        }
    }
}

extension FolderEntry {
    /// Whether this is `removed` or inside it, for a selection kept
    /// across a rename or delete: compared by path with a `/` boundary, so
    /// "moons2" is not inside "moons".
    func isAtOrInside(_ removed: FolderEntry) -> Bool {
        FolderEntry.path(serverPath, isAt: removed.serverPath)
    }
}

/// What a key does to the selected row of the Files sidebar (#787).
enum SidebarKeyAction: Equatable {
    /// Open the file.
    case open
    /// Expand a collapsed folder or collapse an expanded one.
    case toggle
    /// Expand a folder (to a definite value: never a toggle, so the
    /// list's own Right arrow can't undo it).
    case expand
    /// Collapse a folder.
    case collapse

    /// What `key` does to `selected`, or nil when the sidebar leaves the
    /// key alone (the view then returns `.ignored`): no selection, a key
    /// that changes nothing here (Return on a file this place can't open,
    /// Right on a file or an expanded folder, Left on a file or a
    /// collapsed folder). `canOpen` is `FolderEntry.canOpen(in:)`.
    static func action(
        for key: SidebarKey, selected: FolderEntry?, isExpanded: Bool, canOpen: Bool = true
    ) -> SidebarKeyAction? {
        guard let selected else { return nil }
        switch key {
        case .return:
            if selected.isDirectory { return .toggle }
            return canOpen ? .open : nil
        case .right:
            return selected.isDirectory && !isExpanded ? .expand : nil
        case .left:
            return selected.isDirectory && isExpanded ? .collapse : nil
        }
    }
}
