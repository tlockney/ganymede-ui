#if os(iOS)
import SwiftUI
import UIKit

// The iPad's own sidebar, toolbar and key commands (#208), as the Mac has
// (#206, #207). The page shows only the notebook (`chrome=native`); these
// read `PageModel.state` and run its commands. The iPhone uses the same
// sidebar as its root screen and pushes the notebook onto it (#209).

/// Whether this device draws the notebook's chrome natively: the iPad and
/// the iPhone.
@MainActor
var drawsNativeChrome: Bool { [.pad, .phone].contains(UIDevice.current.userInterfaceIdiom) }

/// Whether this is a phone: one column, the notebook pushed onto the list.
@MainActor
var isPhone: Bool { UIDevice.current.userInterfaceIdiom == .phone }

// MARK: - Sidebar

/// The notebook folder as a tree: notebooks open in the page, other files
/// in the app's editor. Paths are relative to `folder`, where the iPad's
/// server is rooted. For a connected machine (#758) the folder is the
/// machine's root and its files come through `fileSource`; there is no
/// editor for its non-page files, and the items that belong to this device
/// are off, as in the Mac's machine windows.
struct IPadSidebar: View {
    let folder: URL
    /// Where the files are (#757). Nil: this device's disk, rooted at
    /// `folder`, deleting for good.
    var fileSource: (any FileSource)?
    /// The scene's place (#758): a machine's gets the Mac's gates.
    var place: Place = .thisDevice
    var page: PageModel
    let openFile: (String) -> Void
    /// After a notebook is opened from the sidebar.
    var opened: () -> Void = {}
    @Environment(\.scenePhase) private var phase
    /// Bumped to list the folders again after a change.
    @State private var generation = 0
    @State private var renaming: FolderEntry?
    @State private var newName = ""
    @State private var deleting: FolderEntry?
    @State private var failure: String?
    /// Whether a file operation is running: one at a time, as the Mac's.
    @State private var busy = false
    /// The selected Files row, which the arrow keys of a hardware keyboard
    /// move and Return, Right and Left act on (#787).
    @State private var selection: FolderEntry?
    /// The expanded folders of the Files tree, by file URL; here, not per
    /// folder, so the keys can expand any of them (#787).
    @State private var expandedFolders: Set<URL> = []
    /// The Files rows listed so far, by folder: Left finds a row's parent
    /// here, and a reload that drops the selected row clears it (#791).
    @State private var tree = SidebarTree()
    /// The search field's text, and whether it reads notebooks too (#240).
    @State private var query = ""
    @State private var searchContents = false
    /// The iPad's sidebar: one navigator tab at a time, as the Mac's
    /// (#251). The iPhone's list shows everything at once.
    var tabbed = false
    /// The bottom panel, whose terminals the Running tab lists (#251).
    var panel: PanelController
    /// The Running tab's terminal was tapped.
    var showTerminal: (PanelTerminal.ID) -> Void = { _ in }
    /// The selected navigator tab, kept per scene.
    @SceneStorage("navigator.tab") private var tab: NavigatorTab = .files
    /// The journals of the place, while the Journals tab shows (#758).
    @State private var journals: Journals.Result?
    /// Whether the list shows (the iPhone's goes under the notebook).
    @State private var listShown = true
    /// Whether the iPad's split view shows the sidebar column, which
    /// `ContentView` owns (`NavigatorTab.sidebarColumnShown`, #762).
    var columnShown = true
    /// Shows a connected machine in the scene (#701); without it the list
    /// has no places.
    var onPlace: ((Place) -> Void)? = nil
    @Environment(AppModel.self) private var model

    /// The Journals poll restarts on a new server or when the list shows or
    /// hides it. Its own property: inline, it is too much for the type
    /// checker in `body`.
    private var journalsPollID: String {
        let server: String = model.serverURL?.absoluteString ?? ""
        return server + "|" + String(showsJournals)
    }

    /// The toolbar's New menu.
    private var newMenu: some View {
        Menu {
            Button { newNotebook(in: folder) } label: { Label("New Notebook", systemImage: "doc.badge.plus") }
                .disabled(!reachable)
            Button { newFolder(in: folder) } label: { Label("New Folder", systemImage: "folder.badge.plus") }
                .disabled(!canChange)
            // The iPhone has no File menu or welcome screen: the
            // examples are here (#414). They are copied to this
            // device's folder, so a machine has none.
            if place.isThisDevice {
                Button { openExamples() } label: { Label("Open Example Notebooks", systemImage: "book") }
                    .disabled(page.state.backend == nil)
            }
        } label: {
            Label("New", systemImage: "plus")
        }
    }

    // `body` is split into steps: as one chain it is too much for the type
    // checker.
    var body: some View {
        watched
            .alert("Rename", isPresented: renamingShown, presenting: renaming) { entry in
                TextField("Name", text: $newName)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Rename") { rename(entry, to: newName) }
                Button("Cancel", role: .cancel) {}
            }
            .confirmationDialog(
                deleteAlert?.title ?? "", isPresented: deletingShown, titleVisibility: .visible, presenting: deleting
            ) { entry in
                Button("Delete", role: .destructive) { delete(entry) }
            } message: { _ in
                Text(deleteAlert?.message ?? "")
            }
            .alert("Couldn't do that", isPresented: failureShown, presenting: failure) { _ in
                Button("OK", role: .cancel) {}
            } message: { Text($0) }
    }

    @ViewBuilder
    private var listContent: some View {
        placesSection
        if tabbed {
            navigator
        } else {
            if query.trimmingCharacters(in: .whitespaces).isEmpty {
                // Recents are this device's notebooks, not a machine's.
                if place.indexesLocally { recentsSection }
                filesSection
                journalsSection
            } else {
                searchResults
            }
            runningSection
        }
    }

