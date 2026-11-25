import SwiftUI

/// A folder's row in the Files sidebar (#786). Clicking or tapping
/// anywhere on the row expands or collapses the folder, not only the
/// disclosure arrow, as in VS Code's Explorer: a file row opens on one
/// click, so a folder row toggles on one.
///
/// The row is not a `Button`, which in a list with a selection can keep
/// the click from selecting the row (#787): a tap gesture running along
/// with the list's own toggles the folder and selects it.
struct FolderRowLabel: View {
    let name: String
    @Binding var isExpanded: Bool
    /// The row was clicked: it becomes the list's selection.
    var select: () -> Void = {}

    var body: some View {
        Label(name, systemImage: "folder")
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(Rectangle())
            .simultaneousGesture(
                TapGesture().onEnded {
                    select()
                    withAnimation { isExpanded.toggle() }
                }
            )
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { withAnimation { isExpanded.toggle() } }
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint(isExpanded ? "Collapses the folder" : "Expands the folder")
    }
}
