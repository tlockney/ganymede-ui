import SwiftUI

/// Return, Right and Left in the Files sidebar's list (#787), for the
/// selected row: `SidebarKeyAction` decides. Up and Down are the list's
/// own, and move only the selection: a file opens on Return or a click.
struct SidebarKeys: ViewModifier {
    let selection: FolderEntry?
    let isExpanded: (FolderEntry) -> Bool
    let setExpanded: (FolderEntry, Bool) -> Void
    /// Whether this place can open the file (`FolderEntry.canOpen(in:)`).
    let canOpen: (FolderEntry) -> Bool
    let open: (FolderEntry) -> Void

    func body(content: Content) -> some View {
        // `.down` only: a held Return would otherwise toggle again and again.
        content.onKeyPress(keys: [.return, .rightArrow, .leftArrow], phases: .down) { press in
            // ⌘← and the like are not ours; Caps Lock and the arrows'
            // keypad and function flags are fine.
            guard let entry = selection, let key = SidebarKey(key: press.key, modifiers: press.modifiers) else {
                return .ignored
            }
            let expanded = entry.isDirectory && isExpanded(entry)
            guard let action = SidebarKeyAction.action(
                for: key, selected: entry, isExpanded: expanded, canOpen: canOpen(entry)
            ) else {
                return .ignored
            }
            switch action {
            case .open: open(entry)
            case .toggle: withAnimation { setExpanded(entry, !expanded) }
            case .expand: withAnimation { setExpanded(entry, true) }
            case .collapse: withAnimation { setExpanded(entry, false) }
            }
            return .handled
        }
    }
}
