import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    #if os(macOS)
    /// The notebook or folder this window shows, following the page; nil
    /// for a window opened on nothing, until its page opens a notebook.
    @Binding var target: WindowTarget?
    /// What the page was loaded for. A window opened on nothing keeps the
    /// folder that was the default then, so a later Open Folder… (which
    /// changes the default) leaves it alone.
    @State private var loaded: WindowTarget
    /// The folder the sidebar lists and New Notebook uses. It stays put
    /// when the page opens a notebook in a subfolder, which moves `target`.
    @State private var sidebarRoot: URL
    @Environment(\.openWindow) private var openWindow
    /// The open notebook's file and unsaved edits, as the page reports them.
    @StateObject private var document = PageDocument()
    /// What the page shows, for the native toolbar and menus (#205).
    @StateObject private var pageModel = PageModel()
    /// This window, for the Finder's open requests (#228).
    @State private var windowID = UUID()

    init(target: Binding<WindowTarget?>) {
        _target = target
        let loaded = target.wrappedValue ?? .folder(AppModel.shared.root)
        _loaded = State(initialValue: loaded)
        _sidebarRoot = State(initialValue: loaded.folder)
    }
    #endif
    #if os(iOS)
    @Environment(\.scenePhase) private var phase
    @Environment(\.openWindow) private var openWindow
    @State private var picking = false
    @State private var settings = false
    /// A terminal shown full screen, where the app has one scene.
    @State private var terminal: TerminalRequest?
    /// A text file being edited full screen, where the app has one scene.
    @State private var editing: EditorRequest?
    /// What the page shows, for the native toolbar and menus (#205).
    @StateObject private var pageModel = PageModel()
    /// The iPad's sidebar and notebook columns (#208).
    @State private var columns = NavigationSplitViewVisibility.automatic
    #endif

    var body: some View {
        #if os(macOS)
        // The app draws the sidebar, toolbar and menus; the page shows the
        // notebook (#206, #207).
        NavigationSplitView {
            FolderSidebar(folder: sidebarRoot, page: pageModel) { path in
                openWindow(value: EditorRequest(path: path))
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 240, max: 400)
        } detail: {
            content
        }
        .toolbar {
            NotebookToolbar(page: pageModel, document: document, folder: sidebarRoot)
        }
        .navigationSubtitle(pageModel.state.subtitle)
        .frame(minWidth: 720, minHeight: 480)
        .navigationTitle((target ?? loaded).title)
        .focusedSceneValue(\.windowFolder, sidebarRoot)
        // Notebooks opened from the Finder (#228): the first window to see
        // them takes them. Each opens in its own window (or brings forward
        // the one showing it), except that the window the app opened on
        // nothing at launch shows the first itself. Later, so the change
        // to `pending` is not made while views update.
        .onReceive(model.openRequests.$pending) { pending in
            guard !pending.isEmpty else { return }
            DispatchQueue.main.async(execute: takeOpenRequests)
        }
        .onAppear {
            model.openRequests.register(windowID, blank: target == nil)
            model.openRequests.openWindow = { [openWindow] in openWindow(value: $0) }
        }
        .onChange(of: target) { target in
            model.openRequests.register(windowID, blank: target == nil)
        }
        .onDisappear { model.openRequests.unregister(windowID) }
        .background(WindowReader { document.attach(to: $0) })
        // Notebook windows are tabs too (#247).
        .workspaceTab()
        .focusedSceneObject(document)
        .focusedSceneObject(pageModel)
        #else
        Group {
            if drawsNativeChrome {
                // The iPad draws the sidebar and toolbar; the page shows the
                // notebook (#208).
                GeometryReader { window in
                    NavigationSplitView(columnVisibility: $columns) {
                        IPadSidebar(folder: model.root, page: pageModel, openFile: openEditor) {
                            // In portrait the sidebar covers the notebook:
                            // it gets out of the way once one is opened.
                            if window.size.width < window.size.height { columns = .detailOnly }
                        }
                    } detail: {
                        NavigationStack { notebook }
                    }
                    // Back in landscape, the sidebar shows again by default.
                    .onChange(of: window.size.width > window.size.height) { landscape in
                        if landscape { columns = .automatic }
                    }
                }
            } else {
                NavigationStack { notebook }
            }
        }
        .focusedSceneObject(pageModel)
        .sheet(isPresented: $settings) {
            NavigationStack {
                RemotesView()
                    .navigationTitle("Remotes")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { settings = false }
                        }
                    }
            }
            .environmentObject(model)
        }
        .fullScreenCover(item: $terminal) { request in
            NavigationStack {
                TerminalWindow(target: request.target)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { terminal = nil }
                        }
                    }
            }
            .environmentObject(model)
        }
        .fullScreenCover(item: $editing) { request in
            NavigationStack {
                EditorWindow(request: request) { editing = nil }
            }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { result in
            if case .success(let folder) = result {
                model.open(folder: folder)
            }
        }
        .onChange(of: phase) { phase in
            if phase == .active {
                Task { await model.resume() }
            }
        }
        #endif
    }

    #if os(macOS)
    private func takeOpenRequests() {
        let (shown, others) = model.openRequests.take(blank: target == nil)
        if let shown {
            target = shown
            loaded = shown
            sidebarRoot = shown.folder
        }
        for other in others {
            openWindow(value: other)
        }
    }

    private var page: URL? { model.page(for: loaded) }

    /// The page opened another notebook, or closed it: the window now
    /// shows that, for its title and for the Finder's later opens. The page
    /// stays as it is.
    private func follow(_ url: URL?) {
        guard let url else { return }
        if let shown = WindowTarget(page: url) {
            if shown != target { target = shown }
        } else if case .file(let file) = target {
            target = .folder(file.deletingLastPathComponent())
        }
    }
    #else
    private var page: URL? { model.url }

    /// The page with its navigation bar: one title, the notebook's on the
    /// iPad, and the app's own buttons beside the notebook's.
    private var notebook: some View {
        content
            .ignoresSafeArea(.container, edges: .bottom)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if drawsNativeChrome {
                    // The title over the kernel and its state, which the
                    // page's own toolbar showed (the Mac's window subtitle).
                    ToolbarItem(placement: .principal) {
                        VStack(spacing: 0) {
                            Text(title).font(.headline).lineLimit(1)
                            if !pageModel.state.subtitle.isEmpty {
                                Text(pageModel.state.subtitle)
                                    .font(.caption)
                                    .foregroundStyle(pageModel.state.kernelMissing ? AnyShapeStyle(Color.red) : AnyShapeStyle(.secondary))
                                    .lineLimit(1)
                            }
                        }
                    }
                    IPadNotebookToolbar(page: pageModel)
                }
                ToolbarItemGroup(placement: .primaryAction) {
                    TerminalMenu(model: model) { request in
                        // A scene of its own beside the notebook on iPad,
                        // full screen where there is one scene (iPhone).
                        if UIApplication.shared.supportsMultipleScenes {
                            openWindow(value: request)
                        } else {
                            terminal = request
                        }
                    }
                    Button {
                        settings = true
                    } label: {
                        Label("Remotes", systemImage: "server.rack")
                    }
                    Button {
                        picking = true
                    } label: {
                        Label("Open Folder", systemImage: "folder")
                    }
                }
            }
    }

    private var title: String {
        if drawsNativeChrome, let path = pageModel.state.path {
            return URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        }
        return model.root.lastPathComponent
    }

    /// A text file from the sidebar: beside the notebook on iPad, full
    /// screen on iPhone.
    private func openEditor(_ path: String) {
        let request = EditorRequest(path: path)
        if UIApplication.shared.supportsMultipleScenes {
            openWindow(value: request)
        } else {
            editing = request
        }
    }
    #endif

    private var content: some View {
        Group {
            if let url = page {
                #if os(macOS)
                WebView(url: url, onNavigate: follow, document: document, page: pageModel) { path in
                    openWindow(value: EditorRequest(path: path))
                }
                #else
                WebView(url: url, page: pageModel, onOpenFile: openEditor)
                #endif
            } else if let error = model.error {
                VStack(spacing: 12) {
                    Text("Ganymede could not start").font(.headline)
                    Text(error)
                        .textSelection(.enabled)
                        .multilineTextAlignment(.center)
                    Button("Try Again") { model.start() }
                }
                .padding()
            } else {
                ProgressView()
            }
        }
        .task { model.startIfNeeded() }
        .alert(
            "Remotes",
            isPresented: Binding(
                get: { model.keychainError != nil },
                set: { if !$0 { model.keychainError = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.keychainError ?? "")
        }
    }
}
