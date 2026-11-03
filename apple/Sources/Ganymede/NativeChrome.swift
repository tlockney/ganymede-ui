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
        // A notebook made or saved by the page shows up.
        .onChange(of: page.state.path) { _ in generation += 1 }
    }

    private var actions: FolderActions {
        FolderActions(
            openPath: page.state.path,
            open: open,
            openInNewWindow: { openWindow(value: WindowTarget(opening: $0.url)) },
            newNotebook: { page.run("new-notebook", arg: FolderEntry.serverPath($0)) },
            newFolder: newFolder(in:),
            reveal: { NSWorkspace.shared.activateFileViewerSelecting([$0.url]) },
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

    private func trash(_ entry: FolderEntry) {
        do {
            try FileManager.default.trashItem(at: entry.url, resultingItemURL: nil)
            generation += 1
        } catch {
            NSAlert(error: error).runModal()
        }
    }
}

/// What a sidebar row can do, handed down the tree.
struct FolderActions {
    var openPath: String?
    var open: (FolderEntry) -> Void
    var openInNewWindow: (FolderEntry) -> Void
    var newNotebook: (URL) -> Void
    var newFolder: (URL) -> Void
    var reveal: (FolderEntry) -> Void
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
                        Label(entry.title, systemImage: entry.isNotebook ? "book.pages" : "doc.text")
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
            Button("Open in New Window") { actions.openInNewWindow(entry) }
            Button("New Notebook Here") { actions.newNotebook(entry.url) }
            Button("New Folder Here") { actions.newFolder(entry.url) }
        } else {
            Button("Open") { actions.open(entry) }
            if entry.isNotebook {
                Button("Open in New Window") { actions.openInNewWindow(entry) }
            }
        }
        Divider()
        Button("Show in Finder") { actions.reveal(entry) }
        Divider()
        Button("Move to Trash") { actions.trash(entry) }
    }
}

// MARK: - Toolbar

/// The notebook's controls, in the window's toolbar.
struct NotebookToolbar: CustomizableToolbarContent {
    @ObservedObject var page: PageModel
    /// Where New Notebook puts it: the window's folder.
    let folder: URL

    var body: some CustomizableToolbarContent {
        ToolbarItem(id: "new-notebook", placement: .navigation) {
            Button {
                page.run("new-notebook", arg: FolderEntry.serverPath(folder))
            } label: {
                Label("New Notebook", systemImage: "square.and.pencil")
            }
            .help("New Notebook (⌘N)")
        }
        ToolbarItem(id: "run") {
            ControlGroup {
                Button { page.run("run") } label: { Label("Run", systemImage: "play.fill") }
                    .help("Run the selected cell and select the next (⇧↩)")
                Button { page.run("run-all") } label: { Label("Run All", systemImage: "forward.fill") }
                    .help("Run all cells")
            }
            .disabled(!page.state.hasNotebook)
        }
        ToolbarItem(id: "kernel-control") {
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
        ToolbarItem(id: "insert") {
            Menu {
                Button("Code Cell") { page.run("insert-code") }
                Button("Markdown Cell") { page.run("insert-markdown") }
            } label: {
                Label("Insert Cell", systemImage: "plus.rectangle")
            }
            .help("Insert a cell below")
            .disabled(!page.state.hasNotebook)
        }
        ToolbarItem(id: "cell-type") {
            Picker("Cell Type", selection: cellType) {
                Text("Code").tag("code")
                Text("Markdown").tag("markdown")
                Text("Raw").tag("raw")
            }
            .help("The selected cell's type")
            .disabled(!page.state.hasNotebook)
        }
        ToolbarItem(id: "kernel") {
            KernelPicker(page: page)
        }
        ToolbarItem(id: "trust") {
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
        Button("New Notebook") {
            if let page {
                page.run("new-notebook", arg: FolderEntry.serverPath(folder ?? model.root))
            } else {
                openWindow(value: WindowTarget.folder(model.root))
            }
        }
        .keyboardShortcut("n")
        Button("New Window") {
            openWindow(value: WindowTarget.folder(folder ?? model.root))
        }
        .keyboardShortcut("n", modifiers: [.command, .option])
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
