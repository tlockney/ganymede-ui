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
/// server is rooted.
struct IPadSidebar: View {
    let folder: URL
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

    var body: some View {
        List {
            if tabbed {
                navigator
            } else {
                if query.trimmingCharacters(in: .whitespaces).isEmpty {
                    recentsSection
                    filesSection
                } else {
                    searchResults
                }
                runningSection
            }
        }
        .listStyle(.sidebar)
        .navigationTitle(tabbed ? tab.title : "Notebooks")
        // The iPad's navigator tabs, as on the Mac (#251).
        .safeAreaInset(edge: .top, spacing: 0) {
            if tabbed { tabStrip }
        }
        // The page searches (`src/lib/search.ts`), after typing pauses. The
        // iPad's Search tab has a field of its own.
        .modifier(SidebarSearch(enabled: !tabbed, query: $query))
        .onChange(of: query) { search() }
        .onChange(of: searchContents) { search() }
        // A reloaded page has no search, and a keystroke before the page
        // was ready went nowhere: ask again, or it says Searching… for good.
        .onChange(of: page.state.search == nil && page.state.backend != nil) { _, lost in
            if lost, !query.trimmingCharacters(in: .whitespaces).isEmpty { search() }
        }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button { newNotebook(in: folder) } label: { Label("New Notebook", systemImage: "doc.badge.plus") }
                    Button { newFolder(in: folder) } label: { Label("New Folder", systemImage: "folder.badge.plus") }
                    // The iPhone has no File menu or welcome screen: the
                    // examples are here (#414).
                    Button { openExamples() } label: { Label("Open Example Notebooks", systemImage: "book") }
                        .disabled(page.state.backend == nil)
                } label: {
                    Label("New", systemImage: "plus")
                }
            }
        }
        .refreshable { generation += 1 }
        // The examples show in the app's own folder from the start (#463).
        .modifier(AddsExamples(page: page) { generation += 1 })
        .onChange(of: page.state.path) { generation += 1 }
        .onChange(of: phase) { _, phase in
            if phase == .active { generation += 1 }
        }
        .alert("Rename", isPresented: renamingShown, presenting: renaming) { entry in
            TextField("Name", text: $newName)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Rename") { rename(entry, to: newName) }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog(
            deletingTitle, isPresented: deletingShown, titleVisibility: .visible, presenting: deleting
        ) { entry in
            Button("Delete", role: .destructive) { delete(entry) }
        } message: { _ in
            Text("This can't be undone.")
        }
        .alert("Couldn't do that", isPresented: failureShown, presenting: failure) { _ in
            Button("OK", role: .cancel) {}
        } message: { Text($0) }
    }

    // MARK: Navigator tabs (#251)

    /// The tabs over the iPad's sidebar, as the Mac's: ⌘1 to ⌘5 with a
    /// keyboard.
    private var tabStrip: some View {
        HStack(spacing: 0) {
            ForEach(NavigatorTab.allCases) { item in
                Button {
                    tab = item
                } label: {
                    Image(systemName: item.symbol)
                        .symbolVariant(tab == item ? .fill : .none)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(tab == item ? Color.accentColor : Color.secondary)
                .accessibilityLabel(item.title)
                .accessibilityAddTraits(tab == item ? .isSelected : [])
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

    /// Kernels and the panel's terminals.
    private var runningCount: Int {
        page.state.sessions.count + panel.terminals.count
    }

    /// The selected tab's list.
    @ViewBuilder
    private var navigator: some View {
        switch tab {
        case .files:
            filesSection
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
            IPadPanelTerminalRows(panel: panel, show: showTerminal)
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

    /// The folder as a tree.
    private var filesSection: some View {
        Section(folder.lastPathComponent) {
            IPadFolderContents(folder: folder, root: folder, actions: actions, generation: generation)
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
                    .disabled(!search.opens(match))
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
        if match.isNotebook {
            page.run("open", arg: match.path)
            opened()
        } else if page.state.search?.opens(match) == true {
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
            open: open,
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

    private var deletingTitle: String {
        guard let deleting else { return "" }
        return "Delete “\(deleting.isNotebook ? deleting.title : deleting.name)”?"
    }

    private func path(_ entry: FolderEntry) -> String {
        FolderEntry.serverPath(entry.url, root: folder)
    }

    private func open(_ entry: FolderEntry) {
        if entry.isNotebook {
            page.run("open", arg: path(entry))
            opened()
        } else {
            openFile(path(entry))
        }
    }

    private func newNotebook(in dir: URL) {
        page.run("new-notebook", arg: FolderEntry.serverPath(dir, root: folder))
        opened()
    }

    /// Copies the example notebooks into a new folder at the top and opens
    /// the first (#414).
    private func openExamples() {
        page.run("open-examples", arg: "")
        opened()
    }

    private func newFolder(in parent: URL) {
        let fm = FileManager.default
        var url = parent.appendingPathComponent("untitled folder")
        var n = 2
        while fm.fileExists(atPath: url.path) {
            url = parent.appendingPathComponent("untitled folder \(n)")
            n += 1
        }
        attempt { try fm.createDirectory(at: url, withIntermediateDirectories: false) }
    }

    private func rename(_ entry: FolderEntry, to input: String) {
        let name = input.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, !name.contains("/") else { return }
        // The open notebook renames through the page, which saves its
        // edits first and keeps its kernel.
        if !entry.isDirectory, page.state.path == path(entry) {
            page.run("rename", arg: name)
            return
        }
        let file = entry.isNotebook && !name.lowercased().hasSuffix(".ipynb") ? name + ".ipynb" : name
        guard file != entry.name else { return }
        if FolderEntry.path(page.state.path, isAt: path(entry)), page.state.dirty {
            failure = "Save the open notebook before renaming its folder."
            return
        }
        let target = entry.url.deletingLastPathComponent().appendingPathComponent(file)
        attempt {
            try FileManager.default.moveItem(at: entry.url, to: target)
            page.run("file-moved", arg: PageState.fileMoved(
                from: path(entry), to: FolderEntry.serverPath(target, root: folder)))
            if let moved = FolderEntry.path(
                page.state.path, movedFrom: path(entry), to: FolderEntry.serverPath(target, root: folder)
            ) {
                page.run("open", arg: moved)
            }
        }
    }

    private func duplicate(_ entry: FolderEntry) {
        let fm = FileManager.default
        let target = FolderEntry.duplicateURL(for: entry.url) { fm.fileExists(atPath: $0.path) }
        attempt { try fm.copyItem(at: entry.url, to: target) }
    }

    /// Deletes, after asking. The open notebook is closed first, or its
    /// next save would write it back.
    private func delete(_ entry: FolderEntry) {
        let holdsOpen = FolderEntry.path(page.state.path, isAt: path(entry))
        attempt {
            try FileManager.default.removeItem(at: entry.url)
            page.run("file-moved", arg: PageState.fileMoved(from: path(entry), to: nil))
            if holdsOpen { page.run("close") }
        }
    }

    private func attempt(_ body: () throws -> Void) {
        do {
            try body()
            generation += 1
        } catch {
            failure = error.localizedDescription
        }
    }
}

/// Adds the examples to the app's own folder once the page is ready
/// (#463), and lists the folder again in every window once they are.
/// A modifier of its own: the sidebar's chain is long for the type checker.
private struct AddsExamples: ViewModifier {
    var page: PageModel
    let copied: () -> Void

    func body(content: Content) -> some View {
        content
            .task(id: page.ready) {
                if page.ready { await AppModel.shared.addExamplesIfNeeded(page: page) }
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
    var open: (FolderEntry) -> Void
    var newNotebook: (URL) -> Void
    var newFolder: (URL) -> Void
    var rename: (FolderEntry) -> Void
    var duplicate: (FolderEntry) -> Void
    var delete: (FolderEntry) -> Void
}

/// One folder's items; subfolders list theirs when expanded.
private struct IPadFolderContents: View {
    let folder: URL
    let root: URL
    let actions: IPadFolderActions
    let generation: Int
    @State private var entries: [FolderEntry] = []
    @State private var error: String?

    var body: some View {
        Group {
            ForEach(entries) { entry in
                if entry.isDirectory {
                    DisclosureGroup {
                        IPadFolderContents(folder: entry.url, root: root, actions: actions, generation: generation)
                    } label: {
                        Label(entry.name, systemImage: "folder")
                            .contextMenu { menu(for: entry) }
                    }
                } else {
                    Button {
                        actions.open(entry)
                    } label: {
                        HStack {
                            Label(entry.title, systemImage: entry.isNotebook ? "book.pages" : "doc.text")
                            Spacer()
                            if entry.isNotebook, actions.isRunning(FolderEntry.serverPath(entry.url, root: root)) {
                                // Its kernel is running.
                                Circle()
                                    .fill(Color.green)
                                    .frame(width: 6, height: 6)
                                    .accessibilityLabel("Kernel running")
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                    }
                    .listRowBackground(
                        FolderEntry.serverPath(entry.url, root: root) == actions.openPath
                            ? Color.accentColor.opacity(0.18) : nil
                    )
                    .contextMenu { menu(for: entry) }
                }
            }
            if let error {
                Text(error).foregroundStyle(.secondary).font(.caption)
            } else if entries.isEmpty {
                Text("No files").foregroundStyle(.secondary)
            }
        }
        .task(id: "\(folder.path)#\(generation)") { load() }
    }

    private func load() {
        do {
            entries = try FolderEntry.list(folder)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    @ViewBuilder
    private func menu(for entry: FolderEntry) -> some View {
        if entry.isDirectory {
            Button { actions.newNotebook(entry.url) } label: { Label("New Notebook Here", systemImage: "doc.badge.plus") }
            Button { actions.newFolder(entry.url) } label: { Label("New Folder Here", systemImage: "folder.badge.plus") }
        } else {
            Button { actions.open(entry) } label: { Label("Open", systemImage: "doc") }
        }
        Button { actions.rename(entry) } label: { Label("Rename…", systemImage: "pencil") }
        Button { actions.duplicate(entry) } label: { Label("Duplicate", systemImage: "plus.square.on.square") }
        Divider()
        Button(role: .destructive) { actions.delete(entry) } label: { Label("Delete…", systemImage: "trash") }
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
    /// In the bottom toolbar, in thumb reach: the iPhone (#209).
    var bottom = false
    /// Asks for the notebook's new name (#209).
    var rename: () -> Void = {}

    var body: some ToolbarContent {
        ToolbarItemGroup(placement: bottom ? .bottomBar : .navigationBarTrailing) {
            Button { page.run("run") } label: { Label("Run", systemImage: "play.fill") }
                .disabled(!page.state.hasNotebook)
            Button { page.run("run-all") } label: { Label("Run All", systemImage: "forward.fill") }
                .disabled(!page.state.hasNotebook)
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
                Divider()
                Button { page.run("restart") } label: { Label("Restart Kernel", systemImage: "arrow.clockwise") }
                    .disabled(!page.state.hasKernel)
                Button { page.run("shutdown-others") } label: {
                    Label("Shut Down Other Kernels", systemImage: "power")
                }
                .disabled(page.state.otherSessions.isEmpty)
                Menu {
                    ForEach(page.state.kernels, id: \.name) { kernel in
                        Button {
                            page.run("change-kernel", arg: kernel.name)
                        } label: {
                            if kernel.name == page.state.kernel {
                                Label(kernel.displayName, systemImage: "checkmark")
                            } else {
                                Text(kernel.displayName)
                            }
                        }
                    }
                } label: {
                    Label(page.state.kernelDisplayName ?? "Kernel", systemImage: "cpu")
                }
                // Where every notebook's kernels run (#473).
                if AppModel.shared.kernelLocations.hasRemotes {
                    KernelLocationPicker(running: page.state.sessions.count)
                }
                Divider()
                Button { page.run("save") } label: { Label("Save", systemImage: "square.and.arrow.down") }
                    .disabled(!page.state.dirty)
                Button(action: rename) { Label("Rename…", systemImage: "pencil") }
                Button { page.run("download") } label: { Label("Download", systemImage: "arrow.down.doc") }
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
            IPadPageButton("Insert Cell Below", "insert-below")
            IPadPageButton("Insert Markdown Cell Below", "insert-markdown")
            IPadPageButton("Collapse All Code", "collapse-all-code")
            IPadPageButton("Expand All Code", "expand-all-code")
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
/// folder's top level.
private struct IPadNewNotebook: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Button("New Notebook") { page?.run("new-notebook", arg: "") }
            .keyboardShortcut("n")
            .disabled(page == nil)
        // A copy of the example notebooks in a new folder (#414).
        Button("Open Example Notebooks") { page?.run("open-examples", arg: "") }
            .disabled(page == nil)
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
