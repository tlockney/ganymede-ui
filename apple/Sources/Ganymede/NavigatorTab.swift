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

    /// The tabs a window of `place` shows, the same on the Mac and the iPad
    /// (#758): every tab, but not Recents for a machine, whose notebooks
    /// aren't in them (`Place.indexesLocally`). Journals is for every place.
    static func tabs(for place: Place) -> [NavigatorTab] {
        allCases.filter { $0 != .recents || place.indexesLocally }
    }

    /// Whether the journals are wanted now (#758): the iPad's (`tabbed`)
    /// Journals tab shows, or the iPhone's list does (its Journals
    /// section). Either stops while the list is hidden (`listShown`); the
    /// iPad's also while its split view's sidebar column is (`columnShown`,
    /// #762), since a collapsed column stays in the view tree.
    static func showsJournals(tabbed: Bool, tab: NavigatorTab, listShown: Bool, columnShown: Bool) -> Bool {
        tabbed ? listShown && columnShown && tab == .journals : listShown
    }

    /// Whether the iPad's split view shows its sidebar column (#762):
    /// not when collapsed to the notebook, nor in portrait's `.automatic`,
    /// which shows the notebook alone. A compact window (Split View,
    /// Slide Over, a narrow window) makes the split view one stack, where
    /// the sidebar's own appear and disappear (`listShown`) say whether it
    /// shows, so the column counts as shown there.
    static func sidebarColumnShown(_ columns: SidebarColumns, portrait: Bool, compact: Bool) -> Bool {
        switch columns {
        case .hidden: compact
        case .automatic: compact || !portrait
        case .shown: true
        }
    }
}

/// The iPad's split view columns, as `ContentView` keeps them (#762).
/// Its own type because `NavigationSplitViewVisibility` can't be told
/// apart by `==` on iPadOS: on the iPad simulator `.automatic ==
/// .detailOnly` held (#772's CI).
enum SidebarColumns: Equatable {
    /// The system's choice: the sidebar in landscape, the notebook alone
    /// in portrait.
    case automatic
    /// The notebook alone (`.detailOnly`).
    case hidden
    /// The sidebar beside the notebook.
    case shown

    /// What the split view is given.
    var visibility: NavigationSplitViewVisibility {
        switch self {
        case .automatic: .automatic
        case .hidden: .detailOnly
        case .shown: .all
        }
    }

    /// What the split view sets when the person shows or hides the
    /// sidebar: `.all` or `.doubleColumn` to show it, `.detailOnly` to
    /// hide it. CI showed `.automatic == .detailOnly` on iPadOS, so
    /// anything but the two that show counts as hidden
    /// (`NavigatorTabTests.testTheSplitViewsShowAndHideAreReadBack`).
    init(_ visibility: NavigationSplitViewVisibility) {
        self = visibility == .all || visibility == .doubleColumn ? .shown : .hidden
    }
}
