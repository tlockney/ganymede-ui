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
    var page: PageModel
    let openFile: (String) -> Void
    @Environment(\.openWindow) private var openWindow
    /// Bumped to list the folders again after a change made here.
    @State private var generation = 0
    /// The expanded folders, kept per window across launches and while
    /// another navigator tab shows (#207).
    @SceneStorage("files.expanded") private var expanded = ""

    var body: some View {
        List {
            Section(folder.lastPathComponent.isEmpty ? folder.path : folder.lastPathComponent) {
                FolderContents(folder: folder, actions: actions, generation: generation)
            }
        }
        .listStyle(.sidebar)
        .contextMenu {
            Button("New Notebook") { page.run("new-notebook", arg: FolderEntry.serverPath(folder)) }
            Button("New Folder") { newFolder(in: folder) }
        }
        // A notebook made or saved by the page shows up, and so do changes
        // made outside the app when it comes back to the front.
        .onChange(of: page.state.path) { generation += 1 }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            generation += 1
        }
    }

    private var actions: FolderActions {
        FolderActions(
            openPath: page.state.path,
            isRunning: { page.state.isRunning($0) },
            isExpanded: { url in
                Binding(
                    get: { FolderEntry.expandedPaths(expanded).contains(url.path) },
                    set: { expanded = FolderEntry.expandedPaths(expanded, setting: url.path, to: $0) }
                )
            },
            open: open,
            openInNewTab: { openWindow(value: WindowTarget(opening: $0.url)) },
            newNotebook: { page.run("new-notebook", arg: FolderEntry.serverPath($0)) },
            newFolder: newFolder(in:),
            reveal: { NSWorkspace.shared.activateFileViewerSelecting([$0.url]) },
            rename: rename,
            duplicate: duplicate,
            trash: trash
        )
    }

    private func open(_ entry: FolderEntry) {
        if entry.isNotebook {
            page.run("open", arg: entry.serverPath)
        } else {
            openFile(entry.serverPath)
        }
    }

    private func newFolder(in parent: URL) {
        let fm = FileManager.default
        var url = parent.appendingPathComponent("untitled folder")
        var n = 2
        while fm.fileExists(atPath: url.path) {
            url = parent.appendingPathComponent("untitled folder \(n)")
            n += 1
        }
        do {
            try fm.createDirectory(at: url, withIntermediateDirectories: false)
            generation += 1
        } catch {
            NSAlert(error: error).runModal()
        }
    }

    private func rename(_ entry: FolderEntry) {
        // The open notebook renames through the page, which saves its
        // edits first and keeps its kernel.
        if !entry.isDirectory, page.state.path == entry.serverPath {
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
        let target = entry.url.deletingLastPathComponent().appendingPathComponent(name)
        do {
            try FileManager.default.moveItem(at: entry.url, to: target)
            generation += 1
            if let moved = FolderEntry.path(
                page.state.path, movedFrom: entry.serverPath, to: FolderEntry.serverPath(target)
            ) {
                page.run("open", arg: moved)
            }
        } catch {
            NSAlert(error: error).runModal()
        }
    }

    private func duplicate(_ entry: FolderEntry) {
        let fm = FileManager.default
        let target = FolderEntry.duplicateURL(for: entry.url) { fm.fileExists(atPath: $0.path) }
        do {
            try fm.copyItem(at: entry.url, to: target)
            generation += 1
        } catch {
            NSAlert(error: error).runModal()
        }
    }

    private func trash(_ entry: FolderEntry) {
        // The page would write the notebook back on its next save, so it
        // closes it, after asking.
        let holdsOpen = FolderEntry.path(page.state.path, isAt: entry.serverPath)
        if holdsOpen {
            let alert = NSAlert()
            alert.messageText = entry.isDirectory
                ? "“\(entry.name)” holds the open notebook."
                : "“\(entry.title)” is open in this window."
            alert.informativeText = page.state.dirty
                ? "It has unsaved changes. Move it to the Trash and close it without saving?"
                : "Move it to the Trash and close it?"
            alert.addButton(withTitle: "Move to Trash")
            alert.addButton(withTitle: "Cancel")
            guard alert.runModal() == .alertFirstButtonReturn else { return }
        }
        do {
            try FileManager.default.trashItem(at: entry.url, resultingItemURL: nil)
            generation += 1
            if holdsOpen { page.run("close") }
        } catch {
            NSAlert(error: error).runModal()
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
    var open: (FolderEntry) -> Void
    var openInNewTab: (FolderEntry) -> Void
    var newNotebook: (URL) -> Void
    var newFolder: (URL) -> Void
    var reveal: (FolderEntry) -> Void
    var rename: (FolderEntry) -> Void
    var duplicate: (FolderEntry) -> Void
    var trash: (FolderEntry) -> Void
}

/// One folder's items; a subfolder lists its own when it is expanded.
private struct FolderContents: View {
    let folder: URL
    let actions: FolderActions
    let generation: Int
    @State private var entries: [FolderEntry] = []
    @State private var error: String?

    var body: some View {
        Group {
            ForEach(entries) { entry in
                if entry.isDirectory {
                    DisclosureGroup(isExpanded: actions.isExpanded(entry.url)) {
                        FolderContents(folder: entry.url, actions: actions, generation: generation)
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
                            if entry.isNotebook, actions.isRunning(entry.serverPath) {
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
                    .buttonStyle(.plain)
                    .padding(.vertical, 1)
                    .listRowBackground(
                        entry.serverPath == actions.openPath
                            ? Color.accentColor.opacity(0.18) : Color.clear
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
            Button("Open in New Tab") { actions.openInNewTab(entry) }
            Button("New Notebook Here") { actions.newNotebook(entry.url) }
            Button("New Folder Here") { actions.newFolder(entry.url) }
        } else {
            Button("Open") { actions.open(entry) }
            if entry.isNotebook {
                Button("Open in New Tab") { actions.openInNewTab(entry) }
            }
        }
        Divider()
        Button("Rename…") { actions.rename(entry) }
        Button("Duplicate") { actions.duplicate(entry) }
        Button("Show in Finder") { actions.reveal(entry) }
        Divider()
        Button("Move to Trash") { actions.trash(entry) }
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
/// many kernels and terminals there are. A menu (#473): run kernels on
/// this Mac or a remote, open a terminal on a remote, manage remotes.
struct ServerLine: View {
    var page: PageModel
    /// The window's bottom panel, for terminals on remotes.
    var panel: PanelController?
    var model = AppModel.shared
    var terminals = OpenTerminals.shared

    var body: some View {
        let locations = model.kernelLocations
        Menu {
            KernelLocationPicker(model: model, running: page.state.sessions.count)
                .pickerStyle(.inline)
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
                    .fill(page.state.backend == nil ? Color.secondary : Color.green)
                    .frame(width: 7, height: 7)
                    .accessibilityHidden(true)
                Image(systemName: locations.selected == nil ? "laptopcomputer" : "server.rack")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                Text(locations.title)
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
        .accessibilityLabel("Kernels run on \(locations.title)")
    }

    private func helpText(_ locations: KernelLocations) -> String {
        var text = "Kernels run on \(locations.title)."
        if page.state.backend == nil { text += " Not connected." }
        return text + " Click to run them elsewhere or open a terminal on a remote."
    }
}

// MARK: - Toolbar

/// The notebook's controls, in the window's toolbar. Not customizable:
/// a customizable toolbar (`.toolbar(id:)`) joins every window's toolbar
/// into one AppKit family, and AppKit threw while syncing a new window's
/// items into the others when a notebook opened from the Finder (#226).
struct NotebookToolbar: ToolbarContent {
    var page: PageModel
    /// Saved as File > Save saves it, and enabled when that is.
    var document: PageDocument
    /// Where New Notebook puts it: the window's folder.
    let folder: URL
    /// The window's bottom panel, for the kernel popover's Kernel Log.
    var panel: PanelController?

    var body: some ToolbarContent {
        ToolbarItem(placement: .navigation) {
            Button {
                page.run("new-notebook", arg: FolderEntry.serverPath(folder))
            } label: {
                Label("New Notebook", systemImage: "square.and.pencil")
            }
            .help("New Notebook (⌘N)")
        }
        ToolbarItem {
            Button { Task { await document.save() } } label: { Label("Save", systemImage: "square.and.arrow.down") }
                .help("Save (⌘S)")
                .disabled(document.file == nil)
        }
        ToolbarItem {
            ControlGroup {
                Button { page.run("run") } label: { Label("Run", systemImage: "play.fill") }
                    .help("Run the selected cell and select the next (⇧↩)")
                Button { page.run("run-all") } label: { Label("Run All", systemImage: "forward.fill") }
                    .help("Run all cells")
            }
            .disabled(!page.state.hasNotebook)
        }
        ToolbarItem {
            ControlGroup {
                Button { page.run("interrupt") } label: { Label("Interrupt", systemImage: "stop.fill") }
                    .help("Interrupt the kernel (⌘.)")
                    .disabled(!page.state.isBusy)
                Button { page.run("restart") } label: {
                    Label("Restart", systemImage: "arrow.clockwise")
                }
                .help("Restart the kernel")
                .disabled(!page.state.hasKernel)
            }
        }
        ToolbarItem {
            Menu {
                Button("Code Cell") { page.run("insert-code") }
                Button("Markdown Cell") { page.run("insert-markdown") }
            } label: {
                Label("Insert Cell", systemImage: "plus.rectangle")
            }
            .help("Insert a cell below")
            .disabled(!page.state.hasNotebook)
        }
        ToolbarItem {
            Picker("Cell Type", selection: cellType) {
                Text("Code").tag("code")
                Text("Markdown").tag("markdown")
                Text("Raw").tag("raw")
            }
            .help("The selected cell's type")
            .disabled(!page.state.hasNotebook)
        }
        ToolbarItem {
            KernelPicker(page: page, panel: panel)
        }
        ToolbarItem {
            Button { confirmTrust(page) } label: { Label("Trust", systemImage: "checkmark.shield") }
                .help("Trust this notebook's HTML and JavaScript outputs")
                .disabled(!page.state.hasNotebook || page.state.trusted)
        }
        // Only while the notebook asks for something its grant doesn't give.
        if let wanted = page.state.accessWanted, !wanted.isEmpty {
            ToolbarItem {
                Button { page.run("notebook-access") } label: { Label("Access", systemImage: "lock.shield") }
                    .help("Notebook Access: this notebook asks for \(wanted.joined(separator: ", "))")
            }
        }
    }

    private var cellType: Binding<String> {
        Binding(
            get: { page.state.cellType ?? "code" },
            set: { page.run("cell-type", arg: $0) }
        )
    }
}

/// The notebook's kernel (#241): its name in the toolbar, and a popover
/// with its state and memory, Interrupt, Restart, the Kernel Log and the
/// kernels to change to.
struct KernelPicker: View {
    var page: PageModel
    var panel: PanelController?
    @State private var shown = false

    var body: some View {
        Button {
            shown.toggle()
        } label: {
            Label(page.state.kernelDisplayName ?? "Kernel", systemImage: "cpu")
        }
        .help("The notebook's kernel")
        .disabled(!page.state.hasNotebook)
        .popover(isPresented: $shown, arrowEdge: .bottom) {
            KernelPopover(page: page, panel: panel) { shown = false }
        }
    }
}

private struct KernelPopover: View {
    var page: PageModel
    let panel: PanelController?
    let dismiss: () -> Void

    var body: some View {
        let state = page.state
        let session = state.sessions.first { $0.path == state.path }
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(state.kernelDisplayName ?? "No kernel").font(.headline)
                Text(PageState.statusLabel(state.status)).foregroundStyle(.secondary)
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
            Divider()
            // Where every notebook's kernels run (#473).
            KernelLocationPicker(running: state.sessions.count, title: "Runs On")
                .onChange(of: AppModel.shared.kernelRemoteID) { dismiss() }
            if !state.kernels.isEmpty {
                Picker("Kernel", selection: Binding(
                    get: { state.kernel ?? "" },
                    set: { name in
                        page.run("change-kernel", arg: name)
                        dismiss()
                    }
                )) {
                    ForEach(state.kernels, id: \.name) { kernel in
                        Text(kernel.displayName).tag(kernel.name)
                    }
                }
            }
        }
        .padding()
        .frame(minWidth: 260)
        // The kernels' memory is read only while this shows.
        .onAppear { page.watchMemory(true) }
        .onDisappear { page.watchMemory(false) }
    }
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
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        // The menus exist before any window, so their `openWindow` lets
        // files opened at a cold launch get a window when SwiftUI made
        // none (#266).
        let _ = model.openRequests.useFallback { [openWindow] in openWindow(value: $0) }
        let _ = WorkspaceTabs.useOpener { [openWindow] in openWindow(id: $0) }
        Button("New Notebook") {
            if let page {
                page.run("new-notebook", arg: FolderEntry.serverPath(folder ?? model.root))
            } else {
                openWindow(value: WindowTarget.folder(model.root))
            }
        }
        .keyboardShortcut("n")
        // A copy of the example notebooks in a new folder, with the first
        // open (#414).
        Button("Open Example Notebooks") {
            page?.run("open-examples", arg: FolderEntry.serverPath(folder ?? model.root))
        }
        .disabled(page == nil)
        // Always a new window, even when one already shows the folder.
        Button("New Tab") {
            WorkspaceTabs.open(folder: folder ?? model.root, alone: false) { openWindow(id: $0) }
        }
        .keyboardShortcut("t")
        Button("New Window") {
            // A window of its own, not a tab of the front one (#247).
            WorkspaceTabs.open(folder: folder ?? model.root, alone: true) { openWindow(id: $0) }
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
/// as the page's title shows it.
struct RenameCommand: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Button("Rename…") {
            guard let page, let path = page.state.path else { return }
            let title = URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
            if let name = askName(for: title) { page.run("rename", arg: name) }
        }
        .disabled(page?.state.hasNotebook != true)
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

/// File > Publish as Web Page…, beside Download (#563): the page's sheet
/// takes the options, and the page arrives through the save panel.
struct PublishCommand: View {
    @FocusedValue(\.pageModel) private var page

    var body: some View {
        Button("Publish as Web Page…") { page?.run("publish") }
            .disabled(page?.state.hasNotebook != true || page?.state.publish != true)
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

    var body: some View {
        Button("Interrupt") { page?.run("interrupt") }
            .keyboardShortcut(".")
            .disabled(page?.state.isBusy != true)
        Button("Restart") { page?.run("restart") }
            .disabled(page?.state.hasKernel != true)
        Button("Shut Down Other Kernels") { page?.run("shutdown-others") }
            .disabled(page?.state.otherSessions.isEmpty ?? true)
        Divider()
        Menu("Change Kernel") {
            ForEach(page?.state.kernels ?? [], id: \.name) { kernel in
                Button(kernel.displayName) { page?.run("change-kernel", arg: kernel.name) }
            }
        }
        .disabled(page?.state.hasNotebook != true || (page?.state.kernels.isEmpty ?? true))
        Divider()
        Button("Trust Notebook…") {
            if let page { confirmTrust(page) }
        }
        .disabled(page?.state.hasNotebook != true || page?.state.trusted != false)
        // What its cells may ask the server for (host API grants); the
        // page's sheet.
        Button("Notebook Access…") { page?.run("notebook-access") }
            .disabled(page?.state.hasNotebook != true || page?.state.hostGrants != true)
        Divider()
        // Where kernels run is a setting of the app, not the notebook
        // (#332), chosen here too (#473).
        KernelLocationPicker(running: page?.state.sessions.count)
        Button("Manage Remotes…") { SettingsOpener.show(.remotes) }
    }
}
#endif
