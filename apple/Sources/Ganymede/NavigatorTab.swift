import SwiftUI

/// The sidebar's navigator tabs, the same on the Mac (#246) and the iPad
/// (#251).
enum NavigatorTab: String, CaseIterable, Identifiable {
    case files, search, running, outline, recents, journals

    var id: String { rawValue }

    var title: String {
        switch self {
        case .files: "Files"
        case .search: "Search"
        case .running: "Running"
        case .journals: "Journals"
        case .outline: "Outline"
        case .recents: "Recents"
        }
    }

    var symbol: String {
        switch self {
        case .files: "folder"
        case .search: "magnifyingglass"
        case .running: "bolt"
        case .journals: "text.book.closed"
        case .outline: "list.bullet.indent"
        case .recents: "clock"
        }
    }

    /// ⌘1 to ⌘6 in tab order, as Xcode's navigators; Journals, added last, takes ⌘6 so no
    /// existing key moves.
    var shortcut: KeyEquivalent {
        switch self {
        case .files: "1"
        case .search: "2"
        case .running: "3"
        case .outline: "4"
        case .recents: "5"
        case .journals: "6"
        }
    }
}
