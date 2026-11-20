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
#endif
