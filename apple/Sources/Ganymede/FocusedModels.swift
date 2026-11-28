import SwiftUI

/// The front window's models, for the menu commands (#357). They were
/// `@FocusedObject`s, which need `ObservableObject`.
extension FocusedValues {
    @Entry var pageModel: PageModel?
    #if os(macOS)
    @Entry var panelController: PanelController?
    @Entry var inspectorController: InspectorController?
    @Entry var editorDocument: EditorDocument?
    @Entry var pageDocument: PageDocument?
    @Entry var windowScope: WindowScope?
    @Entry var workspaceTabController: WorkspaceTabController?
    #endif
    #if os(iOS)
    /// The iPad's scene's place, for the commands of this device's own (#758).
    @Entry var iPadPlace: Place?
    #endif
}

#if os(macOS)
/// The front window's place and its folder as its own server knows it (a
/// machine's path for a machine's window), for File > New Notebook and
/// Open Recent (#740).
struct WindowScope: Equatable {
    var place: Place
    var serverFolder: String
}

extension WindowScope {
    /// The terminal a new one in this window opens (#858), which the place
    /// decides: a shell on this Mac, or on the machine the window shows. It
    /// starts in the folder of the notebook the window shows, when the page
    /// has one, else in the folder the window is on; both are paths on the
    /// window's server. Nil for a machine whose remote is gone or has no
    /// server.
    func terminalTarget(notebook: String?, remotes: [Remote]) -> TerminalTarget? {
        place.terminalTarget(notebook: notebook, fallbackFolder: serverFolder, remotes: remotes)
    }
}
#endif
