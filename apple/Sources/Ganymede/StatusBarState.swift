import Foundation

/// What the Mac status bar shows (#882): save state on the left, kernel
/// version and memory on the right. Kept apart from the view so tests
/// cover its formatting and visibility without a window.
struct StatusBarContent: Equatable {
    var save: String?
    var version: String?
    var memory: String?

    var isEmpty: Bool { save == nil && version == nil && memory == nil }

    /// UserDefaults key for View > Show/Hide Status Bar (⌘/), defaulting to on.
    static let shownKey = "statusBar.shown"

    /// Default-on lookup for tests and non-view callers.
    static func isShown(in defaults: UserDefaults = .standard) -> Bool {
        defaults.object(forKey: shownKey) as? Bool ?? true
    }

    /// View menu title: names what choosing the item does, matching
    /// Show/Hide Sidebar, Terminal Panel and Inspector.
    static func menuTitle(shown: Bool) -> String {
        shown ? "Hide Status Bar" : "Show Status Bar"
    }

    /// Whether the status bar shows notebook details and watches kernel
    /// memory: the preference is on, a notebook is open, and neither the
    /// terminal panel nor the inspector is filling the window over it.
    static func showsContent(
        barShown: Bool, showsNotebook: Bool, filled: WindowArea?
    ) -> Bool {
        barShown && showsNotebook && filled != .panel && filled != .inspector
    }

    /// Builds the bar's three parts for a notebook window, or an empty
    /// value when no notebook is open.
    static func make(header: HeaderStatus?, state: PageState) -> StatusBarContent {
        guard state.hasNotebook else { return StatusBarContent() }
        let trimmedVersion = state.kernelVersionLine?.trimmingCharacters(in: .whitespacesAndNewlines)
        let version = trimmedVersion?.isEmpty == false ? trimmedVersion : nil
        let memory = state.path.flatMap { path in
            state.sessions.first { $0.path == path }?.memoryLabel
        }
        return StatusBarContent(
            save: header?.save,
            version: version,
            memory: memory
        )
    }
}

/// Tracks a single view's watch on `PageModel.watchMemory` (#882) so
/// memory is watched only while the view is visible, and hiding a view
/// that wasn't watching never removes another view's watch.
struct MemoryWatcher: Equatable {
    private(set) var isWatching = false

    /// Updates whether this view wants memory; returns the new state to
    /// pass to `PageModel.watchMemory(_:)` only when it changes.
    mutating func set(_ wanted: Bool) -> Bool? {
        guard wanted != isWatching else { return nil }
        isWatching = wanted
        return wanted
    }

    /// Calls `watch` only when the view's watching state flips.
    mutating func update(visible: Bool, watch: (Bool) -> Void) {
        if let changed = set(visible) { watch(changed) }
    }
}
