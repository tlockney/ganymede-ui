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
    @ObservedObject var page: PageModel
    let openFile: (String) -> Void
    @Environment(\.openWindow) private var openWindow
    /// Bumped to list the folders again after a change made here.
    @State private var generation = 0

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
        .onChange(of: page.state.path) { _ in generation += 1 }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            generation += 1
        }
    }

    private var actions: FolderActions {
        FolderActions(
            openPath: page.state.path,
            isRunning: { page.state.isRunning($0) },
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
                    DisclosureGroup {
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
    @ObservedObject var page: PageModel

    var body: some View {
        List {
            ForEach(page.state.sessions) { session in
                Button {
                    page.run("open", arg: session.path)
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
                .buttonStyle(.plain)
                .help(session.path + (session.state.map { " · " + PageState.statusLabel($0) } ?? ""))
                .contextMenu {
                    Button("Open") { page.run("open", arg: session.path) }
                    Divider()
                    Button("Shut Down Kernel") { page.run("shutdown-kernel", arg: session.id) }
                }
            }
        }
        .listStyle(.sidebar)
        .overlay {
            if page.state.sessions.isEmpty {
                Text("No kernels running").foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Toolbar

/// The notebook's controls, in the window's toolbar. Not customizable:
/// a customizable toolbar (`.toolbar(id:)`) joins every window's toolbar
/// into one AppKit family, and AppKit threw while syncing a new window's
/// items into the others when a notebook opened from the Finder (#226).
struct NotebookToolbar: ToolbarContent {
    @ObservedObject var page: PageModel
    /// Saved as File > Save saves it, and enabled when that is.
    @ObservedObject var document: PageDocument
    /// Where New Notebook puts it: the window's folder.
    let folder: URL

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
            KernelPicker(page: page)
        }
        ToolbarItem {
            Button { confirmTrust(page) } label: { Label("Trust", systemImage: "checkmark.shield") }
                .help("Trust this notebook's HTML and JavaScript outputs")
                .disabled(!page.state.hasNotebook || page.state.trusted)
        }
    }

    private var cellType: Binding<String> {
        Binding(
            get: { page.state.cellType ?? "code" },
            set: { page.run("cell-type", arg: $0) }
        )
    }
}

/// Which kernel the notebook uses.
struct KernelPicker: View {
    @ObservedObject var page: PageModel

    var body: some View {
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
        .help("Change the kernel")
        .disabled(!page.state.hasNotebook || page.state.kernels.isEmpty)
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
    @ObservedObject var model: AppModel
    @FocusedObject private var page: PageModel?
    @FocusedValue(\.windowFolder) private var folder
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        // The menus exist before any window, so their `openWindow` lets
        // files opened at a cold launch get a window when SwiftUI made
        // none (#266).
        let _ = model.openRequests.useFallback { [openWindow] in openWindow(value: $0) }
        Button("New Notebook") {
            if let page {
                page.run("new-notebook", arg: FolderEntry.serverPath(folder ?? model.root))
            } else {
                openWindow(value: WindowTarget.folder(model.root))
            }
        }
        .keyboardShortcut("n")
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
    @FocusedObject private var page: PageModel?

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
    @FocusedObject private var page: PageModel?

    var body: some View {
        Button("Download Notebook…") { page?.run("download") }
            .disabled(page?.state.hasNotebook != true)
    }
}

/// View › Command Palette… (⇧⌘P): the page's palette of every command (#211).
/// The menu key is fixed: rebinding the palette on the page doesn't change it.
struct CommandPaletteCommand: View {
    @FocusedObject private var page: PageModel?

    var body: some View {
        Button("Command Palette…") { page?.run("command-palette") }
            .keyboardShortcut("p", modifiers: [.command, .shift])
            .disabled(page == nil)
    }
}

/// The Cell menu. Keys the page already handles (⇧↩, A, B, M, DD, …) are
/// not menu shortcuts: a menu key equivalent would also fire while typing.
struct CellMenu: View {
    @FocusedObject private var page: PageModel?

    var body: some View {
        Group {
            Button("Run Cell") { page?.run("run") }
            Button("Run All Cells") { page?.run("run-all") }
                .keyboardShortcut(.return, modifiers: [.command, .shift])
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
    @FocusedObject private var page: PageModel?

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
    }
}
#endif
