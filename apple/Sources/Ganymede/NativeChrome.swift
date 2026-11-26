#if os(macOS)
import AppKit
import SwiftUI

// The Mac window's own sidebar, toolbar and menus (#206, #207). The page
// shows only the notebook (`chrome=native`); these read what it shows from
// `PageModel.state` and run its commands with `PageModel.run`.

// MARK: - Sidebar

/// The window's folder as a tree: notebooks open in this window, other
/// files in the app's editor.
struct FolderSidebar: View {
    let folder: URL
    /// Where the files are: this Mac's disk, for now (#737).
    var source: any FileSource = LocalFileSource()
    /// The window's place: a machine's items can't be revealed in the
    /// Finder, which lists this Mac's disk, but the text editor opens them
    /// through the app's mount (#740, #855).
    var place: Place = .thisDevice
    /// The machine's name for words about it, when the window is a machine's.
    var machineName: String?
    var page: PageModel
    let openFile: (String) -> Void
    @Environment(\.openWindow) private var openWindow
    /// Bumped to list the folders again after a change made here.
    @State private var generation = 0
    /// The expanded folders, kept per window across launches and while
    /// another navigator tab shows (#207).
    @SceneStorage("files.expanded") private var expanded = ""
    /// A file operation is running: the menu items that change files wait,
    /// so two quick ones can't take the same name.
    @State private var busy = false
    /// The selected row, which Up and Down move and Return, Right and Left
    /// act on (#787). Only files and folders are selectable.
    @State private var selection: FolderEntry?
    /// The rows listed so far, by folder: Left finds a row's parent here,
    /// and a reload that drops the selected row clears it (#791).
    @State private var tree = SidebarTree()

    /// Whether the window's machine answers (always true for this device).
    private var reachable: Bool { PlaceReachability.shared.isReachable(place) }

    var body: some View {
        List(selection: $selection) {
            if !reachable {
                Text(machineName.map { "“\($0)” is offline. Reconnecting…" } ?? "The machine is offline. Reconnecting…")
                    .foregroundStyle(.secondary).font(.caption)
            }
            Section(folder.lastPathComponent.isEmpty ? (place.isMachine ? "/" : folder.path) : folder.lastPathComponent) {
                FolderContents(folder: folder, source: source, actions: actions, generation: generation)
            }
        }
        .listStyle(.sidebar)
        .modifier(SidebarKeys(
            selection: selection,
            isExpanded: { actions.isExpanded($0.url).wrappedValue },
            setExpanded: { actions.isExpanded($0.url).wrappedValue = $1 },
            canOpen: { $0.canOpen(in: place) },
            open: open,
            parent: { tree.parent(of: $0, root: folder) },
            select: { selection = $0 }
        ))
        .contextMenu {
            Button("New Notebook") { page.run("new-notebook", arg: source.serverPath(folder)) }
                .disabled(!reachable)
            Button("New Folder") { newFolder(in: folder) }
                .disabled(!canChange)
        }
        // The machine answers again: list everything again.
        .onChange(of: reachable) { if reachable { generation += 1 } }
        // Another folder in this window: the old one's rows are gone.
        .onChange(of: folder) {
            selection = nil
            tree = SidebarTree()
        }
        // A notebook made or saved by the page shows up, and so do changes
        // made outside the app when it comes back to the front.
        .onChange(of: page.state.path) { old, _ in
            generation += 1
            // The page renamed or moved the open notebook: the row
            // selected under its old path is gone.
            if let old, let selected = selection, FolderEntry.path(selected.serverPath, isAt: old) { selection = nil }
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            generation += 1
        }
    }

    private var canChange: Bool { FileChanges.allowed(place: place, reachable: reachable, busy: busy) }

    /// A file operation's error, in words for a machine's window.
    private func show(_ error: Error) {
        guard place.isMachine else {
            NSAlert(error: error).runModal()
            return
        }
        let alert = NSAlert()
        alert.messageText = FileSourceError.message(error, place: place, machineName: machineName)
        alert.runModal()
    }

