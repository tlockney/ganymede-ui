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
    #endif
}
