import Combine
import Foundation

/// What the Mac window's right inspector shows (#249).
enum InspectorTab: String, CaseIterable, Identifiable {
    case outline, variables

    var id: String { rawValue }

    var title: String {
        switch self {
        case .outline: "Outline"
        case .variables: "Variables"
        }
    }
}

/// One window's right inspector (#249): whether it shows, which tab, and
/// how wide it is. The window keeps all three across launches.
@MainActor
final class InspectorController: ObservableObject {
    static let minWidth: Double = 220
    static let defaultWidth: Double = 280
    static let maxWidth: Double = 520
    /// Room the notebook keeps beside the inspector.
    static let notebookRoom: Double = 360

    @Published var isShown = false
    @Published var tab = InspectorTab.outline
    @Published private(set) var width = InspectorController.defaultWidth

    /// ⌥⌘0: shows or hides it.
    func toggle() {
        isShown.toggle()
    }

    /// Shows it on `tab`.
    func show(_ tab: InspectorTab) {
        self.tab = tab
        isShown = true
    }

    /// Sets the width, kept between `minWidth` and `maxWidth` and leaving
    /// the notebook `notebookRoom` of a window `available` wide.
    func resize(to width: Double, available: Double) {
        let most = max(Self.minWidth, min(Self.maxWidth, available - Self.notebookRoom))
        self.width = min(max(width, Self.minWidth), most)
    }

    /// Whether the page should read the variables for it: shown, on
    /// Variables.
    var wantsVariables: Bool { isShown && tab == .variables }
}