    private var actions: FolderActions {
        FolderActions(
            openPath: page.state.path,
            isRunning: { page.state.isRunning($0) },
            isExpanded: { url in
                // A path for this device (as stored before), the whole URL
                // for a machine's.
                let key = FolderEntry.storageKey(url)
                return Binding(
                    get: { FolderEntry.expandedPaths(expanded).contains(key) },
                    set: { expanded = FolderEntry.expandedPaths(expanded, setting: key, to: $0) }
                )
            },
            select: { selection = $0 },
            listed: listed(_:in:),
            open: open,
            openByClick: { entry in
                open(entry)
                // The click left the list the keyboard; a notebook it
                // opened should have it, so Down and Return go to the page.
                if entry.opensInPage {
                    DispatchQueue.main.async {
                        if let window = NSApp.keyWindow { returnKeyboardToPage(in: window) }
                    }
                }
            },
            openInNewTab: { entry in
                if let target = WindowTarget(opening: entry) { openWindow(value: target) }
            },
            newNotebook: { page.run("new-notebook", arg: source.serverPath($0)) },
            newFolder: newFolder(in:),
            reveal: { NSWorkspace.shared.activateFileViewerSelecting([$0.url]) },
            rename: rename,
            duplicate: duplicate,
            trash: trash,
            place: place,
            canChange: canChange,
            offline: !reachable,
            machineName: machineName
        )
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

    private func open(_ entry: FolderEntry) {
        if entry.opensInPage {
            page.run("open", arg: entry.serverPath)
        } else if entry.canOpen(in: place) {
            openFile(entry.serverPath)
        }
    }

    /// Runs one file operation at a time.
    private func exclusively(_ work: @escaping @MainActor () async -> Void) {
        guard canChange else {
            // The machine went offline while a dialog asked: say so, not nothing.
            if !busy, !reachable { show(FileSourceError.server(status: 502, message: nil)) }
            return
        }
        busy = true
        Task {
            await work()
            busy = false
        }
    }

    private func newFolder(in parent: URL) {
        exclusively {
            do {
                _ = try await source.newFolder(in: parent)
                generation += 1
            } catch {
                show(error)
            }
        }
    }

    private func rename(_ entry: FolderEntry) {
        // The open notebook renames through the page, which saves its
        // edits first and keeps its kernel.
        if entry.isNotebook, page.state.path == entry.serverPath {
            if let name = askName(for: entry.name) { page.run("rename", arg: name) }
            return
        }
        let holdsOpen = FolderEntry.path(page.state.path, isAt: entry.serverPath)
        // The page would save its edits back to the old path.
        if holdsOpen && page.state.dirty {
            let alert = NSAlert()
            alert.messageText = "Save “\(entry.title)” before renaming its folder."
            alert.informativeText = "The open notebook has unsaved changes."
            alert.runModal()
            return
        }
        guard let name = askName(for: entry.name), name != entry.name, !name.contains("/") else { return }
        exclusively {
            do {
                let target = try await source.rename(entry.url, to: name)
                generation += 1
                // Its row, and any inside it, is gone under the old name.
                dropSelection(at: entry)
                // From the page's path now, after the move returned.
                if let moved = FolderEntry.path(
                    page.state.path, movedFrom: entry.serverPath, to: source.serverPath(target)
                ) {
                    page.run("open", arg: moved)
                }
            } catch {
                show(error)
            }
        }
    }

    private func duplicate(_ entry: FolderEntry) {
        exclusively {
            do {
                _ = try await source.duplicate(entry.url)
                generation += 1
            } catch {
                show(error)
            }
        }
    }

    private func trash(_ entry: FolderEntry) {
        // The page would write the notebook back on its next save, so it
        // closes it, after asking. A machine deletes for good: always ask.
        let holdsOpen = FolderEntry.path(page.state.path, isAt: entry.serverPath)
        let action = RemoveAction(place: place)
        if let question = action.question(for: entry, holdsOpen: holdsOpen, dirty: page.state.dirty) {
            let alert = NSAlert()
            alert.messageText = question.message
            alert.informativeText = question.detail
            alert.addButton(withTitle: action.buttonTitle)
            alert.addButton(withTitle: "Cancel")
            if action.alwaysAsks { alert.alertStyle = .warning }
            guard alert.runModal() == .alertFirstButtonReturn else { return }
        }
        exclusively {
            do {
                try await source.delete(entry.url)
                generation += 1
                dropSelection(at: entry)
                // What the page shows now, not when the person confirmed.
                if FolderEntry.path(page.state.path, isAt: entry.serverPath) { page.run("close") }
            } catch {
                show(error)
            }
        }
    }
}

/// What a sidebar row can do, handed down the tree.
struct FolderActions {
    var openPath: String?
    /// Whether a notebook, by server path, has a running kernel (#225).
    var isRunning: (String) -> Bool
    /// Whether a folder, by file URL, is expanded.
    var isExpanded: (URL) -> Binding<Bool>
    /// A click made this row the list's selection (#787).
    var select: (FolderEntry) -> Void
    /// A folder's contents were listed: the folder's URL as the contents
    /// were given it, and its rows (#791).
    var listed: ([FolderEntry], URL) -> Void
    var open: (FolderEntry) -> Void
    /// A click opened the file: `open`, then the keyboard goes back to the page.
    var openByClick: (FolderEntry) -> Void
    var openInNewTab: (FolderEntry) -> Void
    var newNotebook: (URL) -> Void
    var newFolder: (URL) -> Void
    var reveal: (FolderEntry) -> Void
    var rename: (FolderEntry) -> Void
    var duplicate: (FolderEntry) -> Void
    var trash: (FolderEntry) -> Void
    var place: Place = .thisDevice
    /// Whether the menu items that change files are enabled: not while a
    /// file operation runs or the machine is offline (#753).
    var canChange = true
    /// The window's machine doesn't answer.
    var offline = false
    var machineName: String?
}

/// One folder's items; a subfolder lists its own when it is expanded.
private struct FolderContents: View {
    let folder: URL
    let source: any FileSource
    let actions: FolderActions
    let generation: Int
    @State private var entries: [FolderEntry] = []
    @State private var error: String?

