import SwiftUI

/// Return, Right and Left in the Files sidebar's list (#787), for the
/// selected row: `SidebarKeyAction` decides. Up and Down are the list's
/// own, and move only the selection: a file opens on Return or a click.
struct SidebarKeys: ViewModifier {
    let selection: FolderEntry?
    let isExpanded: (FolderEntry) -> Bool
    let setExpanded: (FolderEntry, Bool) -> Void
    let open: (FolderEntry) -> Void

    func body(content: Content) -> some View {
        // `.down` only: a held Return would otherwise toggle again and again.
        content.onKeyPress(keys: [.return, .rightArrow, .leftArrow], phases: .down) { press in
            // ⌘← and the like are not ours.
            guard press.modifiers.isEmpty, let entry = selection else { return .ignored }
            let key: SidebarKey
            if press.key == .return {
                key = .return
            } else if press.key == .rightArrow {
                key = .right
            } else {
                key = .left
            }
            let expanded = entry.isDirectory && isExpanded(entry)
            guard let action = SidebarKeyAction.action(for: key, selected: entry, isExpanded: expanded) else {
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
