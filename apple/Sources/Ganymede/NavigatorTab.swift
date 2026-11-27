import SwiftUI

/// The sidebar's navigator tabs: the Mac's (#246, #879) and the iPad's
/// (#251).
enum NavigatorTab: String, CaseIterable, Identifiable {
    case files, search, running, outline, find, recents, journals

    var id: String { rawValue }

    var title: String {
        switch self {
        case .files: "Files"
        case .search: "Search"
        case .running: "Running"
        case .journals: "Journals"
        case .outline: "Outline"
        case .find: "Find"
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
        case .find: "magnifyingglass"
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
        case .find: "2"
        case .recents: "5"
        case .journals: "6"
        }
    }

    /// The tab's tooltip (#873): its name and the key that shows it, as
    /// "Files (⌘1)".
    var help: String { "\(title) (⌘\(String(shortcut.character)))" }

    /// What the Running tab's accessibility value says (#873): "2 running",
    /// or nothing while nothing runs.
    static func runningValue(_ count: Int) -> String {
        count > 0 ? "\(count) running" : ""
    }

    /// The platform whose sidebar this is (#879): the Mac's one Find tab
    /// joins the outline and search; the iPad keeps both until step 7.
    enum SidebarPlatform {
        case mac, iPad
    }

    /// The running app's own.
    static var platform: SidebarPlatform {
        #if os(macOS)
        .mac
        #else
        .iPad
        #endif
    }

    /// The tabs a window of `place` shows (#758, #879): the Mac's Find
    /// replaces Search and Outline; every tab, but not Recents for a
    /// machine, whose notebooks aren't in them (`Place.indexesLocally`).
    /// Journals is for every place.
    static func tabs(for place: Place, on platform: SidebarPlatform = NavigatorTab.platform) -> [NavigatorTab] {
        let recents: [NavigatorTab] = place.indexesLocally ? [.recents] : []
        switch platform {
        case .mac:
            return [.files, .find, .running] + recents + [.journals]
        case .iPad:
            return [.files, .search, .running, .outline] + recents + [.journals]
        }
    }

    /// The tab a window shows (#879): `stored` while it has it; a Mac
    /// window's stored Search or Outline is its Find; else Files.
    static func shown(_ stored: NavigatorTab, in tabs: [NavigatorTab]) -> NavigatorTab {
        if tabs.contains(stored) { return stored }
        if tabs.contains(.find), stored == .search || stored == .outline { return .find }
        return .files
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

/// What the Find tab shows (#879): the open notebook's outline while its
/// field is empty, else the notebook's matches and then the folder's files.
/// Pure, so the view's sections are tested without a window.
enum FindLayout {
    enum Section: Equatable {
        case outline, notebook, files
    }

    /// What the list says over no rows (#879): "Searching…" while an
    /// answer is still on its way, else that nothing matched.
    enum Status: Equatable {
        /// Nothing to say: the field is empty, or rows show.
        case none
        /// The page or the files are still being asked.
        case searching
        /// Nothing matched; `stoppedEarly` for a scan of the files that
        /// gave up before it had looked everywhere.
        case nothing(stoppedEarly: Bool)
    }

    /// The trimmed query: what the page is asked to find, and what the
    /// query of its answer (`PageState.notebookFind`) must be to show.
    static func normalized(_ query: String) -> String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    /// The sections, in order: the outline alone while the query is empty;
    /// otherwise the notebook's matches when one is open, then the folder's.
    static func sections(query: String, hasNotebook: Bool) -> [Section] {
        guard !normalized(query).isEmpty else { return [.outline] }
        return (hasNotebook ? [Section.notebook] : []) + [.files]
    }

    /// The page's answer that may show for `query` (#879): nil while it is
    /// another query's, which the page has yet to replace.
    static func answer(for query: String, in find: PageState.NotebookFind?) -> PageState.NotebookFind? {
        guard let find, find.query == normalized(query) else { return nil }
        return find
    }

    /// Whether the page must be asked again (#879): a page loaded again
    /// forgets the query it was asked, as it forgets `inspect-variables`,
    /// so a field with a query is asked again while the answer is gone or
    /// another query's.
    static func shouldReask(query: String, find: PageState.NotebookFind?) -> Bool {
        !normalized(query).isEmpty && answer(for: query, in: find) == nil
    }

    /// What the list says while it shows no rows (#879): still searching
    /// while the page hasn't answered for the field's query, so "No
    /// matches" doesn't flash before it does. The files' search no longer
    /// speaks for the notebook, whose rows may yet arrive.
    static func status(
        query: String, hasNotebook: Bool, find: PageState.NotebookFind?,
        searchingFiles: Bool, fileMatches: Int, stoppedEarly: Bool
    ) -> Status {
        guard !normalized(query).isEmpty else { return .none }
        let found = answer(for: query, in: find)
        let notebookMatches = hasNotebook ? found?.matches.count ?? 0 : 0
        if notebookMatches > 0 || fileMatches > 0 { return .none }
        if hasNotebook, found == nil { return .searching }
        return searchingFiles ? .searching : .nothing(stoppedEarly: stoppedEarly)
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