    var body: some View {
        Group {
            ForEach(entries) { entry in
                if entry.isDirectory {
                    let isExpanded = actions.isExpanded(entry.url)
                    DisclosureGroup(isExpanded: isExpanded) {
                        FolderContents(folder: entry.url, source: source, actions: actions, generation: generation)
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
                    // the click from selecting the row (#787). A tap gesture
                    // alongside the list's own selects the row and opens it.
                    HStack {
                        Label(entry.title, systemImage: entry.isNotebook ? "book.pages" : "doc.text")
                        Spacer()
                        if entry.isNotebook, actions.isRunning(entry.serverPath) {
                            // Its kernel is running.
                            Circle()
                                .fill(Color("Ready"))
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
                            if canOpen { actions.openByClick(entry) }
                        }
                    )
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(canOpen ? .isButton : [])
                    .accessibilityHint(canOpen ? "" : "Can't open here")
                    .accessibilityAction { if canOpen { actions.open(entry) } }
                    .padding(.vertical, 1)
                    .listRowBackground(
                        entry.serverPath == actions.openPath
                            ? Color.accentColor.opacity(0.18) : Color.clear
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
            Button("Open in New Tab") { actions.openInNewTab(entry) }
            Button("New Notebook Here") { actions.newNotebook(entry.url) }
                .disabled(actions.offline)
            Button("New Folder Here") { actions.newFolder(entry.url) }
                .disabled(!actions.canChange)
        } else {
            Button("Open") { actions.open(entry) }
                .disabled(!entry.canOpen(in: actions.place))
            if entry.isNotebook {
                Button("Open in New Tab") { actions.openInNewTab(entry) }
            }
        }
        Divider()
        Button("Rename…") { actions.rename(entry) }
            .disabled(!actions.canChange)
        // A machine's contents API copies files, not folders.
        if actions.place.isThisDevice || !entry.isDirectory {
            Button("Duplicate") { actions.duplicate(entry) }
                .disabled(!actions.canChange)
        }
        if actions.place.isThisDevice {
            Button("Show in Finder") { actions.reveal(entry) }
        }
        Divider()
        Button(RemoveAction(place: actions.place).menuTitle) { actions.trash(entry) }
            .disabled(!actions.canChange)
    }
}

/// Kernels that keep running when their notebook is closed or another is
/// opened, to find and shut down (#225): the navigator's Running tab (#246).
struct RunningList: View {
    var page: PageModel
    /// Terminals in any window (#246).
    var terminals = OpenTerminals.shared

    var body: some View {
        List {
            Section("Kernels") {
                ForEach(page.state.sessions) { session in
                    KernelRow(session: session, page: page)
                }
                if page.state.sessions.isEmpty {
                    Text("No kernels running").foregroundStyle(.secondary)
                }
            }
            Section("Terminals") {
                ForEach(terminals.entries) { terminal in
                    Button(action: terminal.reveal) {
                        HStack {
                            Label(terminal.title, systemImage: "terminal")
                                .lineLimit(1)
                            Spacer()
                            Text(terminal.inPanel ? "Panel" : "Tab")
                                .foregroundStyle(.secondary).font(.caption)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .help(terminal.title)
                    .contextMenu {
                        Button("Show", action: terminal.reveal)
                        Divider()
                        Button("Close Terminal", action: terminal.close)
                    }
                }
                if terminals.entries.isEmpty {
                    Text("No terminals open").foregroundStyle(.secondary)
                }
            }
        }
        .listStyle(.sidebar)
        // The page asks the server for each kernel's memory only while
        // the list shows (#241).
        .onAppear { page.watchMemory(true) }
        .onDisappear { page.watchMemory(false) }
    }
}

/// A running kernel in the Running list: its notebook, kernel and memory.
private struct KernelRow: View {
    let session: PageState.Session
    var page: PageModel

    var body: some View {
        Button {
            page.run("open", arg: session.path)
        } label: {
            HStack {
                Label(session.title, systemImage: "bolt.fill")
                Spacer()
                if let kernel = session.kernel {
                    Text(kernel).foregroundStyle(.secondary).font(.caption)
                }
                if let memory = session.memoryLabel {
                    Text(memory)
                        .foregroundStyle(.secondary)
                        .font(.caption.monospacedDigit())
                        .help("Kernel memory")
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .help(helpText)
        .contextMenu {
            Button("Open") { page.run("open", arg: session.path) }
            Divider()
            Button("Shut Down Kernel") { page.run("shutdown-kernel", arg: session.id) }
        }
    }

    /// The path, the kernel's state and its memory.
    private var helpText: String {
        var parts = [session.path]
        if let state = session.state { parts.append(PageState.statusLabel(state)) }
        if let memory = session.memoryLabel { parts.append(memory) }
        return parts.joined(separator: " · ")
    }
}

/// The foot of the navigator sidebar (#246): where kernels run, and how
/// many kernels and terminals there are. A menu: open a terminal on a
/// remote, manage remotes. Where kernels run (#473) is an advanced choice
/// in the kernel menu now (#701); connected machines are places instead.
struct ServerLine: View {
    var page: PageModel
    /// The window's bottom panel, for terminals on remotes.
    var panel: PanelController?
    /// A connected machine's name, for its window (#740): the kernels run
    /// there, not where this device's setting says.
    var machineName: String?
    var model = AppModel.shared
    var terminals = OpenTerminals.shared

    var body: some View {
        let locations = model.kernelLocations
        let location = machineName ?? locations.title
        Menu {
            let remotes = model.remotes.filter { $0.hasServer || $0.ssh != nil }
            if let panel, !remotes.isEmpty {
                Section("New Terminal On") {
                    ForEach(remotes) { remote in
                        if remote.ssh != nil {
                            Button("\(remote.title) (SSH)") { panel.add(.ssh(remote.id)) }
                        }
                        if remote.hasServer {
                            Button("\(remote.title) (Server)") { panel.add(.server(remote.id)) }
                        }
                    }
                }
            }
            Divider()
            Button(locations.hasRemotes ? "Manage Remotes…" : "Add a Remote…") {
                SettingsOpener.show(.remotes)
            }
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .fill(page.state.backend == nil ? Color.secondary : Color("Ready"))
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
                Image(systemName: machineName == nil && locations.selected == nil ? "laptopcomputer" : "server.rack")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Text(location)
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Spacer(minLength: 4)
                Text(OpenTerminals.summary(kernels: page.state.sessions.count, terminals: terminals.entries.count))
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            .font(.caption)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .menuStyle(.button)
        .buttonStyle(.plain)
        .menuIndicator(.hidden)
        .help(helpText(locations))
        .accessibilityLabel("Kernels run on \(location)")
    }

    private func helpText(_ locations: KernelLocations) -> String {
        var text = "Kernels run on \(machineName ?? locations.title)."
        if page.state.backend == nil { text += " Not connected." }
        return text + (machineName == nil ? " Click to open a terminal on a remote." : "")
    }
}

// MARK: - Toolbar

/// The notebook's controls, in the window's toolbar (#812). Not customizable:
/// a customizable toolbar (`.toolbar(id:)`) joins every window's toolbar
/// into one AppKit family, and AppKit threw while syncing a new window's
/// items into the others when a notebook opened from the Finder (#226).
///
/// In a fixed order, so no control moves under the pointer: the kernel's
/// chip, beside the title (its dot, the kernel's name, where it runs and
/// what it is doing; its popover has the file and the kernels to change
/// to); Trust and Notebook Access, which are there only while they apply;
/// Notebook | Journal, there while a notebook is open (#819); Run Cell with
/// its run menu and Interrupt, in one group, always there and enabled while
/// the kernel is busy; Share; and More. That is seven items, under the ten
/// a ToolbarContentBuilder takes. New Notebook is File > New Notebook
/// (⌘N), not a toolbar button (#867).
struct NotebookToolbar: ToolbarContent {
    var page: PageModel
    /// Saved as File > Save saves it, and enabled when that is.
    var document: PageDocument
    /// The window's bottom panel, for the kernel popover's Kernel Log.
    var panel: PanelController?
    /// The window's place: a machine's kernel popover has no Runs On.
    var place: Place = .thisDevice
    /// The status line the window's subtitle shows, for the popover.
    var header: HeaderStatus?
    /// The notebook's title, which the toolbar draws in place of the
    /// system's (#867); nil for a console or a folder, which keep the
    /// system's title.
    var title: String?

    var body: some ToolbarContent {
        // The title, and beside it the kernel's own button (#867): a
        // notebook window's toolbar has no system title or subtitle
        // (`.toolbar(removing: .title)` in `ContentView`), so this item
        // draws the title, with the save part under it only where there is
        // something to say ("Edited", "Locked: changed on disk"). The
        // kernel's state is on its button, not repeated here, and the full
        // status line stays in the button's help and popover.
        if let title {
            ToolbarItem(placement: .navigation) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.headline)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    if let note = header?.saveNote {
                        Text(note)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                // The toolbar's glass clips its item at the edge: room so
                // the title's first letter isn't cut off (#867).
                .padding(.horizontal, 8)
            }
            // A plain title over a caption, not two lines squeezed into the
            // toolbar's glass capsule.
            .sharedBackgroundVisibility(.hidden)
        }
        // The kernel's button: a toolbar button of its own, with a chevron,
        // so choosing a kernel is a plain target rather than small words
        // under the title (#867). A console or a folder keeps the system's
        // title, with the button beside it.
        ToolbarItem(placement: .navigation) {
            KernelPicker(page: page, panel: panel, place: place, header: header)
        }
        // Only while the notebook isn't trusted.
        if !page.state.trusted {
            ToolbarItem {
                Button { confirmTrust(page) } label: { Label("Trust", systemImage: "checkmark.shield") }
                    .help("Trust this notebook's HTML and JavaScript outputs")
                    .disabled(!page.state.hasNotebook)
            }
        }
        // Only while the notebook asks for something its grant doesn't give.
        if let wanted = page.state.accessWanted, !wanted.isEmpty {
            ToolbarItem {
                Button { page.run("notebook-access") } label: { Label("Access", systemImage: "lock.shield") }
                    .help("Notebook Access: this notebook asks for \(wanted.joined(separator: ", "))")
            }
        }
        // The view the header names (#819), only while a notebook is open.
        if page.state.hasNotebook {
            ToolbarItem {
                JournalViewPicker(page: page)
            }
        }
        // Run Cell with its run menu, and Interrupt: one group, so the pair
        // reads as one control and neither drifts from the other (#867).
        ToolbarItemGroup {
            RunCellMenu(page: page)
            Button { page.run("interrupt") } label: { Label("Interrupt", systemImage: "stop.fill") }
                .labelStyle(.titleAndIcon)
                .help("Interrupt the kernel (⌘.)")
                .disabled(!page.state.isBusy)
        }
        // Download, Export As and Publish, as in the File menu (#620): the
        // web toolbar that has them is hidden under native chrome.
        ToolbarItem {
            Menu {
                Button("Download Notebook…") { page.run("download") }
                Menu("Export As") {
                    Button("Markdown…") { page.run("export", arg: "markdown") }
                    Button("Script…") { page.run("export", arg: "script") }
                }
                .disabled(page.state.publish != true)
                Button("Publish as Web Page…") { page.run("publish") }
                    .disabled(page.state.publish != true)
            } label: {
                Label("Share", systemImage: "square.and.arrow.up")
            }
            .help("Download, export or publish the notebook")
            .disabled(!page.state.hasNotebook)
        }
        ToolbarItem {
            moreMenu
        }
    }

    /// The rest, in a fixed order. The journal toggle (#724) is first: the
    /// page's own button is under the app's chrome. Everything here is
    /// also in the menu bar, and Save is ⌘S.
    private var moreMenu: some View {
        Menu {
            Button { page.run("toggle-journal") } label: {
                Label(page.state.journalToggleTitle, systemImage: page.state.journalToggleSymbol)
            }
            .disabled(!page.state.hasNotebook)
            Divider()
            Button("Insert Code Cell") { page.run("insert-code") }
                .disabled(!page.state.editsCells)
            Button("Insert Markdown Cell") { page.run("insert-markdown") }
                .disabled(!page.state.editsCells)
            Picker("Cell Type", selection: cellType) {
                Text("Code").tag("code")
                Text("Markdown").tag("markdown")
                Text("Raw").tag("raw")
            }
            .pickerStyle(.inline)
            .disabled(!page.state.editsCells)
            Divider()
            Button("Save") { Task { await document.save() } }
                .disabled(document.file == nil)
        } label: {
            Label("More", systemImage: "ellipsis.circle")
        }
        .help("View as journal, insert a cell, change its type, save")
    }

    private var cellType: Binding<String> {
        Binding(
            get: { page.state.cellType ?? "code" },
            set: { page.run("cell-type", arg: $0) }
        )
    }
}

/// The status button (#241, #812, #867): the kernel's chip in the toolbar —
/// a dot, the kernel's name, where it runs and what it is doing, as
/// "TypeScript · This Mac · Idle" — and a popover with the status line's
/// full text, the file, the kernel's state and memory, Interrupt, Restart,
/// the Kernel Log, where kernels run and the kernels to change to. The
/// window's subtitle names only where the file is saved and can't be
/// clicked, so the rest is here, beside the title.
struct KernelPicker: View {
    var page: PageModel
    var panel: PanelController?
    var place: Place = .thisDevice
    var header: HeaderStatus?
    @State private var shown = false

    /// The widest state word, whose width the state part holds: a chip
    /// that grows with "Running" and shrinks to "Idle" would shift every
    /// item after it (#867). "Connecting" is wider than "Restarting"
    /// (69.7pt against 62.1pt in the system font at 13pt).
    private static let widestState = "Connecting"

    var body: some View {
        Button {
            shown.toggle()
        } label: {
            chip
        }
        .help(header?.full ?? page.state.kernelVersionLine ?? "The notebook's kernel")
        .accessibilityLabel(chipText)
        // The mark's words are the button's value, so the whole chip reads
        // as one control (#867): "TypeScript · This Mac · Idle, Kernel
        // idle, button". A console or a folder has no status line, so no
        // value.
        .modifier(ChipValue(label: dotLabel))
        .disabled(!page.state.hasNotebook)
        .popover(isPresented: $shown, arrowEdge: .bottom) {
            KernelPopover(page: page, panel: panel, place: place, header: header) { shown = false }
        }
    }

    /// The mark, the words, then a chevron that says the button opens the
    /// kernel's choices.
    private var chip: some View {
        HStack(spacing: 5) {
            mark
            HStack(spacing: 4) {
                Text(chipLead)
                    .lineLimit(1)
                if let state = chipState {
                    Text("·")
                    // Held to the widest state word's width, so idle, busy
                    // and idle again leave the items after the chip where
                    // they were.
                    ZStack(alignment: .leading) {
                        Text(KernelPicker.widestState).hidden()
                        Text(state).lineLimit(1)
                    }
                }
            }
            Image(systemName: "chevron.down")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
        }
    }

    /// The chip's mark in a fixed 10pt frame (#867): a 7pt dot while the
    /// kernel waits, a small spinner in its place while it works, a grey
    /// dot once it has stopped, and a warning triangle when it isn't
    /// installed. A console or a folder has no status line, so it keeps the
    /// neutral `cpu` symbol, with no state to read. The shape says which,
    /// not the colour, and the frame is the same for each, so the words
    /// after it don't move.
    private var mark: some View {
        Group {
            if header == nil {
                Image(systemName: "cpu")
            } else {
                switch markKind {
                case .working:
                    ProgressView()
                        .controlSize(.mini)
                        .tint(Color("Ready"))
                case .missing:
                    Image(systemName: "exclamationmark.triangle")
                case .idle, .stopped:
                    Circle()
                        .fill(markKind == .idle ? Color("Ready") : Color.secondary)
                        .frame(width: 7, height: 7)
                }
            }
        }
        .frame(width: 10, height: 10)
        // The button carries the words, including the mark's (#867).
        .accessibilityHidden(true)
    }

    /// A console has a kernel but no status line (`HeaderStatus.make` is
    /// for notebooks), so its chip names the kernel alone.
    private var chipLead: String { header?.chipLead ?? page.state.kernelDisplayName ?? "Kernel" }
    private var chipState: String? { header?.chipState }
    private var chipText: String { header?.chipText ?? chipLead }
    /// The mark's words, only where a status line gives them.
    private var dotLabel: String? { header?.dotLabel }

    private var markKind: HeaderStatus.ChipKind {
        if page.state.kernelMissing { return .missing }
        return header?.chipKind ?? .stopped
    }
}

/// The chip's mark's words as the button's value, when the window has a
/// status line (#867). A console or a folder has none to add, so the value
/// is left off rather than empty.
private struct ChipValue: ViewModifier {
    let label: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let label {
            content.accessibilityValue(label)
        } else {
            content
        }
    }
}

private struct KernelPopover: View {
    var page: PageModel
    let panel: PanelController?
    let place: Place
    let header: HeaderStatus?
    let dismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            statusSection
            kernelSection
        }
        .padding()
        .frame(minWidth: 260, maxWidth: 380, alignment: .leading)
        // The kernels' memory is read only while this shows.
        .onAppear { page.watchMemory(true) }
        .onDisappear { page.watchMemory(false) }
    }

    /// The status line in full, and the file it is about (#812).
    @ViewBuilder
    private var statusSection: some View {
        if let header {
            Text(header.full)
                .foregroundStyle(header.needsAttention ? Color.red : Color.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        if let path = page.state.path {
            VStack(alignment: .leading, spacing: 2) {
                Text("File").font(.caption).foregroundStyle(.secondary)
                Text(path).textSelection(.enabled)
            }
        }
        if header != nil || page.state.path != nil {
            Divider()
        }
    }

    private var kernelSection: some View {
        let state = page.state
        let session = state.sessions.first { $0.path == state.path }
        return VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(state.kernelDisplayName ?? "No kernel").font(.headline)
                Text(PageState.statusLabel(state.status)).foregroundStyle(.secondary)
                if let version = state.kernelVersionLine {
                    Text(version).foregroundStyle(.secondary)
                }
            }
            if let memory = session?.memoryLabel {
                LabeledContent("Memory", value: memory)
            }
            HStack {
                Button("Interrupt") { page.run("interrupt"); dismiss() }
                    .disabled(!state.isBusy)
                Button("Restart") { page.run("restart"); dismiss() }
                    .disabled(!state.hasKernel)
                Button("Kernel Log") { panel?.showLog(); dismiss() }
                    .disabled(panel == nil || state.kernelID == nil)
            }
            // Where every notebook's kernels run (#473): an advanced choice,
            // and this Mac's: not offered in a machine's window (#741).
            if place.allows(.kernelLocation) {
                Divider()
                KernelLocationPicker(running: state.sessions.count, title: "Runs On (advanced)")
                    .onChange(of: AppModel.shared.kernelRemoteID) { dismiss() }
            }
            if !state.kernels.isEmpty {
                Picker("Kernel", selection: Binding(
                    get: { state.kernel ?? "" },
                    set: { name in
                        page.run("change-kernel", arg: name)
                        dismiss()
                    }
                )) {
                    ForEach(state.kernels, id: \.name) { kernel in
                        Text(kernel.pickerName)
                            .accessibilityLabel(kernel.pickerLabel)
                            .tag(kernel.name)
                    }
                }
            }
            // The remote kernels run on, when it isn't answering (#832),
            // named for this window when it is a machine's (#740).
            if let line = state.notAnswering(machine: machine) {
                Text(line).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    /// The machine whose window this is (#740), when it is one.
    private var machine: String? { place.machineID.flatMap(AppModel.shared.machineName(_:)) }
}

/// Asks before trusting, as the page's own Trust button did.
@MainActor
func confirmTrust(_ page: PageModel) {
    let alert = NSAlert()
    alert.messageText = "Trust this notebook?"
    alert.informativeText = "Its HTML and JavaScript outputs will render in full and can run code in "
        + "this window. Only trust notebooks from people you trust."
    alert.addButton(withTitle: "Trust")
    alert.addButton(withTitle: "Cancel")
    if alert.runModal() == .alertFirstButtonReturn {
        page.run("trust")
    }
}

// MARK: - Menus

/// File > New Notebook (⌘N) and New Window (⌥⌘N).
struct NewCommands: View {
    var model: AppModel
    @FocusedValue(\.pageModel) private var page
    @FocusedValue(\.windowFolder) private var folder
    @FocusedValue(\.windowScope) private var scope
    @Environment(\.openWindow) private var openWindow

    /// What New Tab and New Window open: the front window's own place.
    private var newTarget: WindowTarget {
        WindowTarget.newTab(place: scope?.place, folder: folder, root: model.root)
    }

    var body: some View {
        // The menus exist before any window, so their `openWindow` lets
        // files opened at a cold launch get a window when SwiftUI made
        // none (#266).
        let _ = model.openRequests.useFallback { [openWindow] in openWindow(value: $0) }
        let _ = WorkspaceTabs.useOpener { [openWindow] in openWindow(id: $0) }
        Button("New Notebook") {
            if let page {
                // The window's folder on its own server: a machine's too.
                page.run("new-notebook", arg: scope?.serverFolder ?? FolderEntry.serverPath(folder ?? model.root))
            } else {
                openWindow(value: WindowTarget.folder(model.root))
            }
        }
        .keyboardShortcut("n")
        // A DuckDB prompt for this folder (#679), as a tab of its own with
        // a new engine (#729): the notebook in the front tab stays open.
        Button("New DuckDB Console") {
            openWindow(value: WindowTarget.console(folder: folder ?? model.root, id: UUID()))
        }
        // As before: not from a machine's window or with no window, which
        // have no `windowFolder` (a notebook window always sets it).
        .disabled(folder == nil)
        // A copy of the example notebooks in a new folder, with the first
        // open (#414).
        Button("Open Example Notebooks") {
            page?.run("open-examples", arg: scope?.serverFolder ?? FolderEntry.serverPath(folder ?? model.root))
        }
        .disabled(page == nil)
        // Always a new window, even when one already shows the folder.
        Button("New Tab") {
            WorkspaceTabs.open(target: newTarget, alone: false) { openWindow(id: $0) }
        }
        .keyboardShortcut("t")
        Button("New Window") {
            // A window of its own, not a tab of the front one (#247).
            WorkspaceTabs.open(target: newTarget, alone: true) { openWindow(id: $0) }
        }
        .keyboardShortcut("n", modifiers: [.command, .option])
    }
}

/// Asks for a new name, starting from `current`; nil when cancelled or
/// left empty.
@MainActor
func askName(for current: String) -> String? {
    let alert = NSAlert()
    alert.messageText = "Rename “\(current)”"
    alert.addButton(withTitle: "Rename")
    alert.addButton(withTitle: "Cancel")
    let field = NSTextField(string: current)
    field.frame = NSRect(x: 0, y: 0, width: 260, height: 24)
    alert.accessoryView = field
    alert.window.initialFirstResponder = field
    guard alert.runModal() == .alertFirstButtonReturn else { return nil }
    let name = field.stringValue.trimmingCharacters(in: .whitespaces)
    return name.isEmpty ? nil : name
}

/// File > Rename…: the open notebook, through the page's rename, which
/// saves first and keeps the kernel. The name is shown without `.ipynb`,
/// as the page's title shows it. In a console tab it names the console
/// (#735).
struct RenameCommand: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Button("Rename…") {
            guard let page else { return }
            if let console = page.state.console {
                if let name = askName(for: console.name) { page.run("rename", arg: name) }
                return
            }
            guard let path = page.state.path else { return }
            let title = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
            if let name = askName(for: title) { page.run("rename", arg: name) }
        }
        .disabled(page?.state.canRename != true)
    }
}

/// File > Download Notebook…, beside Save.
struct DownloadCommand: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Button("Download Notebook…") { page?.run("download") }
            .disabled(page?.state.hasNotebook != true)
    }
}

/// File > Export As > Markdown… and Script… (#582), from the server: Markdown
/// with images arrives as a zip.
struct ExportCommand: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Menu("Export As") {
            Button("Markdown…") { page?.run("export", arg: "markdown") }
            Button("Script…") { page?.run("export", arg: "script") }
        }
        .disabled(page?.state.hasNotebook != true || page?.state.publish != true)
    }
}

/// File > Publish as Web Page…, beside Download (#563): the page's sheet
/// takes the options, and the page arrives through the save panel.
struct PublishCommand: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Button("Publish as Web Page…") { page?.run("publish") }
            .disabled(page?.state.hasNotebook != true || page?.state.publish != true)
    }
}

/// View › View as Journal / Open as Notebook (#724): the open notebook's
/// journal view, or back to the notebook.
struct JournalCommand: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Button(page?.state.journalToggleTitle ?? "View as Journal") { page?.run("toggle-journal") }
            .disabled(page?.state.hasNotebook != true)
    }
}

