import Foundation

/// The keys the Files sidebar acts on itself (#787); Up and Down are the
/// list's own.
enum SidebarKey: Equatable {
    case `return`, right, left
}

/// What a key does to the selected row of the Files sidebar (#787).
enum SidebarKeyAction: Equatable {
    /// Open the file, if this place can.
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
    /// that changes nothing here (Right on a file or an expanded folder,
    /// Left on a file or a collapsed folder).
    static func action(for key: SidebarKey, selected: FolderEntry?, isExpanded: Bool) -> SidebarKeyAction? {
        guard let selected else { return nil }
        switch key {
        case .return:
            return selected.isDirectory ? .toggle : .open
        case .right:
            return selected.isDirectory && !isExpanded ? .expand : nil
        case .left:
            return selected.isDirectory && isExpanded ? .collapse : nil
        }
    }
}
