import SwiftUI

/// The sidebar's navigator tabs, the same on the Mac (#246) and the iPad
/// (#251).
enum NavigatorTab: String, CaseIterable, Identifiable {
    case files, search, running, outline, recents

    var id: String { rawValue }

    var title: String {
        switch self {
        case .files: "Files"
        case .search: "Search"
        case .running: "Running"
        case .outline: "Outline"
        case .recents: "Recents"
        }
    }

    var symbol: String {
        switch self {
        case .files: "folder"
        case .search: "magnifyingglass"
        case .running: "bolt"
        case .outline: "list.bullet.indent"
        case .recents: "clock"
        }
    }

    /// ⌘1 to ⌘5, as Xcode's navigators.
    var shortcut: KeyEquivalent {
        KeyEquivalent(Character(String((Self.allCases.firstIndex(of: self) ?? 0) + 1)))
    }
}
