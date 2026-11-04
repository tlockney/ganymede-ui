import Combine
import Foundation

/// A terminal in a window's bottom panel (#248).
struct PanelTerminal: Identifiable, Hashable {
    var id = UUID()
    var target: TerminalTarget
}

/// One window's bottom panel: whether it shows, how tall it is, and the
/// terminals in it. Hiding the panel keeps its terminals running; closing a
/// terminal's tab ends its session.
@MainActor
final class PanelController: ObservableObject {
    static let minHeight: Double = 120
    static let defaultHeight: Double = 260
    /// Room the notebook keeps above the panel.
    static let notebookRoom: Double = 160

    @Published var isShown = false
    @Published private(set) var height = PanelController.defaultHeight
    @Published private(set) var terminals: [PanelTerminal] = []
    @Published var selection: PanelTerminal.ID?

    init(isShown: Bool = false, height: Double = PanelController.defaultHeight) {
        self.isShown = isShown
        self.height = max(Self.minHeight, height)
    }

    var selected: PanelTerminal? {
        terminals.first { $0.id == selection }
    }

    /// Shows the panel; with no terminal in it yet, starts one on `target`.
    func show(startingOn target: TerminalTarget) {
        isShown = true
        if terminals.isEmpty { add(target) }
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
        terminals.append(terminal)
        selection = terminal.id
        isShown = true
        return terminal
    }

    /// Ends a terminal. The neighbour to its right (else left) is selected;
    /// the panel hides when the last one closes.
    func close(_ id: PanelTerminal.ID) {
        guard let index = terminals.firstIndex(where: { $0.id == id }) else { return }
        terminals.remove(at: index)
        if selection == id {
            selection = terminals.isEmpty ? nil : terminals[min(index, terminals.count - 1)].id
        }
        if terminals.isEmpty { isShown = false }
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
}
