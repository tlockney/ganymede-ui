import Foundation
import Observation
#if os(macOS)
import AppKit
#endif

/// A terminal in a window's bottom panel (#248).
struct PanelTerminal: Identifiable, Hashable {
    var id = UUID()
    var target: TerminalTarget
}

/// One window's bottom panel: whether it shows, how tall it is, and the
/// terminals in it. Hiding the panel keeps its terminals running; closing a
/// terminal's tab ends its session.
@MainActor
@Observable
final class PanelController {
    static let minHeight: Double = 120
    static let defaultHeight: Double = 260
    /// Room the notebook keeps above the panel.
    static let notebookRoom: Double = 160

    var isShown = false
    private(set) var height = PanelController.defaultHeight
    private(set) var terminals: [PanelTerminal] = []
    var selection: PanelTerminal.ID?
    /// The Kernel Log tab is on show, over the selected terminal.
    var showsLog = false

    /// Shows the panel; with no terminal in it yet, starts one on `target`.
    func show(startingOn target: TerminalTarget) {
        isShown = true
        if terminals.isEmpty && !showsLog { add(target) }
    }

    /// Shows the panel with the Kernel Log tab.
    func showLog() {
        showsLog = true
        isShown = true
    }

    /// Shows `id`'s terminal, over the Kernel Log.
    func select(_ id: PanelTerminal.ID) {
        selection = id
        showsLog = false
    }

    /// ⌃`: hides the panel, or shows it as `show(startingOn:)` does.
    func toggle(startingOn target: TerminalTarget) {
        if isShown {
            isShown = false
        } else {
            show(startingOn: target)
        }
    }

    /// A new terminal, selected, with the panel shown.
    @discardableResult
    func add(_ target: TerminalTarget) -> PanelTerminal {
        let terminal = PanelTerminal(target: target)
        adopt(terminal)
        return terminal
    }

    /// Takes `terminal` in, selected, with the panel shown: a terminal
    /// moved here from a tab (#248) keeps its id, by which its session
    /// arrives. One already here is only selected.
    func adopt(_ terminal: PanelTerminal) {
        if !terminals.contains(where: { $0.id == terminal.id }) {
            terminals.append(terminal)
        }
        select(terminal.id)
        isShown = true
    }

    /// Ends a terminal. The neighbour to its right (else left) is selected;
    /// the panel hides when the last one closes, unless the log is on show.
    func close(_ id: PanelTerminal.ID) {
        guard let index = terminals.firstIndex(where: { $0.id == id }) else { return }
        terminals.remove(at: index)
        if selection == id {
            selection = terminals.isEmpty ? nil : terminals[min(index, terminals.count - 1)].id
        }
        if terminals.isEmpty && !showsLog { isShown = false }
    }

    /// Sets the height, kept between `minHeight` and what leaves the
    /// notebook `notebookRoom` in a window area `available` tall.
    func resize(to proposed: Double, available: Double) {
        height = Self.clamp(proposed, available: available)
    }

    static func clamp(_ proposed: Double, available: Double) -> Double {
        let most = max(minHeight, available - notebookRoom)
        return min(max(proposed, minHeight), most)
    }

    #if os(macOS)
    /// Each notebook window's panel, for a terminal tab moving into one
    /// (#248). Weak both ways: a closed window drops out.
    private static let byWindow = NSMapTable<NSWindow, PanelController>.weakToWeakObjects()

    /// Notes that this panel is `window`'s.
    func attach(to window: NSWindow) {
        Self.byWindow.setObject(self, forKey: window)
    }

    /// The panel a terminal in `window` moves into, with its window: a
    /// notebook tab of the same window first, then the frontmost notebook
    /// window. `windows` is the app's windows front to back.
    static func nearest(
        to window: NSWindow, windows: [NSWindow] = NSApp.orderedWindows
    ) -> (panel: PanelController, window: NSWindow)? {
        let tabs = window.tabbedWindows ?? []
        for candidate in tabs + windows where candidate !== window {
            if let panel = byWindow.object(forKey: candidate) { return (panel, candidate) }
        }
        return nil
    }
    #endif
}