/// View › Command Palette… (⇧⌘P): the page's palette of every command (#211).
/// The menu key is fixed: rebinding the palette on the page doesn't change it.
struct CommandPaletteCommand: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Button("Command Palette…") { page?.run("command-palette") }
            .keyboardShortcut("p", modifiers: [.command, .shift])
            .disabled(page == nil)
    }
}

/// The Cell menu. Keys the page already handles (⇧↩, A, B, M, DD, …) are
/// not menu shortcuts: a menu key equivalent would also fire while typing.
struct CellMenu: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Group {
            Button("Run Cell") { page?.run("run") }
            Button("Run All Cells") { page?.run("run-all") }
                .keyboardShortcut(.return, modifiers: [.command, .shift])
            Button("Run with Parameters…") { page?.run("run-with-params") }
                .disabled(page?.state.runParams != true)
            Button("Clear All Outputs") { page?.run("clear-outputs") }
            Divider()
            Button("Insert Cell Above") { page?.run("insert-above") }
            Button("Insert Cell Below") { page?.run("insert-below") }
            Button("Insert Markdown Cell Below") { page?.run("insert-markdown") }
            Divider()
            Picker("Cell Type", selection: cellType) {
                Text("Code").tag("code")
                Text("Markdown").tag("markdown")
                Text("Raw").tag("raw")
            }
            Divider()
            Button("Move Cell Up") { page?.run("move-up") }
            Button("Move Cell Down") { page?.run("move-down") }
            Button("Delete Cell") { page?.run("delete") }
            Divider()
            // Collapsing code (#564); the page binds ⌘⌥[ and ⌘⌥] in command mode.
            Button("Collapse Code") { page?.run("collapse-code") }
            Button("Expand Code") { page?.run("expand-code") }
            Button("Collapse All Code") { page?.run("collapse-all-code") }
            Button("Expand All Code") { page?.run("expand-all-code") }
            Divider()
            // Through the kernel's language service (#676); the page binds F12 and F2 by default.
            Button("Go to Definition") { page?.run("go-to-definition") }
            Button("Rename Symbol…") { page?.run("rename-symbol") }
            Divider()
            Button("Find in Notebook…") { page?.run("find") }
        }
        .disabled(page?.state.hasNotebook != true)
    }

    private var cellType: Binding<String> {
        Binding(
            get: { page?.state.cellType ?? "code" },
            set: { page?.run("cell-type", arg: $0) }
        )
    }
}

