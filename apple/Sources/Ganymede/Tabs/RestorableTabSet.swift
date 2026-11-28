import Foundation

/// Serializable snapshot of a workspace window's ordered tabs, active tab
/// index, and per-tab sidebar root stored in `@SceneStorage("window.tabs")`
/// across macOS relaunches (#905), with backward-compatible fallback to legacy
/// `@SceneStorage("window.target")` and `@SceneStorage("window.sidebar")`.
struct RestorableTabSet: Codable, Equatable {
    enum SavedTab: Codable, Equatable {
        case page(target: WindowTarget, sidebarRoot: String)
        case editor(request: EditorRequest, sidebarRoot: String)
        case terminal(target: TerminalTarget, sidebarRoot: String)
    }

    var tabs: [SavedTab]
    var selectedIndex: Int

    init(tabs: [SavedTab], selectedIndex: Int) {
        self.tabs = tabs
        self.selectedIndex = selectedIndex
    }

    /// Safe active index clamped to `0..<tabs.count`, or `0` when empty.
    var clampedSelectedIndex: Int {
        guard !tabs.isEmpty else { return 0 }
        return max(0, min(selectedIndex, tabs.count - 1))
    }

    /// Encodes as UTF-8 JSON for `@SceneStorage`, or `""` when empty.
    func encoded() -> String {
        guard !tabs.isEmpty, let data = try? JSONEncoder().encode(self) else { return "" }
        return String(decoding: data, as: UTF8.self)
    }

    /// Decodes from `@SceneStorage` JSON. Returns `nil` on empty input, corrupt
    /// JSON, or an empty tab array.
    init?(saved: String) {
        guard !saved.isEmpty,
              let decoded = try? JSONDecoder().decode(RestorableTabSet.self, from: Data(saved.utf8)),
              !decoded.tabs.isEmpty
        else { return nil }
        self = RestorableTabSet(tabs: decoded.tabs, selectedIndex: decoded.clampedSelectedIndex)
    }

    /// Resolves a window's restorable tab set from `@SceneStorage("window.tabs")`,
    /// falling back cleanly to legacy `@SceneStorage("window.target")` +
    /// `@SceneStorage("window.sidebar")` when no multi-tab snapshot exists.
    static func resolve(
        savedTabs: String,
        legacyTarget: String,
        legacySidebar: String
    ) -> RestorableTabSet? {
        if let multi = RestorableTabSet(saved: savedTabs) {
            return multi
        }
        guard let legacy = WindowTarget(saved: legacyTarget) else { return nil }
        return RestorableTabSet(
            tabs: [.page(target: legacy, sidebarRoot: legacySidebar)],
            selectedIndex: 0
        )
    }
}