    private var list: some View {
        List(selection: selectionBinding) { listContent }
            .listStyle(.sidebar)
            .modifier(SidebarKeys(
                selection: filesShown ? selection : nil,
                isExpanded: { expandedFolders.contains($0.url) },
                setExpanded: { entry, expanded in
                    if expanded { expandedFolders.insert(entry.url) } else { expandedFolders.remove(entry.url) }
                },
                canOpen: { $0.canOpen(in: place) },
                open: open,
                parent: { tree.parent(of: $0, root: folder) },
                select: { if filesShown { selection = $0 } }
            ))
            // The list is shared by every tab: a selection made in Files
            // mustn't take Return in Search or Running.
            .onChange(of: shownTab) { selection = nil }
            // Another folder: the old one's rows are gone.
            .onChange(of: folder) {
                selection = nil
                tree = SidebarTree()
            }
            .navigationTitle(tabbed ? shownTab.title : "Notebooks")
            // The iPad's navigator tabs, as on the Mac (#251).
            .safeAreaInset(edge: .top, spacing: 0) {
                if tabbed { tabStrip }
            }
    }

    /// Whether the Files tab shows in the iPad's tabbed list: the only
    /// list with a selection. The iPhone's has none: there a row only
    /// opens, and nothing stays highlighted.
    private var filesShown: Bool { tabbed && shownTab == .files }

    private var selectionBinding: Binding<FolderEntry?> {
        Binding(
            get: { filesShown ? selection : nil },
            set: { if filesShown { selection = $0 } }
        )
    }

    /// A reloaded page has no search, and a keystroke before the page was
    /// ready went nowhere.
    private var searchLost: Bool { page.state.search == nil && page.state.backend != nil }

    private var searching: some View {
        list
            // The page searches (`src/lib/search.ts`), after typing pauses.
            // The iPad's Search tab has a field of its own.
            .modifier(SidebarSearch(enabled: !tabbed, query: $query))
            .onChange(of: query) { search() }
            .onChange(of: searchContents) { search() }
            // Ask again, or it says Searching… for good.
            .onChange(of: searchLost) { _, lost in
                if lost, !query.trimmingCharacters(in: .whitespaces).isEmpty { search() }
            }
            .toolbar {
                ToolbarItem(placement: .primaryAction) { newMenu }
            }
            .refreshable { generation += 1 }
    }

    private var watched: some View {
        searching
            // The machine answers again: list everything again (#753). The
            // Journals tab asks the place's server while it shows (#758).
            .modifier(SidebarWatchers(
                reachable: reachable, relist: { generation += 1 },
                pollID: journalsPollID,
                poll: pollJournals, shown: $listShown))
            // The examples show in the app's own folder from the start
            // (#463), never in a machine's.
            .modifier(AddsExamples(page: page, enabled: place.isThisDevice) { generation += 1 })
            .onChange(of: page.state.path) { old, _ in
                generation += 1
                // The page renamed or moved the open notebook: the row
                // selected under its old path is gone.
                if let old, let selected = selection, FolderEntry.path(path(selected), isAt: old) { selection = nil }
            }
            .onChange(of: phase) { _, phase in
                if phase == .active { generation += 1 }
            }
    }

    // MARK: Navigator tabs (#251)