/// The Kernel menu.
struct KernelMenu: View {
    @FocusedValue(\.pageModel) private var page
    @FocusedValue(\.windowScope) private var scope

    /// The remote kernels run on, when it isn't answering (#832), named for
    /// this window when it is a machine's (#740).
    private var notAnswering: String? {
        page?.state.notAnswering(machine: scope?.place.machineID.flatMap(AppModel.shared.machineName(_:)))
    }

    /// Whether Change Kernel has anything to offer: a kernel, or the line
    /// that says why none came.
    private var offersKernels: Bool {
        page?.state.kernels.isEmpty == false || notAnswering != nil
    }

    var body: some View {
        // Which kernel runs, from its own reply (#693).
        if let version = page?.state.kernelVersionLine {
            Text(version)
            Divider()
        }
        Button("Interrupt") { page?.run("interrupt") }
            .keyboardShortcut(".")
            .disabled(page?.state.isBusy != true)
        Button("Restart") { page?.run("restart") }
            .disabled(page?.state.hasKernel != true)
        Button("Restart & Run All") { page?.run("restart-run-all") }
            .disabled(page?.state.editsCells != true)
        Button("Shut Down Other Kernels") { page?.run("shutdown-others") }
            .disabled(page?.state.otherSessions.isEmpty ?? true)
        Divider()
        Menu("Change Kernel") {
            ForEach(page?.state.kernels ?? [], id: \.name) { kernel in
                Button(kernel.pickerName) { page?.run("change-kernel", arg: kernel.name) }
                    .accessibilityLabel(kernel.pickerLabel)
            }
            // A remote that isn't answering (#832), named for this window
            // when it is a machine's (#740).
            if let notAnswering {
                Divider()
                Button(notAnswering) {}
                    .disabled(true)
            }
        }
        .disabled(page?.state.hasNotebook != true || !offersKernels)
        Divider()
        Button("Trust Notebook…") {
            if let page { confirmTrust(page) }
        }
        .disabled(page?.state.hasNotebook != true || page?.state.trusted != false)
        // What its cells may ask the server for (host API grants); the
        // page's sheet.
        Button("Notebook Access…") { page?.run("notebook-access") }
            .disabled(page?.state.hasNotebook != true || page?.state.hostGrants != true)
        // Where kernels run is a setting of the app, not the notebook
        // (#332), chosen here too (#473).
        // An advanced choice, since connected machines (places) are the
        // main way to use another machine (#701). It sets this Mac's
        // kernels, so a machine's window has no Advanced menu (#741).
        if scope?.place.allows(.kernelLocation) ?? true {
            Divider()
            Menu("Advanced") {
                KernelLocationPicker(running: page?.state.sessions.count)
                    .pickerStyle(.inline)
                Button("Manage Remotes…") { SettingsOpener.show(.remotes) }
            }
        }
    }
}
#endif
