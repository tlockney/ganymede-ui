import SwiftUI

/// The notebook's run menu (#812), in the run group's menu on the Mac,
/// beside the split button's menu on the iPad and iPhone: the same items in
/// the same order everywhere. Each item enables on its own; the control
/// carrying the menu is enabled while a notebook is open.
struct RunMenuItems: View {
    var page: PageModel

    var body: some View {
        Button { page.run("run-all") } label: { Label("Run All", systemImage: "forward.fill") }
            .disabled(!page.state.editsCells)
        Button { page.run("run-with-params") } label: {
            Label("Run with Parameters…", systemImage: "slider.horizontal.3")
        }
        .disabled(!page.state.hasNotebook || page.state.runParams != true || page.state.readOnly == true)
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
/// On the Mac it is the toolbar's whole run group (#892): an `HStack` of Run,
/// its menu's arrow and Interrupt inside the toolbar item's own glass
/// capsule — not a `ControlGroup`, because the system's `ControlGroup`
/// styles either draw each child its own glass (automatic) or join them but
/// drop Run's fill (navigation and palette). Letting the toolbar draw the
/// capsule matches the Share/More/Inspector group's glass in both dark and
/// light mode. Run is the toolbar's only orange control, filled with the
/// app's accent and lettered in `OnAccent`; the arrow and Interrupt, both to
/// Run's right, stay neutral. The iPad and iPhone keep the one split button.
struct RunCellMenu: View {
    var page: PageModel

    var body: some View {
        #if os(macOS)
        // One HStack inside the toolbar item's own glass capsule, not a
        // `ControlGroup`: the system's styles either draw each child its own
        // glass (automatic) or drop Run's accent fill (navigation, palette),
        // and #892 wants one capsule with an orange Run.
        HStack(spacing: 0) {
            Button {
                if page.state.editsCells { page.run("run") }
            } label: {
                Label("Run", systemImage: "play.fill")
                    .labelStyle(.titleAndIcon)
                    .foregroundStyle(Color("OnAccent"))
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4)
                    .background(Color("AccentFill"), in: Capsule())
            }
            .buttonStyle(.plain)
            // Run Cell's words stay for the reader who hears the toolbar,
            // though the toolbar shows "Run" (#892).
            .accessibilityLabel("Run Cell")
            .help("Run the selected cell and select the next (⇧↩)")
            .disabled(!page.state.hasNotebook || page.state.readOnly == true)

            Divider().frame(height: 16)

            Menu {
                RunMenuItems(page: page)
            } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 9, weight: .semibold))
                    .frame(width: 22, height: 18)
                    .contentShape(Rectangle())
            }
            .menuStyle(.button)
            .menuIndicator(.hidden)
            .buttonStyle(.plain)
            .accessibilityLabel("Run Cell Menu")
            .help("Run All, Run with Parameters, Clear All Outputs, Restart…")
            .disabled(!page.state.hasNotebook)

            Divider().frame(height: 16)

            Button {
                page.run("interrupt")
            } label: {
                Image(systemName: "stop.fill")
                    .frame(width: 22, height: 18)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Interrupt")
            .help("Interrupt the kernel (⌘.)")
            .disabled(!page.state.isBusy)
        }
        .padding(.horizontal, 4)
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
