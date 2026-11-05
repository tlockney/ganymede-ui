import Combine
import Foundation

/// Every terminal open in the app, in a window's bottom panel or in a tab
/// of its own, for the navigator's Running tab (#246).
@MainActor
final class OpenTerminals: ObservableObject {
    static let shared = OpenTerminals()

    struct Entry: Identifiable {
        let id: UUID
        /// The shell's title, or what the terminal is called before it sets one.
        var title: String
        /// In a notebook window's bottom panel, rather than a tab of its own.
        var inPanel: Bool
        /// Brings the terminal to the front: its window, and its panel tab.
        var reveal: @MainActor () -> Void
        /// Ends the terminal, as closing its tab or window does.
        var close: @MainActor () -> Void
    }

    /// In the order they opened.
    @Published private(set) var entries: [Entry] = []

    /// Adds `entry`, or replaces the one with its id in place.
    func update(_ entry: Entry) {
        if let index = entries.firstIndex(where: { $0.id == entry.id }) {
            entries[index] = entry
        } else {
            entries.append(entry)
        }
    }

    func remove(_ id: Entry.ID) {
        entries.removeAll { $0.id == id }
    }

    /// The sidebar's server line: "2 kernels, 1 terminal", or "Nothing
    /// running".
    static func summary(kernels: Int, terminals: Int) -> String {
        func count(_ n: Int, _ noun: String) -> String { "\(n) \(noun)\(n == 1 ? "" : "s")" }
        switch (kernels, terminals) {
        case (0, 0): return "Nothing running"
        case (_, 0): return count(kernels, "kernel")
        case (0, _): return count(terminals, "terminal")
        default: return count(kernels, "kernel") + ", " + count(terminals, "terminal")
        }
    }
}
