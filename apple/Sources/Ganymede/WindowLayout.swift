import Foundation

/// An area of a Mac notebook window that can fill it (#250).
enum WindowArea: String, CaseIterable {
    case notebook, panel, inspector
}

/// Which area, if any, fills the window (#250). The others fold into thin
/// strips at its edges; restoring brings back the layout from before,
/// which this never changes: whether the sidebar, panel and inspector show
/// stays where the window keeps it.
struct WindowLayout: Equatable {
    private(set) var filled: WindowArea?

    /// The area's fill control, or ⇧⌘↩: fills the window with it, or
    /// restores the layout when it already fills it.
    mutating func toggle(_ area: WindowArea) {
        filled = filled == area ? nil : area
    }

    mutating func restore() {
        filled = nil
    }

    /// The panel or inspector was shown or hidden some other way (its
    /// menu item, shortcut or button): the layout comes back, so the
    /// change shows. Hiding the filled area itself also restores; showing
    /// it, as filling it does, keeps it filled.
    mutating func noteChange(of area: WindowArea, shown: Bool) {
        guard let filled else { return }
        if filled == area && shown { return }
        self.filled = nil
    }

    /// Whether `area` is drawn, given whether the window shows it outside
    /// a fill: the filled area always, the others only with none filled.
    func shows(_ area: WindowArea, normally shown: Bool) -> Bool {
        guard let filled else { return shown }
        return filled == area
    }

    /// Whether `area` is folded into a strip: another area fills the window.
    func folds(_ area: WindowArea) -> Bool {
        filled != nil && filled != area
    }
}
