import SwiftUI

/// A folder's row in the Files sidebar (#786). Clicking or tapping
/// anywhere on the row expands or collapses the folder, not only the
/// disclosure arrow, as in VS Code's Explorer: a file row opens on one
/// click, so a folder row toggles on one.
struct FolderRowLabel: View {
    let name: String
    @Binding var isExpanded: Bool

    var body: some View {
        Button {
            withAnimation { isExpanded.toggle() }
        } label: {
            Label(name, systemImage: "folder")
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint(isExpanded ? "Collapses the folder" : "Expands the folder")
    }
}
