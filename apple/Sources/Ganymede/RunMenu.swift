import SwiftUI

/// The notebook's run menu (#812), under Run Cell's split button on the Mac,
/// iPad and iPhone: the same items in the same order everywhere. Each item
/// enables on its own; the button carrying the menu is enabled while a
/// notebook is open.
struct RunMenuItems: View {
    var page: PageModel

    var body: some View {
        Button { page.run("run-all") } label: { Label("Run All", systemImage: "forward.fill") }
            .disabled(!page.state.editsCells)
        Button { page.run("run-with-params") } label: {
            Label("Run with Parameters…", systemImage: "slider.horizontal.3")
        }
        .disabled(!page.state.hasNotebook || page.state.runParams != true)
        Button { page.run("clear-outputs") } label: { Label("Clear All Outputs", systemImage: "eraser") }
            .disabled(!page.state.editsCells)
        Divider()
        Button { page.run("restart") } label: { Label("Restart Kernel", systemImage: "arrow.clockwise") }
            .disabled(!page.state.hasKernel)
        Button { page.run("restart-run-all") } label: {
            Label("Restart & Run All", systemImage: "arrow.clockwise.circle")
        }
        .disabled(!page.state.editsCells)
    }
}

/// Run Cell with its run menu (#812): pressing the button runs the selected
/// cell and selects the next; the arrow opens the menu. A menu's `.disabled`
/// would disable the primary action along with its items, so the button
/// stays enabled with a notebook open and does nothing in the journal view,
/// which has no cell to run.
///
/// On the Mac it is the toolbar's whole run group (#892): Run, its menu's
/// arrow and Interrupt in one `ControlGroup`, so the system draws one glass
/// capsule around the three instead of the separate pieces
/// `ToolbarItemGroup` gave. Run is the toolbar's only orange control, filled
/// with the app's accent and lettered in `OnAccent`; the arrow and Interrupt
/// stay neutral. The iPad and iPhone keep the one split button.
struct RunCellMenu: View {
    var page: PageModel

    var body: some View {
        #if os(macOS)
        ControlGroup {
            Button {
                if page.state.editsCells { page.run("run") }
            } label: {
                Label("Run", systemImage: "play.fill")
                    .labelStyle(.titleAndIcon)
                    .foregroundStyle(Color("OnAccent"))
            }
            .buttonStyle(.borderedProminent)
            .tint(Color("AccentFill"))
            // Run Cell's words stay for the reader who hears the toolbar,
            // though the toolbar shows "Run" (#892).
            .accessibilityLabel("Run Cell")
            .help("Run the selected cell and select the next (⇧↩)")
            .disabled(!page.state.hasNotebook)

            Menu {
                RunMenuItems(page: page)
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
            }
            .menuStyle(.button)
            .menuIndicator(.hidden)
            .buttonStyle(.plain)
            .accessibilityLabel("Run Cell Menu")
            .help("Run All, Run with Parameters, Clear All Outputs, Restart…")
            .disabled(!page.state.hasNotebook)

            Button {
                page.run("interrupt")
            } label: {
                Image(systemName: "stop.fill")
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Interrupt")
            .help("Interrupt the kernel (⌘.)")
            .disabled(!page.state.isBusy)
        }
        #else
        Menu {
            RunMenuItems(page: page)
        } label: {
            Label("Run Cell", systemImage: "play.fill")
        } primaryAction: {
            if page.state.editsCells { page.run("run") }
        }
        .labelStyle(.titleAndIcon)
        .help("Run the selected cell and select the next (⇧↩)")
        .disabled(!page.state.hasNotebook)
        #endif
    }
}
