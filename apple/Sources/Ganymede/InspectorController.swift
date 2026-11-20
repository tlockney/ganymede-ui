import Foundation
import Observation

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

    var systemImage: String {
        switch self {
        case .outline: "list.bullet.indent"
        case .variables: "x.squareroot"
        }
    }
}

/// One window's right inspector (#249): whether it shows, which tab, and
/// how wide it is. The window keeps all three across launches.
@MainActor
@Observable
final class InspectorController {
    static let minWidth: Double = 220
    static let defaultWidth: Double = 280
    static let maxWidth: Double = 520
    /// Room the notebook keeps beside the inspector.
    static let notebookRoom: Double = 360

    /// What the person chose: kept across launches, and left alone while
    /// the tab has no notebook (`available`), so it comes back with one.
    var isShown = false
    /// Whether the tab shows a notebook (#729): the inspector is for one,
    /// so a console, a data file or the start screen has none. The window
    /// sets it as the page changes.
    var available = true
    var tab = InspectorTab.outline
    private(set) var width = InspectorController.defaultWidth

    /// Whether it is on screen: chosen, and the tab has a notebook.
    var isVisible: Bool { isShown && available }

    /// Whether a tab shows a notebook, as the page's state says once it
    /// has posted one (`pageReported`). Before that a window opened on a
    /// notebook counts as showing one, so the inspector doesn't flash away
    /// as the page loads.
    static func showsNotebook(state: PageState, pageReported: Bool, target: WindowTarget) -> Bool {
        if pageReported { return state.hasNotebook }
        if case .file(let url) = target {
            return !FolderEntry.dataExtensions.contains(url.pathExtension.lowercased())
        }
        return false
    }

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

    /// Whether the page should read the variables for it: on screen, on
    /// Variables.
    var wantsVariables: Bool { isVisible && tab == .variables }
}
