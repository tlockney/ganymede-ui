import Foundation

/// What the toolbar's menus say, apart from the views that draw them
/// (#892), so a test can read it without a window.
enum ToolbarMenu {
    /// The Terminal Panel item's title. Like View › Terminal Panel, the item
    /// names what pressing it does, so it reads "Hide" while the panel shows.
    static func terminalPanelTitle(shown: Bool) -> String {
        shown ? "Hide Terminal Panel" : "Show Terminal Panel"
    }
}
