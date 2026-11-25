import SwiftUI

/// Notebook | Journal in the toolbar (#819): a segmented control that
/// names which view shows and switches between them, as the More menu's
/// journal item does. Only a notebook has the two views — a data file or
/// a console doesn't — so the toolbars show it only while
/// `PageState.hasNotebook`; the page keeps the reader's cell either way
/// (#816, `toggle-journal`).
struct JournalViewPicker: View {
    var page: PageModel

    var body: some View {
        // `journal` is absent from a page older than #724, which shows
        // the notebook; picking a part runs the page's own toggle, which
        // knows where to land.
        Picker("View", selection: Binding(
            get: { page.state.journal == true },
            set: { journal in
                if journal != (page.state.journal == true) { page.run("toggle-journal") }
            }
        )) {
            Text("Notebook").tag(false)
            Text("Journal").tag(true)
        }
        .pickerStyle(.segmented)
        .help("Show the notebook, or its journal view")
    }
}