    /// The tabs over the iPad's sidebar, as the Mac's: ⌘1 to ⌘5 with a
    /// keyboard.
    private var tabStrip: some View {
        HStack(spacing: 0) {
            ForEach(tabs) { item in
                Button {
                    tab = item
                } label: {
                    Image(systemName: item.symbol)
                        .symbolVariant(shownTab == item ? .fill : .none)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(shownTab == item ? Color.accentColor : Color.secondary)
                .accessibilityLabel(item.title)
                .accessibilityAddTraits(shownTab == item ? .isSelected : [])
                .keyboardShortcut(item.shortcut, modifiers: .command)
                .hoverEffect()
                .overlay(alignment: .top) {
                    if item == .running, runningCount > 0 {
                        Text("\(runningCount)")
                            .font(.system(size: 10, weight: .semibold))
                            .padding(.horizontal, 4)
                            .background(Capsule().fill(Color.accentColor))
                            .foregroundStyle(.white)
                            .offset(x: 12, y: 4)
                            .accessibilityHidden(true)
                    }
                }
            }
        }
        .padding(.horizontal, 8)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
    }

    /// The tabs of the place, as the Mac's (#251, #758): Journals for every
    /// place, no Recents for a machine.
    private var tabs: [NavigatorTab] { NavigatorTab.tabs(for: place) }

    /// The selected tab, or Files when the place has no such tab (Recents,
    /// kept from this device's, in a machine's scene).
    private var shownTab: NavigatorTab { tabs.contains(tab) ? tab : .files }

    /// Kernels, and the panel's terminals, which are this device's.
    private var runningCount: Int {
        page.state.sessions.count + (place.allows(.localTerminal) ? panel.terminals.count : 0)
    }

    // MARK: Journals (#758)

    /// Whether the journals are wanted now: the iPad's tab shows, or the
    /// iPhone's list does (its Journals section); not while the list is
    /// hidden, nor while the iPad's split view hides the sidebar column
    /// (`columnShown`, #762).
    private var showsJournals: Bool {
        NavigatorTab.showsJournals(tabbed: tabbed, tab: shownTab, listShown: listShown, columnShown: columnShown)
    }

    /// Asks the place's server for its rooms every few seconds while they
    /// show, and not again once it says it is too old; cancelled when the
    /// tab hides or the server (its address and token) changes.
    private func pollJournals() async {
        guard showsJournals, let server = model.serverURL else { return }
        while !Task.isCancelled {
            let answer = await Journals.fetch(place: place, server: server)
            guard !Task.isCancelled else { return }
            journals = answer
            if answer == .unsupported { return }
            try? await Task.sleep(for: .seconds(Journals.pollSeconds))
        }
    }

    /// The notebooks an agent is in or last wrote.
    private var journalList: [Journals.Journal] {
        if case .rooms(let rooms)? = journals { Journals.journalsOf(rooms) } else { [] }
    }

    /// The iPad's Journals tab.
    @ViewBuilder
    private var journalsTab: some View {
        let list = journalList
        journalRows(list)
        if journals == nil {
            HStack(spacing: 8) {
                ProgressView()
                Text("Loading…").foregroundStyle(.secondary)
            }
        } else if let text = Journals.statusMessage(journals, journalCount: list.count) {
            Text(text).foregroundStyle(.secondary)
        }
    }

    /// The iPhone's list: a Journals section when there are any.
    @ViewBuilder
    private var journalsSection: some View {
        let list = journalList
        if !list.isEmpty {
            Section("Journals") { journalRows(list) }
        }
    }

    @ViewBuilder
    private func journalRows(_ list: [Journals.Journal]) -> some View {
        ForEach(list) { journal in
            Button {
                page.run("open", arg: journal.path)
                opened()
            } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Label(journal.name, systemImage: "book.pages").lineLimit(1)
                        Text([journal.agent, Journals.status(journal)].compactMap { $0 }.joined(separator: " · "))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer()
                    if journal.running {
                        Circle().fill(Color.green).frame(width: 6, height: 6)
                            .accessibilityLabel("An agent is in it")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .listRowBackground(journal.path == page.state.path ? Color.accentColor.opacity(0.18) : nil)
        }
    }

    /// The connected machines, above the files: the iPhone's Places list,
    /// and the iPad's place switcher (#701). Nothing without a machine. A
    /// machine's scene has it even when the machine was removed meanwhile,
    /// so the way back to this device stays.
    @ViewBuilder
    private var placesSection: some View {
        let machines = model.places.filter { $0.place.isMachine }
        if let onPlace, !machines.isEmpty || place.isMachine, tabbed {
            // The iPad: the current place's name, with a dot, as the Mac's.
            Section {
                PlaceMenu(
                    entries: model.places, current: place, reachability: .shared, pick: onPlace)
            }
        } else if let onPlace, !machines.isEmpty || place.isMachine {
            Section("Places") {
                placeRow(PlaceEntry(place: .thisDevice, title: Places.deviceName), onPlace)
                ForEach(machines) { entry in placeRow(entry, onPlace) }
            }
        }
    }

    /// One place of the iPhone's list: the current one has a checkmark.
    @ViewBuilder
    private func placeRow(_ entry: PlaceEntry, _ onPlace: @escaping (Place) -> Void) -> some View {
        if entry.place == place {
            Label(entry.title, systemImage: "checkmark")
        } else {
            Button {
                onPlace(entry.place)
            } label: {
                HStack {
                    Label(entry.title, systemImage: entry.place.isMachine ? "desktopcomputer" : "iphone")
                    Spacer()
                    Circle()
                        .fill(PlaceReachability.shared.isReachable(entry.place) ? Color.green : Color.red)
                        .frame(width: 8, height: 8)
                        .accessibilityLabel(PlaceReachability.shared.isReachable(entry.place) ? "Reachable" : "Offline")
                }
            }
        }
    }

    /// The selected tab's list.
    @ViewBuilder
    private var navigator: some View {
        switch shownTab {
        case .files:
            filesSection
        case .journals:
            journalsTab
        case .search:
            Section {
                TextField("Find files", text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.search)
            }
            if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                searchResults
            } else {
                Section { Toggle("Search notebook contents", isOn: $searchContents) }
            }
        case .running:
            runningSection
            // The panel's shells are on this device.
            if place.allows(.localTerminal) {
                IPadPanelTerminalRows(panel: panel, show: showTerminal)
            }
            if runningCount == 0 {
                Text("No kernels or terminals running").foregroundStyle(.secondary)
            }
        case .outline:
            // The open notebook's headings, as on the Mac (#288).
            IPadOutlineRows(page: page, picked: opened)
        case .recents:
            recentsSection
            if (page.state.recents ?? []).isEmpty {
                Text("Notebooks you open show here").foregroundStyle(.secondary)
            }
        }
    }

    /// The folder as a tree, under the machine's offline line (#753).
    @ViewBuilder
    private var filesSection: some View {
        if !reachable {
            Text(machineName.map { "“\($0)” is offline. Reconnecting…" } ?? "The machine is offline. Reconnecting…")
                .foregroundStyle(.secondary).font(.caption)
        }
        Section(folder.lastPathComponent.isEmpty ? "/" : folder.lastPathComponent) {
            IPadFolderContents(folder: folder, source: source, actions: actions, generation: generation)
        }
    }

    /// Kernels keep running when their notebook is closed or another is
    /// opened; here they can be found and shut down (#225).
    @ViewBuilder
    private var runningSection: some View {
        if !page.state.sessions.isEmpty {
            Section(tabbed ? "Kernels" : "Running") {
                ForEach(page.state.sessions) { session in
                    Button {
                        page.run("open", arg: session.path)
                        opened()
                    } label: {
                        HStack {
                            Label(session.title, systemImage: "bolt.fill")
                            Spacer()
                            if let kernel = session.kernel {
                                Text(kernel).foregroundStyle(.secondary).font(.caption)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    // A swipe only reveals the button: shutting down loses the
                    // kernel's state.
                    .swipeActions(allowsFullSwipe: false) {
                        Button("Shut Down") { page.run("shutdown-kernel", arg: session.id) }
                            .tint(.red)
                    }
                    .contextMenu {
                        Button { page.run("shutdown-kernel", arg: session.id) } label: {
                            Label("Shut Down Kernel", systemImage: "power")
                        }
                    }
                }
            }
        }
    }

    // MARK: Search and Recents (#240)

    private func search() {
        page.run("search", arg: PageState.searchRequest(query, contents: searchContents))
    }

    /// The notebooks opened last on this backend, as the page keeps them.
    @ViewBuilder
    private var recentsSection: some View {
        let recents = page.state.recents ?? []
        if !recents.isEmpty {
            Section {
                ForEach(recents, id: \.self) { path in
                    Button {
                        page.run("open", arg: path)
                        opened()
                    } label: {
                        Label(Self.title(path), systemImage: "clock")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .listRowBackground(path == page.state.path ? Color.accentColor.opacity(0.18) : nil)
                }
            } header: {
                HStack {
                    Text("Recents")
                    Spacer()
                    Button("Clear") { page.run("clear-recents") }
                        .font(.caption)
                        .textCase(nil)
                }
            }
        }
    }

    /// What the search found in the folder and below it.
    @ViewBuilder
    private var searchResults: some View {
        Section {
            Toggle("Search notebook contents", isOn: $searchContents)
            if let search = page.state.search {
                ForEach(search.matches) { match in
                    Button { openMatch(match) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Label(match.title, systemImage: match.isDirectory ? "folder" : match.isNotebook ? "book.pages" : "doc.text")
                            if !match.folder.isEmpty {
                                Text(match.folder).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                            if let snippet = match.snippet {
                                Text(snippet).font(.caption.monospaced()).foregroundStyle(.secondary).lineLimit(2)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .disabled(!search.opens(match) || (!match.opensInPage && !place.allows(.openFile)))
                }
                if search.searching {
                    searchingRow
                } else if let error = search.error {
                    Text(error).foregroundStyle(.secondary).font(.caption)
                } else if search.matches.isEmpty {
                    Text("No matches").foregroundStyle(.secondary)
                }
                if search.truncated {
                    Text("Stopped early: the folder has too many files to search.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                searchingRow
            }
        } header: {
            Text("Results")
        }
    }

    private var searchingRow: some View {
        HStack(spacing: 8) {
            ProgressView()
            Text("Searching…").foregroundStyle(.secondary)
        }
    }

    private func openMatch(_ match: PageState.Search.Match) {
        if match.opensInPage {
            page.run("open", arg: match.path)
            opened()
        } else if place.allows(.openFile), page.state.search?.opens(match) == true {
            openFile(match.path)
        }
    }

    /// A notebook path's name without `.ipynb`.
    private static func title(_ path: String) -> String {
        let name = path.split(separator: "/").last.map(String.init) ?? path
        return name.hasSuffix(".ipynb") ? String(name.dropLast(6)) : name
    }

    private var actions: IPadFolderActions {
        IPadFolderActions(
            openPath: page.state.path,
            isRunning: { page.state.isRunning($0) },
            canChange: canChange,
            offline: !reachable,
            place: place,
            machineName: machineName,
            isExpanded: { url in
                Binding(
                    get: { expandedFolders.contains(url) },
                    set: { if $0 { expandedFolders.insert(url) } else { expandedFolders.remove(url) } }
                )
            },
            select: { if filesShown { selection = $0 } },
            listed: listed(_:in:),
            open: open,
            openByTap: { entry in
                open(entry)
                // The tap left a hardware keyboard in the list; a notebook
                // it opened should have it, so ↓ and Return go to the page
                // (#791), as the Mac's click does.
                if tabbed, entry.opensInPage { returnKeyboardToPage() }
            },
            newNotebook: newNotebook(in:),
            newFolder: newFolder(in:),
            rename: { entry in
                newName = entry.isNotebook ? entry.title : entry.name
                renaming = entry
            },
            duplicate: duplicate,
            delete: { deleting = $0 }
        )
    }

    private var renamingShown: Binding<Bool> {
        Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })
    }

    private var deletingShown: Binding<Bool> {
        Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } })
    }

    private var failureShown: Binding<Bool> {
        Binding(get: { failure != nil }, set: { if !$0 { failure = nil } })
    }

    /// The delete alert's words for the item being deleted: this device's
    /// "This can't be undone.", or a machine's (#758).
    private var deleteAlert: (title: String, message: String)? {
        guard let deleting else { return nil }
        return RemoveAction.deleteAlert(
            place: place, for: deleting,
            holdsOpen: FolderEntry.path(page.state.path, isAt: path(deleting)), dirty: page.state.dirty)
    }

    // MARK: A machine's gates (#758)

    /// Whether the window's machine answers (always true for this device).
    private var reachable: Bool { PlaceReachability.shared.isReachable(place) }

    /// Whether the items that change files are enabled: not while one runs,
    /// and not while a machine doesn't answer (#753).
    private var canChange: Bool { FileChanges.allowed(place: place, reachable: reachable, busy: busy) }

    /// The machine's name, for words about it.
    private var machineName: String? { place.machineID.flatMap(model.machineName(_:)) }

    /// A file operation's or listing's error, in words for the place.
    private func words(_ error: Error) -> String {
        FileSourceError.message(error, place: place, machineName: machineName)
    }

    /// The iPad's server is rooted at `folder`, so paths are relative to
    /// it. Nothing is trashed: the delete alert says it can't be undone.
    private var source: any FileSource {
        fileSource ?? LocalFileSource.notebookFolder(folder)
    }

    private func path(_ entry: FolderEntry) -> String {
        source.serverPath(entry.url)
    }

    /// Clears the selection when it is `entry` or inside it, as a renamed
    /// or deleted folder's rows go.
    private func dropSelection(at entry: FolderEntry) {
        if let selected = selection, selected.isAtOrInside(entry) { selection = nil }
    }

    /// A folder's contents listed `entries` (#791): a selected row the
    /// listing no longer has is cleared (`SidebarTree.listed`).
    private func listed(_ entries: [FolderEntry], in dir: URL) {
        let kept = tree.listed(entries, in: dir, keeping: selection, root: folder)
        if kept != selection { selection = kept }
    }

    /// Gives a hardware keyboard to the page's web view (#791), as the
    /// Mac's `returnKeyboardToPage` does, on the next turn of the run loop
    /// as `TerminalSurface` does: the tap is still being handled, and
    /// `opened` has only just asked for the notebook to show. Nothing
    /// when the page isn't on screen.
    private func returnKeyboardToPage() {
        DispatchQueue.main.async {
            guard let webView = page.webView, webView.window != nil, !webView.isHidden else { return }
            _ = webView.becomeFirstResponder()
        }
    }

    private func open(_ entry: FolderEntry) {
        if entry.opensInPage {
            page.run("open", arg: path(entry))
            opened()
        } else if entry.canOpen(in: place) {
            // The app's editor reads this device's disk: never a machine's file.
            openFile(path(entry))
        }
    }

    private func newNotebook(in dir: URL) {
        page.run("new-notebook", arg: source.serverPath(dir))
        opened()
    }

    /// Copies the example notebooks into a new folder at the top and opens
    /// the first (#414).
    private func openExamples() {
        page.run("open-examples", arg: "")
        opened()
    }

    private func newFolder(in parent: URL) {
        let source = source
        exclusively { _ = try await source.newFolder(in: parent) }
    }

    private func rename(_ entry: FolderEntry, to input: String) {
        let name = input.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !name.contains("/") else { return }
        // The open notebook renames through the page, which saves its
        // edits first and keeps its kernel.
        if entry.isNotebook, page.state.path == path(entry) {
            page.run("rename", arg: name)
            return
        }
        let file = entry.isNotebook && !name.lowercased().hasSuffix(".ipynb") ? name + ".ipynb" : name
        guard file != entry.name else { return }
        if FolderEntry.path(page.state.path, isAt: path(entry)), page.state.dirty {
            failure = "Save the open notebook before renaming its folder."
            return
        }
        let source = source
        let from = path(entry)
        exclusively {
            let target = try await source.rename(entry.url, to: file)
            // Its row, and any inside it, is gone under the old name.
            dropSelection(at: entry)
            let to = source.serverPath(target)
            page.run("file-moved", arg: PageState.fileMoved(from: from, to: to))
            // From the page's path now, after the move returned.
            if let moved = FolderEntry.path(page.state.path, movedFrom: from, to: to) {
                page.run("open", arg: moved)
            }
        }
    }

    private func duplicate(_ entry: FolderEntry) {
        let source = source
        exclusively { _ = try await source.duplicate(entry.url) }
    }

    /// Deletes, after asking. The open notebook is closed after, or its
    /// next save would write it back.
    private func delete(_ entry: FolderEntry) {
        let source = source
        let from = path(entry)
        exclusively {
            try await source.delete(entry.url)
            dropSelection(at: entry)
            page.run("file-moved", arg: PageState.fileMoved(from: from, to: nil))
            // What the page shows now, not when the person confirmed.
            if FolderEntry.path(page.state.path, isAt: from) { page.run("close") }
        }
    }

    /// Runs one file operation at a time through the source, then lists the
    /// folders again; a failure shows in the alert. A call while one is
    /// running is ignored.
    private func exclusively(_ work: @escaping @MainActor () async throws -> Void) {
        guard canChange else {
            // The machine went offline while a dialog asked: say so, not nothing.
            if !busy, !reachable { failure = words(FileSourceError.server(status: 502, message: nil)) }
            return
        }
        busy = true
        Task {
            do {
                try await work()
                generation += 1
            } catch {
                failure = words(error)
            }
            busy = false
        }
    }
}

/// What the sidebar watches: the machine answering again, the Journals poll
/// and whether the list shows. A modifier of its own for the type checker.
private struct SidebarWatchers: ViewModifier {
    var reachable: Bool
    let relist: @MainActor () -> Void
    var pollID: String
    let poll: @MainActor () async -> Void
    @Binding var shown: Bool

    func body(content: Content) -> some View {
        content
            .onChange(of: reachable) { if reachable { relist() } }
            .task(id: pollID) { await poll() }
            .onAppear { shown = true }
            .onDisappear { shown = false }
    }
}

/// Adds the examples to the app's own folder once the page is ready
/// (#463), and lists the folder again in every window once they are.
/// A modifier of its own: the sidebar's chain is long for the type checker.
private struct AddsExamples: ViewModifier {
    var page: PageModel
    /// Only this device's page: the examples are copied to its folder.
    var enabled = true
    let copied: () -> Void

    func body(content: Content) -> some View {
        content
            .task(id: page.ready) {
                if enabled, page.ready { await AppModel.shared.addExamplesIfNeeded(page: page) }
            }
            .onChange(of: AppModel.shared.examplesCopied) { copied() }
    }
}

/// The iPhone's search field, in the navigation bar; the iPad's sidebar
/// has a Search tab instead.
private struct SidebarSearch: ViewModifier {
    let enabled: Bool
    @Binding var query: String

    func body(content: Content) -> some View {
        if enabled {
            content.searchable(text: $query, prompt: "Find files")
        } else {
            content
        }
    }
}

/// The bottom panel's terminals, in the Running tab (#251).
private struct IPadPanelTerminalRows: View {
    @Environment(AppModel.self) private var model
    var panel: PanelController
    let show: (PanelTerminal.ID) -> Void

    var body: some View {
        if !panel.terminals.isEmpty {
            Section("Terminals") {
                ForEach(panel.terminals) { terminal in
                    Button {
                        show(terminal.id)
                    } label: {
                        Label(model.title(for: terminal.target), systemImage: "terminal")
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .listRowBackground(
                        terminal.id == panel.selection && panel.isShown ? Color.accentColor.opacity(0.18) : nil
                    )
                    .swipeActions(allowsFullSwipe: false) {
                        Button("Close") { panel.close(terminal.id) }
                            .tint(.red)
                    }
                    .contextMenu {
                        Button(role: .destructive) { panel.close(terminal.id) } label: {
                            Label("Close Terminal", systemImage: "xmark")
                        }
                    }
                }
            }
        }
    }
}

/// What a sidebar row can do, handed down the tree.
struct IPadFolderActions {
    var openPath: String?
    /// Whether a notebook's kernel is running, by its server path.
    var isRunning: (String) -> Bool = { _ in false }
    /// Whether the items that change files are enabled: not while one runs
    /// or the machine is offline (#753).
    var canChange = true
    /// The machine doesn't answer: its listing errors are said once, by the
    /// sidebar's offline line.
    var offline = false
    var place: Place = .thisDevice
    var machineName: String?
    /// Whether a folder, by file URL, is expanded: the sidebar's one set.
    var isExpanded: (URL) -> Binding<Bool>
    /// A tap made this row the list's selection (#787).
    var select: (FolderEntry) -> Void
    /// A folder's contents were listed: the folder's URL as the contents
    /// were given it, and its rows (#791).
    var listed: ([FolderEntry], URL) -> Void
    var open: (FolderEntry) -> Void
    /// A tap opened the file: `open`, then the keyboard goes to the page (#791).
    var openByTap: (FolderEntry) -> Void
    var newNotebook: (URL) -> Void
    var newFolder: (URL) -> Void
    var rename: (FolderEntry) -> Void
    var duplicate: (FolderEntry) -> Void
    var delete: (FolderEntry) -> Void
}

/// One folder's items; subfolders list theirs when expanded.
private struct IPadFolderContents: View {
    let folder: URL
    let source: any FileSource
    let actions: IPadFolderActions
    let generation: Int
    @State private var entries: [FolderEntry] = []
    @State private var error: String?

    var body: some View {
        Group {
            ForEach(entries) { entry in
                if entry.isDirectory {
                    let isExpanded = actions.isExpanded(entry.url)
                    DisclosureGroup(isExpanded: isExpanded) {
                        IPadFolderContents(folder: entry.url, source: source, actions: actions, generation: generation)
                    } label: {
                        FolderRowLabel(name: entry.name, isExpanded: isExpanded, select: { actions.select(entry) })
                            .contextMenu { menu(for: entry) }
                            // The label's row is the folder's selectable
                            // row (#787).
                            .tag(entry)
                    }
                } else {
                    let canOpen = entry.canOpen(in: actions.place)
                    // Not a `Button`: in a list with a selection it can keep
                    // the tap from selecting the row (#787). A tap gesture
                    // alongside the list's own selects the row and opens it.
                    HStack {
                        Label(entry.title, systemImage: entry.isNotebook ? "book.pages" : "doc.text")
                        Spacer()
                        if entry.isNotebook, actions.isRunning(source.serverPath(entry.url)) {
                            // Its kernel is running.
                            Circle()
                                .fill(Color.green)
                                .frame(width: 6, height: 6)
                                .accessibilityLabel("Kernel running")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                    // Only a file that can't open here is dimmed: the rest keeps
                    // the list's own tint and selected-row colour.
                    .opacity(canOpen ? 1 : 0.5)
                    .simultaneousGesture(
                        TapGesture().onEnded {
                            actions.select(entry)
                            if canOpen { actions.openByTap(entry) }
                        }
                    )
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(canOpen ? .isButton : [])
                    .accessibilityHint(canOpen ? "" : "Can't open here")
                    .accessibilityAction { if canOpen { actions.open(entry) } }
                    .listRowBackground(
                        source.serverPath(entry.url) == actions.openPath
                            ? Color.accentColor.opacity(0.18) : nil
                    )
                    .contextMenu { menu(for: entry) }
                    .tag(entry)
                }
            }
            if let error {
                // The sidebar's offline line says it once for all folders.
                if !actions.offline {
                    Text(error).foregroundStyle(.secondary).font(.caption)
                }
            } else if entries.isEmpty {
                Text("No files").foregroundStyle(.secondary)
            }
        }
        .task(id: "\(folder.absoluteString)#\(generation)") { await load() }
    }

    /// Runs as the view's task: a newer folder or refresh cancels it, and
    /// a cancelled listing changes nothing.
    private func load() async {
        do {
            let listed = try await source.list(folder)
            guard !Task.isCancelled else { return }
            entries = listed
            error = nil
            actions.listed(listed, folder)
        } catch {
            guard !Task.isCancelled else { return }
            self.error = FileSourceError.message(error, place: actions.place, machineName: actions.machineName)
        }
    }

    @ViewBuilder
    private func menu(for entry: FolderEntry) -> some View {
        if entry.isDirectory {
            Button { actions.newNotebook(entry.url) } label: { Label("New Notebook Here", systemImage: "doc.badge.plus") }
                .disabled(actions.offline)
            Button { actions.newFolder(entry.url) } label: { Label("New Folder Here", systemImage: "folder.badge.plus") }
                .disabled(!actions.canChange)
        } else {
            Button { actions.open(entry) } label: { Label("Open", systemImage: "doc") }
                .disabled(!entry.canOpen(in: actions.place))
        }
        Group {
            Button { actions.rename(entry) } label: { Label("Rename…", systemImage: "pencil") }
            // A machine's contents API copies files, not folders.
            if actions.place.isThisDevice || !entry.isDirectory {
                Button { actions.duplicate(entry) } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
            }
            Divider()
            Button(role: .destructive) { actions.delete(entry) } label: { Label("Delete…", systemImage: "trash") }
        }
        .disabled(!actions.canChange)
    }
}

// MARK: - Toolbar

/// The open notebook's Markdown headings (#212), indented by level; a tap
/// selects the heading's cell and scrolls it to the top, as the Mac's
/// Outline tab does (#288). Rows for the iPad sidebar's list.
struct IPadOutlineRows: View {
    var page: PageModel
    /// After a heading is tapped: the notebook comes into view.
    var picked: () -> Void = {}

    var body: some View {
        let headings = page.state.headings
        // Indent from the outline's top level, not from `#`.
        let top = headings.map(\.level).min() ?? 1
        if headings.isEmpty {
            Text(page.state.hasNotebook ? "No headings in this notebook" : "No notebook open")
                .foregroundStyle(.secondary)
        } else {
            ForEach(Array(headings.enumerated()), id: \.offset) { _, heading in
                Button {
                    page.run("go-to-cell", arg: String(heading.cell))
                    picked()
                } label: {
                    Text(heading.text)
                        .fontWeight(heading.level == top ? .semibold : .regular)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .padding(.leading, CGFloat(max(0, heading.level - top)) * 16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(.primary)
            }
        }
    }
}

/// The iPhone's way to the outline (#288): a menu of the notebook's
/// headings in the bottom toolbar, indented by level.
struct PhoneOutlineMenu: View {
    var page: PageModel

    var body: some View {
        let headings = page.state.headings
        let top = headings.map(\.level).min() ?? 1
        Menu {
            ForEach(Array(headings.enumerated()), id: \.offset) { _, heading in
                Button {
                    page.run("go-to-cell", arg: String(heading.cell))
                } label: {
                    // Menus take no padding: indent with figure spaces.
                    Text(String(repeating: "\u{2007}\u{2007}", count: max(0, heading.level - top)) + heading.text)
                }
            }
        } label: {
            Label("Outline", systemImage: "list.bullet.indent")
        }
        .disabled(headings.isEmpty)
    }
}

/// The notebook's controls in the navigation bar: run and kernel controls
/// on their own, the rest in a menu.
struct IPadNotebookToolbar: ToolbarContent {
    var page: PageModel
    /// The scene's place (#758): where kernels run is this device's setting,
    /// not a machine's.
    var place: Place = .thisDevice
    /// In the bottom toolbar, in thumb reach: the iPhone (#209).
    var bottom = false
    /// Asks for the notebook's new name (#209).
    var rename: () -> Void = {}

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: bottom ? .bottomBar : .navigationBarTrailing) {
            Button { page.run("run") } label: { Label("Run", systemImage: "play.fill") }
                .disabled(!page.state.editsCells)
            Button { page.run("run-all") } label: { Label("Run All", systemImage: "forward.fill") }
                .disabled(!page.state.editsCells)
            Button { page.run("interrupt") } label: { Label("Interrupt", systemImage: "stop.fill") }
                .disabled(!page.state.isBusy)
            // Only while the notebook asks for something its grant doesn't give.
            if let wanted = page.state.accessWanted, !wanted.isEmpty {
                Button { page.run("notebook-access") } label: { Label("Notebook Access", systemImage: "lock.shield") }
                    .accessibilityHint("Asks for \(wanted.joined(separator: ", "))")
            }
            // The iPad has the sidebar's Outline tab.
            if bottom {
                PhoneOutlineMenu(page: page)
            }
            Menu {
                Button { page.run("insert-code") } label: { Label("Insert Code Cell", systemImage: "plus.rectangle") }
                Button { page.run("insert-markdown") } label: { Label("Insert Markdown Cell", systemImage: "text.badge.plus") }
                Picker("Cell Type", selection: cellType) {
                    Text("Code").tag("code")
                    Text("Markdown").tag("markdown")
                    Text("Raw").tag("raw")
                }
                Button { page.run("run-with-params") } label: {
                    Label("Run with Parameters…", systemImage: "slider.horizontal.3")
                }
                .disabled(page.state.runParams != true)
                Button { page.run("clear-outputs") } label: {
                    Label("Clear All Outputs", systemImage: "eraser")
                }
                // The journal view and back (#724).
                Button { page.run("toggle-journal") } label: {
                    Label(page.state.journalToggleTitle, systemImage: page.state.journalToggleSymbol)
                }
                Divider()
                Button { page.run("restart") } label: { Label("Restart Kernel", systemImage: "arrow.clockwise") }
                    .disabled(!page.state.hasKernel)
                Button { page.run("shutdown-others") } label: {
                    Label("Shut Down Other Kernels", systemImage: "power")
                }
                .disabled(page.state.otherSessions.isEmpty)
                Menu {
                    // Which kernel runs, from its own reply (#693).
                    if let version = page.state.kernelVersionLine {
                        Text(version)
                        Divider()
                    }
                    ForEach(page.state.kernels, id: \.name) { kernel in
                        Button {
                            page.run("change-kernel", arg: kernel.name)
                        } label: {
                            if kernel.name == page.state.kernel {
                                Label(kernel.pickerName, systemImage: "checkmark")
                            } else {
                                Text(kernel.pickerName)
                            }
                        }
                        .accessibilityLabel(kernel.pickerLabel)
                    }
                } label: {
                    Label(page.state.kernelDisplayName ?? "Kernel", systemImage: "cpu")
                }
                // Where every notebook's kernels run (#473): an advanced
                // choice, with the connected machines as places (#701).
                if place.allows(.kernelLocation), AppModel.shared.kernelLocations.hasRemotes {
                    Menu("Advanced") {
                        KernelLocationPicker(running: page.state.sessions.count)
                            .pickerStyle(.inline)
                    }
                }
                Divider()
                Button { page.run("save") } label: { Label("Save", systemImage: "square.and.arrow.down") }
                    .disabled(!page.state.dirty)
                Button(action: rename) { Label("Rename…", systemImage: "pencil") }
                Button { page.run("download") } label: { Label("Download", systemImage: "arrow.down.doc") }
                Menu {
                    Button("Markdown") { page.run("export", arg: "markdown") }
                    Button("Script") { page.run("export", arg: "script") }
                } label: {
                    Label("Export As", systemImage: "square.and.arrow.up.on.square")
                }
                .disabled(page.state.publish != true)
                Button { page.run("publish") } label: {
                    Label("Publish as Web Page…", systemImage: "globe")
                }
                .disabled(page.state.publish != true)
                Button { page.run("trust") } label: { Label("Trust Notebook", systemImage: "checkmark.shield") }
                    .disabled(page.state.trusted)
                Button { page.run("notebook-access") } label: {
                    Label("Notebook Access…", systemImage: "lock.shield")
                }
                .disabled(page.state.hostGrants != true)
                Divider()
                Button { page.run("show-shortcuts") } label: { Label("Keyboard Shortcuts", systemImage: "keyboard") }
                Button {
                    NotificationCenter.default.post(name: .showAppSettings, object: page)
                } label: {
                    Label("Settings", systemImage: "gearshape")
                }
            } label: {
                Label("More", systemImage: "ellipsis.circle")
            }
            .disabled(!page.state.hasNotebook)
        }
    }

    private var cellType: Binding<String> {
        Binding(
            get: { page.state.cellType ?? "code" },
            set: { page.run("cell-type", arg: $0) }
        )
    }
}

// MARK: - Key commands

/// The iPad's menu commands, which holding ⌘ lists and the iPadOS menu
/// bar shows. They act on the focused scene's page. As on the Mac, keys
/// the page handles itself (⇧↩ to run, A and B to insert) are not key
/// equivalents, which would also fire while typing; so Run, Restart and
/// Insert are in the menu bar (iPadOS 26) but not the ⌘ overlay.
struct IPadCommands: Commands {
    var body: some Commands {
        // Show/Hide Sidebar (⌃⌘S).
        SidebarCommands()
        CommandGroup(after: .sidebar) {
            IPadPanelButton()
            CodeFontSizeCommands()
        }
        CommandGroup(replacing: .newItem) { IPadNewNotebook() }
        CommandGroup(replacing: .saveItem) { IPadPageButton("Save", "save", key: "s") }
        CommandMenu("Cell") {
            IPadPageButton("Run Cell", "run")
            IPadPageButton("Run All Cells", "run-all", key: .return, modifiers: [.command, .shift])
            IPadPageButton("Run with Parameters…", "run-with-params") { $0.hasNotebook && $0.runParams == true }
            IPadPageButton("Clear All Outputs", "clear-outputs")
            IPadPageButton("Insert Cell Below", "insert-below")
            IPadPageButton("Insert Markdown Cell Below", "insert-markdown")
            IPadPageButton("Collapse All Code", "collapse-all-code")
            IPadPageButton("Expand All Code", "expand-all-code")
            IPadPageButton("Go to Definition", "go-to-definition")
            IPadPageButton("Rename Symbol…", "rename-symbol")
            IPadPageButton("Find…", "find", key: "f")
        }
        CommandMenu("Kernel") {
            IPadPageButton("Interrupt", "interrupt", key: ".")
            IPadPageButton("Restart", "restart")
            IPadPageButton("Shut Down Other Kernels", "shutdown-others") { !$0.otherSessions.isEmpty }
        }
        // The iPadOS 26 menu bar's Help menu (#409).
        CommandGroup(replacing: .help) { HelpLinkCommands() }
    }
}

/// The front scene's bottom panel (#251): whether it shows, and how to
/// show or hide it.
struct IPadPanelToggle {
    var shown: Bool
    var toggle: () -> Void
}

private struct IPadPanelKey: FocusedValueKey {
    typealias Value = IPadPanelToggle
}

extension FocusedValues {
    var iPadPanel: IPadPanelToggle? {
        get { self[IPadPanelKey.self] }
        set { self[IPadPanelKey.self] = newValue }
    }
}

/// View › Show/Hide Terminal Panel (⌃`), as on the Mac.
private struct IPadPanelButton: View {
    @FocusedValue(\.iPadPanel) private var panel

    var body: some View {
        Button(panel?.shown == true ? "Hide Terminal Panel" : "Show Terminal Panel") { panel?.toggle() }
            .keyboardShortcut("`", modifiers: [.control])
            .disabled(panel == nil)
    }
}

/// File › New Notebook (⌘N) and Open Example Notebooks, in the notebook
/// folder's top level. A machine's scene (#758) has the notebook only, as
/// the Mac's machine windows: the console and the examples are this
/// device's.
private struct IPadNewNotebook: View {
    @FocusedValue(\.pageModel) private var page
    @FocusedValue(\.iPadPlace) private var place

    var body: some View {
        let local = place?.isThisDevice ?? true
        Button("New Notebook") { page?.run("new-notebook", arg: "") }
            .keyboardShortcut("n")
            .disabled(page == nil)
        // A DuckDB prompt in the page, for the notebook folder (#679).
        Button("New DuckDB Console") { page?.run("new-duckdb-console", arg: "") }
            .disabled(page == nil || !local)
        // A copy of the example notebooks in a new folder (#414).
        Button("Open Example Notebooks") { page?.run("open-examples", arg: "") }
            .disabled(page == nil || !local)
    }
}

/// A menu item that runs a page command.
private struct IPadPageButton: View {
    let title: String
    let id: String
    var key: KeyEquivalent?
    var modifiers: EventModifiers = .command
    /// When it can run; by default, while a notebook is open.
    var enabled: (PageState) -> Bool
    @FocusedValue(\.pageModel) private var page

    init(
        _ title: String, _ id: String, key: KeyEquivalent? = nil, modifiers: EventModifiers = .command,
        enabled: @escaping (PageState) -> Bool = { $0.hasNotebook }
    ) {
        self.title = title
        self.id = id
        self.key = key
        self.modifiers = modifiers
        self.enabled = enabled
    }

    var body: some View {
        let button = Button(title) { page?.run(id) }
            .disabled(!(page.map { enabled($0.state) } ?? false))
        if let key {
            button.keyboardShortcut(key, modifiers: modifiers)
        } else {
            button
        }
    }
}
#endif
